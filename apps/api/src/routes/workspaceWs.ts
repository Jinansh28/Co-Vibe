import { Hono } from 'hono';
import {
  resolveJwtSecret,
  verifyAuthToken,
  type Env,
} from '../middleware/auth.js';
import { getProjectService } from '../services/projectService.js';

export const workspaceWsRoutes = new Hono<Env>();

// GET /api/v1/workspaces/:id/room
// This route is intentionally mounted OUTSIDE the authMiddleware chain because
// browser WebSocket APIs cannot send custom Authorization headers. Instead, the
// access token is passed as the ?token= query parameter and verified inline
// (via Supabase /auth/v1/user introspection when configured, or fail-closed JWT
// verification otherwise), followed by workspace/project RBAC verification.
workspaceWsRoutes.get('/:id/room', async (c) => {
  const token = c.req.query('token');
  if (!token) {
    return c.text('Missing token', 401);
  }

  const supabaseUrl =
    c.env?.SUPABASE_URL ||
    (typeof process !== 'undefined' ? process.env?.SUPABASE_URL : undefined);
  const serviceRoleKey =
    c.env?.SUPABASE_SERVICE_ROLE_KEY ||
    (typeof process !== 'undefined' ? process.env?.SUPABASE_SERVICE_ROLE_KEY : undefined);

  let authUserId: string | undefined;

  if (supabaseUrl && serviceRoleKey) {
    let userRes: Response;
    try {
      userRes = await fetch(`${supabaseUrl}/auth/v1/user`, {
        headers: {
          Authorization: `Bearer ${token}`,
          apikey: serviceRoleKey,
        },
      });
    } catch {
      return c.text('Authentication service unavailable', 503);
    }

    if (!userRes.ok) {
      return c.text('Invalid or expired token', 401);
    }

    try {
      const userData = (await userRes.json()) as { id?: string; sub?: string } | null;
      authUserId = userData?.id || userData?.sub;
    } catch {
      return c.text('Invalid or expired token', 401);
    }

    if (!authUserId) {
      return c.text('Invalid or expired token', 401);
    }
  } else {
    const secretResolution = resolveJwtSecret('supabase', c.env);
    if (!secretResolution.ok) {
      return c.text('Server authentication configuration error', 500);
    }

    try {
      const payload = await verifyAuthToken(token, supabaseUrl, secretResolution.secret);
      authUserId = payload?.sub;
    } catch {
      return c.text('Invalid or expired token', 401);
    }

    if (!authUserId) {
      return c.text('Invalid or expired token', 401);
    }
  }

  const id = c.req.param('id');
  const membership = await getProjectService(c.env).checkWorkspaceMembership(id, authUserId);

  if (membership.status === 'invalid_id') {
    return c.text('Invalid workspace ID', 400);
  }

  if (membership.status === 'not_found') {
    return c.text('Workspace not found', 404);
  }

  if (membership.status === 'forbidden') {
    return c.text('Forbidden', 403);
  }

  const upgradeHeader = c.req.header('Upgrade');
  if (upgradeHeader !== 'websocket') {
    return c.text('Expected Upgrade: websocket', 426);
  }

  const DO = c.env?.WORKSPACE_ROOM;
  if (!DO) {
    return c.text('Durable Object not bound', 500);
  }

  const doId = DO.idFromName(id);
  const stub = DO.get(doId);

  return stub.fetch(c.req.raw);
});
