import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { sign } from 'hono/jwt';
import app from '../src/index.js';
import { inMemoryProjectService } from '../src/services/projectService.js';

const SECRET = 'dev-secret-key-change-in-prod';

describe('Workspace WebSocket Route Auth & RBAC (/api/v1/workspaces/:id/room)', () => {
  let workspaceId: string;
  let memberToken: string;
  let outsiderToken: string;

  const memberSub = 'auth-member-001';
  const outsiderSub = 'auth-outsider-999';

  beforeEach(async () => {
    inMemoryProjectService.reset();

    const { project } = await inMemoryProjectService.createProject(
      memberSub,
      'member@co-vibe.dev',
      { name: 'WS AuthZ Project' }
    );
    const wsRes = await inMemoryProjectService.createWorkspace(project.id, memberSub, {
      name: 'Main Workspace',
    });
    if (wsRes.status !== 'ok') throw new Error('Failed to create test workspace');
    workspaceId = wsRes.workspace.id;

    const exp = Math.floor(Date.now() / 1000) + 3600;
    memberToken = await sign({ sub: memberSub, exp }, SECRET, 'HS256');
    outsiderToken = await sign({ sub: outsiderSub, exp }, SECRET, 'HS256');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns 401 when token is missing', async () => {
    const res = await app.request(`/api/v1/workspaces/${workspaceId}/room`);
    expect(res.status).toBe(401);
  });

  it('returns 401 on invalid token even without SUPABASE_URL configured', async () => {
    const res = await app.request(`/api/v1/workspaces/${workspaceId}/room?token=invalid.jwt.token`);
    expect(res.status).toBe(401);
  });

  it('fails closed (500) in production when no Supabase introspection or JWT secret is configured', async () => {
    const res = await app.request(
      `/api/v1/workspaces/${workspaceId}/room?token=${memberToken}`,
      {},
      { ENVIRONMENT: 'production' } as any
    );
    expect(res.status).toBe(500);
  });

  it('returns 400 for invalid workspace UUID', async () => {
    const res = await app.request(`/api/v1/workspaces/not-a-uuid/room?token=${memberToken}`, {
      headers: { Upgrade: 'websocket' },
    });
    expect(res.status).toBe(400);
  });

  it('returns 404 when workspace does not exist', async () => {
    const res = await app.request(
      `/api/v1/workspaces/11111111-1111-4111-8111-111111111111/room?token=${memberToken}`,
      { headers: { Upgrade: 'websocket' } }
    );
    expect(res.status).toBe(404);
  });

  it('returns 403 Forbidden for non-member before checking Upgrade header or calling DO', async () => {
    const doGetSpy = vi.fn();
    const mockDo = {
      idFromName: vi.fn().mockReturnValue('do-id'),
      get: doGetSpy,
    };

    const res = await app.request(
      `/api/v1/workspaces/${workspaceId}/room?token=${outsiderToken}`,
      { headers: { Upgrade: 'websocket' } },
      { WORKSPACE_ROOM: mockDo } as any
    );

    expect(res.status).toBe(403);
    expect(doGetSpy).not.toHaveBeenCalled();
  });

  it('forwards to WORKSPACE_ROOM DO stub when authenticated member connects', async () => {
    const stubFetch = vi.fn().mockResolvedValue(new Response('ws-upgraded', { status: 200 }));
    const mockDo = {
      idFromName: vi.fn().mockReturnValue('do-id-123'),
      get: vi.fn().mockReturnValue({ fetch: stubFetch }),
    };

    const res = await app.request(
      `/api/v1/workspaces/${workspaceId}/room?token=${memberToken}`,
      { headers: { Upgrade: 'websocket' } },
      { WORKSPACE_ROOM: mockDo } as any
    );

    expect(res.status).toBe(200);
    expect(await res.text()).toBe('ws-upgraded');
    expect(mockDo.idFromName).toHaveBeenCalledWith(workspaceId);
    expect(stubFetch).toHaveBeenCalledTimes(1);
  });

  it('verifies user identity via Supabase /auth/v1/user introspection and enforces membership', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      if (url.endsWith('/auth/v1/user')) {
        return new Response(JSON.stringify({ id: outsiderSub }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      // Return PGRST205 for PostgREST calls so SupabaseProjectService falls back to inMemoryProjectService
      return new Response(JSON.stringify({ code: 'PGRST205', message: 'Could not find the table' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    });

    const mockDo = {
      idFromName: vi.fn(),
      get: vi.fn(),
    };

    const res = await app.request(
      `/api/v1/workspaces/${workspaceId}/room?token=opaque-supabase-token`,
      { headers: { Upgrade: 'websocket' } },
      {
        SUPABASE_URL: 'https://example.supabase.co',
        SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
        WORKSPACE_ROOM: mockDo,
      } as any
    );

    expect(fetchMock).toHaveBeenCalled();
    expect(res.status).toBe(403);
    expect(mockDo.get).not.toHaveBeenCalled();
  });
});
