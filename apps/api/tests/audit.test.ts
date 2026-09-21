import { describe, it, expect, beforeEach } from 'vitest';
import { Hono } from 'hono';
import { auditMiddleware } from '../src/middleware/audit.js';
import { auditService } from '../src/services/auditService.js';
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
