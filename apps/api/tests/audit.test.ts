import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Hono } from 'hono';
import { auditMiddleware } from '../src/middleware/audit.js';
import { auditService, SupabaseAuditService } from '../src/services/auditService.js';
import type { Env } from '../src/middleware/auth.js';

describe('Audit Middleware', () => {
  let app: Hono<Env>;

  beforeEach(() => {
    auditService.reset();
    app = new Hono<Env>();
    
    // Mock auth middleware
    app.use('*', async (c, next) => {
      c.set('authUser', { sub: 'test-user-id' });
      await next();
    });
    
    app.use('*', auditMiddleware);

    app.post('/api/v1/projects', (c) => {
      return c.json({ project: { id: 'proj-123' } }, 201);
    });

    app.post('/api/v1/projects/proj-123/workspaces', (c) => {
      return c.json({ workspace: { id: 'ws-456', projectId: 'proj-123' } }, 201);
    });

    app.post('/api/v1/changesets/cs-789/accept', (c) => {
      return c.json({ success: true }, 200);
    });

    app.get('/api/v1/projects', (c) => {
      return c.json({ projects: [] }, 200);
    });
  });

  it('should log project.created on POST /api/v1/projects', async () => {
    const res = await app.request('/api/v1/projects', {
      method: 'POST',
      body: JSON.stringify({ name: 'Test' })
    });
    
    expect(res.status).toBe(201);
    
    const logs = auditService.getLogs();
    expect(logs.length).toBe(1);
    expect(logs[0].eventType).toBe('project.created');
    expect(logs[0].targetType).toBe('project');
    expect(logs[0].targetId).toBe('proj-123');
    expect(logs[0].projectId).toBe('proj-123');
    expect(logs[0].userId).toBe('test-user-id');
  });

  it('should log workspace.started on POST /api/v1/projects/:id/workspaces', async () => {
    const res = await app.request('/api/v1/projects/proj-123/workspaces', {
      method: 'POST',
      body: JSON.stringify({ name: 'WS' })
    });
    
    expect(res.status).toBe(201);
    
    const logs = auditService.getLogs();
    expect(logs.length).toBe(1);
    expect(logs[0].eventType).toBe('workspace.started');
    expect(logs[0].targetType).toBe('workspace');
    expect(logs[0].targetId).toBe('ws-456');
    expect(logs[0].projectId).toBe('proj-123');
    expect(logs[0].workspaceId).toBe('ws-456');
  });

  it('should log changeset.accepted on POST /api/v1/changesets/:id/accept', async () => {
    const res = await app.request('/api/v1/changesets/cs-789/accept', {
      method: 'POST'
    });
    
    expect(res.status).toBe(200);
    
    const logs = auditService.getLogs();
    expect(logs.length).toBe(1);
    expect(logs[0].eventType).toBe('changeset.accepted');
    expect(logs[0].targetType).toBe('changeset');
    expect(logs[0].targetId).toBe('cs-789');
  });

  it('should not log on GET requests', async () => {
    const res = await app.request('/api/v1/projects', {
      method: 'GET'
    });
    
    expect(res.status).toBe(200);
    
    const logs = auditService.getLogs();
    expect(logs.length).toBe(0);
  });
});

describe('SupabaseAuditService', () => {
  beforeEach(() => {
    auditService.reset();
  });

  it('resolves auth_user_id to public.users.id and inserts into audit_logs', async () => {
    const authUserId = '11111111-1111-4111-8111-111111111111';
    const internalUserId = '22222222-2222-4222-8222-222222222222';
    const projectId = '33333333-3333-4333-8333-333333333333';
    const workspaceId = '44444444-4444-4444-8444-444444444444';

    const insertMock = vi.fn().mockResolvedValue({ error: null });
    const mockClient = {
      from: vi.fn((table: string) => {
        if (table === 'users') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({ data: { id: internalUserId }, error: null }),
          };
        }
        if (table === 'audit_logs') {
          return { insert: insertMock };
        }
        return {};
      }),
    } as any;

    const svc = new SupabaseAuditService(mockClient);
    const result = await svc.logEvent({
      userId: authUserId,
      projectId,
      workspaceId,
      eventType: 'project.created',
      targetType: 'project',
      targetId: projectId,
      metadata: { path: '/api/v1/projects' },
    });

    expect(result.id).toBeDefined();
    expect(insertMock).toHaveBeenCalledTimes(1);
    const insertedRow = insertMock.mock.calls[0][0];
    expect(insertedRow.user_id).toBe(internalUserId);
    expect(insertedRow.project_id).toBe(projectId);
    expect(insertedRow.workspace_id).toBe(workspaceId);
    expect(insertedRow.event_type).toBe('project.created');
  });

  it('falls back to null user_id and null non-UUID project/workspace columns when user row is missing', async () => {
    const insertMock = vi.fn().mockResolvedValue({ error: null });
    const mockClient = {
      from: vi.fn((table: string) => {
        if (table === 'users') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
          };
        }
        if (table === 'audit_logs') {
          return { insert: insertMock };
        }
        return {};
      }),
    } as any;

    const svc = new SupabaseAuditService(mockClient);
    await svc.logEvent({
      userId: '11111111-1111-4111-8111-111111111111',
      projectId: 'non-uuid-project',
      workspaceId: 'non-uuid-ws',
      eventType: 'changeset.accepted',
      targetType: 'changeset',
      targetId: 'cs-1',
      metadata: {},
    });

    const insertedRow = insertMock.mock.calls[0][0];
    expect(insertedRow.user_id).toBeNull();
    expect(insertedRow.project_id).toBeNull();
    expect(insertedRow.workspace_id).toBeNull();
  });

  it('falls back to InMemoryAuditService on PGRST205 missing table error', async () => {
    const mockClient = {
      from: vi.fn((table: string) => {
        if (table === 'users') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
          };
        }
        if (table === 'audit_logs') {
          return {
            insert: vi.fn().mockResolvedValue({
              error: { code: 'PGRST205', message: "Could not find the table 'public.audit_logs'" },
            }),
          };
        }
        return {};
      }),
    } as any;

    const svc = new SupabaseAuditService(mockClient);
    await svc.logEvent({
      eventType: 'workspace.started',
      targetType: 'workspace',
      targetId: 'ws-1',
      metadata: {},
    });

    expect(auditService.getLogs()).toHaveLength(1);
    expect(auditService.getLogs()[0].eventType).toBe('workspace.started');
  });

  it('auditMiddleware logs persistence error without crashing successful response', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ code: '23505', message: 'db error' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      })
    );
    const consoleErrSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const testApp = new Hono<Env>();
    testApp.use('*', async (c, next) => {
      c.set('authUser', { sub: '11111111-1111-4111-8111-111111111111' });
      await next();
    });
    testApp.use('*', auditMiddleware);
    testApp.post('/api/v1/projects', (c) => c.json({ project: { id: 'proj-999' } }, 201));

    const res = await testApp.request(
      '/api/v1/projects',
      { method: 'POST', body: JSON.stringify({ name: 'Test' }) },
      {
        SUPABASE_URL: 'https://example.supabase.co',
        SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
      } as any
    );

    expect(res.status).toBe(201);
    expect(consoleErrSpy).toHaveBeenCalled();

    fetchSpy.mockRestore();
    consoleErrSpy.mockRestore();
  });
});
