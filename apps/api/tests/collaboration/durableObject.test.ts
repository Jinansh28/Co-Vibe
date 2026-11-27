import { describe, it, expect, beforeEach } from 'vitest';
import { sign } from 'hono/jwt';
import app from '../../src/index.js';
import { WorkspaceRoom } from '../../src/durable-objects/WorkspaceRoom.js';
import { inMemoryProjectService } from '../../src/services/projectService.js';

const SECRET = 'dev-secret-key-change-in-prod';

describe('WorkspaceRoom Route (/api/v1/workspaces/:id/room)', () => {
  let workspaceId: string;

  beforeEach(async () => {
    inMemoryProjectService.reset();
    const { project } = await inMemoryProjectService.createProject('user1', 'user1@co-vibe.dev', {
      name: 'DO Test Project',
    });
    const wsRes = await inMemoryProjectService.createWorkspace(project.id, 'user1', {
      name: 'DO Test Workspace',
    });
    if (wsRes.status !== 'ok') throw new Error('Failed to seed workspace');
    workspaceId = wsRes.workspace.id;
  });

  it('returns 401 when no token is provided', async () => {
    const res = await app.request(`/api/v1/workspaces/${workspaceId}/room`);
    expect(res.status).toBe(401);
  });

  it('returns 426 when Upgrade header is missing (token provided via query param)', async () => {
    const token = await sign({ sub: 'user1' }, SECRET, 'HS256');
    const res = await app.request(`/api/v1/workspaces/${workspaceId}/room?token=${token}`);
    expect(res.status).toBe(426);
    expect(await res.text()).toBe('Expected Upgrade: websocket');
  });

  it('returns 500 when Durable Object is not bound (token provided via query param)', async () => {
    const token = await sign({ sub: 'user1' }, SECRET, 'HS256');
    const res = await app.request(`/api/v1/workspaces/${workspaceId}/room?token=${token}`, {
      headers: {
        Upgrade: 'websocket',
      },
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
