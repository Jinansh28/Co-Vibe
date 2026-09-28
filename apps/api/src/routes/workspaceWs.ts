import { Hono } from 'hono';
import type { Env } from '../middleware/auth.js';

export const workspaceWsRoutes = new Hono<Env>();

// GET /api/v1/workspaces/:id/room
// This route is intentionally mounted OUTSIDE the authMiddleware chain because
// browser WebSocket APIs cannot send custom Authorization headers. Instead, the
// Supabase access token is passed as the ?token= query parameter and verified
// inline here via the Supabase /auth/v1/user introspection endpoint.
workspaceWsRoutes.get('/:id/room', async (c) => {
  const token = c.req.query('token');
  if (!token) {
    return c.text('Missing token', 401);
  }

  // Verify the token via Supabase user introspection.
  // This correctly handles ES256 user JWTs without requiring local key management.
  const supabaseUrl =
    c.env?.SUPABASE_URL ||
    (typeof process !== 'undefined' ? process.env?.SUPABASE_URL : undefined);
  const serviceRoleKey =
    (c.env as any)?.SUPABASE_SERVICE_ROLE_KEY ||
    (typeof process !== 'undefined' ? process.env?.SUPABASE_SERVICE_ROLE_KEY : undefined);

  if (supabaseUrl && serviceRoleKey) {
    try {
      const userRes = await fetch(`${supabaseUrl}/auth/v1/user`, {
        headers: {
          Authorization: `Bearer ${token}`,
          apikey: serviceRoleKey,
        },
      });
      if (!userRes.ok) {
        return c.text('Invalid or expired token', 401);
      }
    } catch {
      return c.text('Authentication service unavailable', 503);
    }
  }
  // If Supabase URL/key are not configured (e.g. unit tests), skip introspection

  const upgradeHeader = c.req.header('Upgrade');
  if (upgradeHeader !== 'websocket') {
    return c.text('Expected Upgrade: websocket', 426);
  }

  const DO = c.env?.WORKSPACE_ROOM;
  if (!DO) {
    return c.text('Durable Object not bound', 500);
  }

  const id = c.req.param('id');
  const doId = DO.idFromName(id);
  const stub = DO.get(doId);

  return stub.fetch(c.req.raw);
});
