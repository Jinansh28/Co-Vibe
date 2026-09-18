import { describe, it, expect } from 'vitest';
import { sign } from 'hono/jwt';
import app from '../src/index.js';

const SECRET = 'dev-secret-key-change-in-prod';

describe('Worker Runtime WebSocket Route (/ws/runtime)', () => {
  it('returns 401 Unauthorized when no token is provided', async () => {
    const res = await app.request('/ws/runtime');
    expect(res.status).toBe(401);

    const body = (await res.json()) as Record<string, any>;
    expect(body.error).toBe('Unauthorized');
    expect(body.message).toBe('Missing runtime authentication token');
  });

  it('returns 401 Unauthorized when invalid token is provided', async () => {
    const res = await app.request('/ws/runtime?token=invalid.jwt.token');
    expect(res.status).toBe(401);

    const body = (await res.json()) as Record<string, any>;
    expect(body.error).toBe('Unauthorized');
    expect(body.message).toBe('Invalid or expired runtime token');
  });

  it('accepts valid runtime token passed as query parameter', async () => {
    const payload = {
      sub: 'runtime-node-01',
      role: 'runtime',
      workspaceId: 'ws-789',
      exp: Math.floor(Date.now() / 1000) + 3600,
    };
    const token = await sign(payload, SECRET, 'HS256');

    const res = await app.request(`/ws/runtime?token=${token}`);
    expect(res.status).toBe(200);

    const body = (await res.json()) as Record<string, any>;
    expect(body.status).toBe('connected');
    expect(body.runtimeId).toBe('runtime-node-01');
    expect(body.workspaceId).toBe('ws-789');
  });

  it('accepts valid runtime token passed via Authorization Bearer header', async () => {
    const payload = {
      sub: 'runtime-node-02',
      role: 'runtime',
      workspaceId: 'ws-101',
      exp: Math.floor(Date.now() / 1000) + 3600,
    };
    const token = await sign(payload, SECRET, 'HS256');

    const res = await app.request('/ws/runtime', {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    expect(res.status).toBe(200);

    const body = (await res.json()) as Record<string, any>;
    expect(body.status).toBe('connected');
    expect(body.runtimeId).toBe('runtime-node-02');
  });

  it('accepts valid runtime token passed via Sec-WebSocket-Protocol header', async () => {
    const payload = {
      sub: 'runtime-node-03',
      role: 'runtime',
      exp: Math.floor(Date.now() / 1000) + 3600,
    };
    const token = await sign(payload, SECRET, 'HS256');

    const res = await app.request('/ws/runtime', {
      headers: {
        'Sec-WebSocket-Protocol': `bearer.${token}`,
      },
    });
    expect(res.status).toBe(200);

    const body = (await res.json()) as Record<string, any>;
    expect(body.status).toBe('connected');
    expect(body.runtimeId).toBe('runtime-node-03');
  });
});
