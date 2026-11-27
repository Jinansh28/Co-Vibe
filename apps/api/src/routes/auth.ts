import { Hono } from 'hono';
import { z } from 'zod';
import type { Env } from '../middleware/auth.js';
import { getGithubTokenService } from '../services/githubTokenService.js';

export const authRoutes = new Hono<Env>();

const GithubCallbackBodySchema = z.object({
  code: z.string().trim().min(1, 'Authorization code is required'),
  redirectUri: z.string().url().optional(),
});

authRoutes.get('/me', (c) => {
  const user = c.get('authUser');
  return c.json({ user });
});

authRoutes.get('/verify', (c) => {
  const user = c.get('authUser');
  return c.json({
    status: 'authenticated',
    user,
  });
});

authRoutes.get('/github/authorize', (c) => {
  const clientId =
    c.env?.GITHUB_CLIENT_ID ||
    (typeof process !== 'undefined' ? process.env?.GITHUB_CLIENT_ID : undefined);

  if (!clientId) {
    return c.json(
      {
        error: 'Service Unavailable',
        message: 'GitHub OAuth is not configured on this server',
      },
      503
    );
  }

  const redirectUri = c.req.query('redirectUri');
  const state = c.req.query('state') || crypto.randomUUID();
  const params = new URLSearchParams({
    client_id: clientId,
    scope: 'repo read:user',
    state,
  });
  if (redirectUri) {
    params.set('redirect_uri', redirectUri);
  }

  return c.json({
    url: `https://github.com/login/oauth/authorize?${params.toString()}`,
    state,
  });
});

authRoutes.post('/github/callback', async (c) => {
  const authUser = c.get('authUser');
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Bad Request', message: 'Invalid JSON payload' }, 400);
  }

  const parsed = GithubCallbackBodySchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      {
        error: 'Bad Request',
        message: parsed.error.errors[0]?.message || 'Validation failed',
      },
      400
    );
  }

  const clientId =
    c.env?.GITHUB_CLIENT_ID ||
    (typeof process !== 'undefined' ? process.env?.GITHUB_CLIENT_ID : undefined);
  const clientSecret =
    c.env?.GITHUB_CLIENT_SECRET ||
    (typeof process !== 'undefined' ? process.env?.GITHUB_CLIENT_SECRET : undefined);

  if (!clientId || !clientSecret) {
    return c.json(
      {
        error: 'Service Unavailable',
        message: 'GitHub OAuth credentials are not configured',
      },
      503
    );
  }

  const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      code: parsed.data.code,
      ...(parsed.data.redirectUri ? { redirect_uri: parsed.data.redirectUri } : {}),
    }),
  });

  if (!tokenRes.ok) {
    return c.json(
      {
        error: 'Bad Gateway',
        message: 'Failed to exchange GitHub authorization code',
      },
      502
    );
  }

  const tokenData = (await tokenRes.json()) as {
    access_token?: string;
    scope?: string;
    error?: string;
    error_description?: string;
  };

  if (!tokenData.access_token) {
    return c.json(
      {
        error: 'Bad Request',
        message: tokenData.error_description || tokenData.error || 'GitHub OAuth token exchange failed',
      },
      400
    );
  }

  let githubUsername: string | undefined;
  try {
    const userRes = await fetch('https://api.github.com/user', {
      headers: {
        Authorization: `Bearer ${tokenData.access_token}`,
        Accept: 'application/vnd.github+json',
        'User-Agent': 'co-vibe-worker',
      },
    });
    if (userRes.ok) {
      const ghUser = (await userRes.json()) as { login?: string };
      githubUsername = ghUser.login;
    }
  } catch {
    // Non-fatal: username metadata lookup failed
  }

  const email = authUser.email || `${authUser.sub}@co-vibe.dev`;
  const service = getGithubTokenService(c.env);
  try {
    const status = await service.saveToken(
      authUser.sub,
      email,
      {
        accessToken: tokenData.access_token,
        githubUsername,
        scope: tokenData.scope,
      },
      c.env
    );

    return c.json({
      ok: true,
      connected: status.connected,
      githubUsername: status.githubUsername,
      scope: status.scope,
    });
  } catch (err) {
    return c.json(
      {
        error: 'Internal Server Error',
        message: err instanceof Error ? err.message : 'Failed to store GitHub connection',
      },
      500
    );
  }
});

authRoutes.get('/github/status', async (c) => {
  const authUser = c.get('authUser');
  const service = getGithubTokenService(c.env);
  const status = await service.getStatus(authUser.sub);
  return c.json(status);
});

authRoutes.delete('/github', async (c) => {
  const authUser = c.get('authUser');
  const service = getGithubTokenService(c.env);
  await service.deleteToken(authUser.sub);
  return c.json({ ok: true, connected: false });
});
