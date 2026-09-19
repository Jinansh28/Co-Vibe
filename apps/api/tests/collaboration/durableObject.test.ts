import { describe, it, expect } from 'vitest';
import { sign } from 'hono/jwt';
import app from '../../src/index.js';
import { WorkspaceRoom } from '../../src/durable-objects/WorkspaceRoom.js';

const SECRET = 'dev-secret-key-change-in-prod';

describe('WorkspaceRoom Route (/api/v1/workspaces/:id/room)', () => {
  it('returns 426 when Upgrade header is missing', async () => {
    const token = await sign({ sub: 'user1' }, SECRET, 'HS256');
    const res = await app.request('/api/v1/workspaces/ws-123/room', {
      headers: { Authorization: `Bearer ${token}` }
    });
    expect(res.status).toBe(426);
    expect(await res.text()).toBe('Expected Upgrade: websocket');
  });

  it('returns 500 when Durable Object is not bound', async () => {
    const token = await sign({ sub: 'user1' }, SECRET, 'HS256');
    const res = await app.request('/api/v1/workspaces/ws-123/room', {
      headers: { 
        Authorization: `Bearer ${token}`,
        Upgrade: 'websocket'
      }
    });
    expect(res.status).toBe(500);
    expect(await res.text()).toBe('Durable Object not bound');
  });
});

describe('WorkspaceRoom Durable Object', () => {
  it('initializes and blocks concurrency until state is loaded', () => {
    let blockConcurrencyCalled = false;
    const ctx = {
      blockConcurrencyWhile: (cb: any) => {
        blockConcurrencyCalled = true;
        return cb();
      },
      storage: {
        get: async () => null,
      },
      acceptWebSocket: () => {}
    } as any;
    
    const room = new WorkspaceRoom(ctx, {});
    expect(blockConcurrencyCalled).toBe(true);
  });
});
