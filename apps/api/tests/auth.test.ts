import { describe, it, expect } from 'vitest';
import { sign } from 'hono/jwt';
import app from '../src/index.js';

const SECRET = 'dev-secret-key-change-in-prod';

describe('Worker JWT Authentication Middleware', () => {
  it('returns 401 Unauthorized when no token is provided', async () => {
    const res = await app.request('/api/v1/auth/me');
    expect(res.status).toBe(401);

    const body = (await res.json()) as Record<string, any>;
    expect(body.error).toBe('Unauthorized');
    expect(body.message).toBe('Missing authentication token');
  });

  it('returns 401 Unauthorized for malformed or invalid token', async () => {
    const res = await app.request('/api/v1/auth/me', {
      headers: {
        Authorization: 'Bearer invalid.token.payload',
      },
    });
    expect(res.status).toBe(401);

    const body = (await res.json()) as Record<string, any>;
    expect(body.error).toBe('Unauthorized');
    expect(body.message).toBe('Invalid or expired token');
  });

  it('returns 401 Unauthorized for token signed with wrong secret', async () => {
    const token = await sign(
      { sub: 'user-123', email: 'test@example.com', exp: Math.floor(Date.now() / 1000) + 3600 },
      'wrong-secret',
      'HS256'
    );
    const res = await app.request('/api/v1/auth/me', {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    expect(res.status).toBe(401);

    const body = (await res.json()) as Record<string, any>;
    expect(body.error).toBe('Unauthorized');
    expect(body.message).toBe('Invalid or expired token');
  });

  it('returns 401 Unauthorized for expired token', async () => {
    const token = await sign(
      { sub: 'user-123', email: 'test@example.com', exp: Math.floor(Date.now() / 1000) - 3600 },
      SECRET,
      'HS256'
    );
    const res = await app.request('/api/v1/auth/me', {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    expect(res.status).toBe(401);

    const body = (await res.json()) as Record<string, any>;
    expect(body.error).toBe('Unauthorized');
    expect(body.message).toBe('Invalid or expired token');
  });

  it('returns 200 OK and populates authUser for valid Bearer token', async () => {
    const payload = {
      sub: 'usr_12345',
      email: 'dev@co-vibe.dev',
      role: 'authenticated',
      exp: Math.floor(Date.now() / 1000) + 3600,
    };
    const token = await sign(payload, SECRET, 'HS256');

    const res = await app.request('/api/v1/auth/me', {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    expect(res.status).toBe(200);

    const body = (await res.json()) as Record<string, any>;
    expect(body.user).toBeDefined();
    expect(body.user.sub).toBe('usr_12345');
    expect(body.user.email).toBe('dev@co-vibe.dev');
  });

  it('returns 200 OK and populates authUser for valid token in cookie', async () => {
    const payload = {
      sub: 'usr_67890',
      email: 'cookie@co-vibe.dev',
      exp: Math.floor(Date.now() / 1000) + 3600,
    };
    const token = await sign(payload, SECRET, 'HS256');

    const res = await app.request('/api/v1/auth/me', {
      headers: {
        Cookie: `sb-access-token=${token}`,
      },
    });
    expect(res.status).toBe(200);

    const body = (await res.json()) as Record<string, any>;
    expect(body.user).toBeDefined();
    expect(body.user.sub).toBe('usr_67890');
    expect(body.user.email).toBe('cookie@co-vibe.dev');
  });

  it('returns 200 OK on GET /api/v1/auth/verify with valid token', async () => {
    const payload = {
      sub: 'usr_12345',
      email: 'dev@co-vibe.dev',
      exp: Math.floor(Date.now() / 1000) + 3600,
    };
    const token = await sign(payload, SECRET, 'HS256');

    const res = await app.request('/api/v1/auth/verify', {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    expect(res.status).toBe(200);

    const body = (await res.json()) as Record<string, any>;
    expect(body.status).toBe('authenticated');
    expect(body.user.sub).toBe('usr_12345');
  });
});
