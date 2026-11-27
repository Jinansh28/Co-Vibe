import { describe, it, expect, beforeEach } from 'vitest';
import { sign } from 'hono/jwt';
import app from '../src/index.js';
import { inMemoryProjectService } from '../src/services/projectService.js';
import { inMemoryAgentHistoryService } from '../src/services/agentHistoryService.js';
import { runtimeBridge } from '../src/services/runtimeBridge.js';

const SECRET = 'dev-secret-key-change-in-prod';

describe('Worker ChangeSet Routes (/api/v1/changesets/:id/*)', () => {
  let ownerToken: string;
  let viewerToken: string;
  let outsiderToken: string;
  let workspaceId: string;
  let changeSetId: string;

  const ownerSub = 'cs-owner-01';
  const viewerSub = 'cs-viewer-02';
  const outsiderSub = 'cs-outsider-03';

  beforeEach(async () => {
    inMemoryProjectService.reset();
    inMemoryAgentHistoryService.reset();
    runtimeBridge.reset();

    const { project } = await inMemoryProjectService.createProject(ownerSub, 'owner@co-vibe.dev', {
      name: 'ChangeSet Test Project',
    });
    const wsRes = await inMemoryProjectService.createWorkspace(project.id, ownerSub, {
      name: 'WS 1',
    });
    if (wsRes.status !== 'ok') throw new Error('Failed to create workspace');
    workspaceId = wsRes.workspace.id;

    await inMemoryProjectService.addMember(project.id, viewerSub, 'viewer@co-vibe.dev', 'viewer');

    const { taskId, runId } = await inMemoryAgentHistoryService.createTask(workspaceId, 'Update file');
    changeSetId = await inMemoryAgentHistoryService.saveChangeSet(
      taskId,
      runId,
      'diff --git a/a.ts b/a.ts\n--- a/a.ts\n+++ b/a.ts\n@@ -1 +1 @@\n-old\n+new\n',
      ['a.ts']
    );

    const exp = Math.floor(Date.now() / 1000) + 3600;
    ownerToken = await sign({ sub: ownerSub, email: 'owner@co-vibe.dev', exp }, SECRET, 'HS256');
    viewerToken = await sign({ sub: viewerSub, email: 'viewer@co-vibe.dev', exp }, SECRET, 'HS256');
    outsiderToken = await sign({ sub: outsiderSub, email: 'outsider@co-vibe.dev', exp }, SECRET, 'HS256');
  });

  it('enforces auth (401), missing changeset (404), and RBAC (403 for outsider & viewer)', async () => {
    const unauth = await app.request(`/api/v1/changesets/${changeSetId}/accept`, { method: 'POST' });
    expect(unauth.status).toBe(401);

    const missing = await app.request('/api/v1/changesets/non-existent-id/accept', {
      method: 'POST',
      headers: { Authorization: `Bearer ${ownerToken}` },
    });
    expect(missing.status).toBe(404);

    const outsider = await app.request(`/api/v1/changesets/${changeSetId}/accept`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${outsiderToken}` },
    });
    expect(outsider.status).toBe(403);

    const viewer = await app.request(`/api/v1/changesets/${changeSetId}/reject`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${viewerToken}` },
    });
    expect(viewer.status).toBe(403);
  });

  it('forwards accept with acceptedHunks to connected runtime and persists accepted status', async () => {
    const receivedParams: any[] = [];
    runtimeBridge.registerConnection({
      runtimeId: 'rt-cs-1',
      workspaceId,
      socket: {
        send: (raw: string) => {
          const req = JSON.parse(raw);
          receivedParams.push(req);
          queueMicrotask(() => {
            runtimeBridge.handleIncomingMessage({
              type: 'rpc.response',
              requestId: req.requestId,
              ok: true,
              result: { status: 'accepted', filePath: 'a.ts' },
            });
          });
        },
      },
    });

    const res = await app.request(`/api/v1/changesets/${changeSetId}/accept`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${ownerToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ acceptedHunks: ['a.ts #1 @@ -1 +1 @@'] }),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, any>;
    expect(body.status).toBe('accepted');
    expect(receivedParams[0].method).toBe('changeset.accept');
    expect(receivedParams[0].params.acceptedHunks).toEqual(['a.ts #1 @@ -1 +1 @@']);

    const updated = await inMemoryAgentHistoryService.getChangeSetById(changeSetId);
    expect(updated?.status).toBe('accepted');
  });

  it('propagates 409 Conflict from runtime and persists conflicted status', async () => {
    runtimeBridge.registerConnection({
      runtimeId: 'rt-cs-conflict',
      workspaceId,
      socket: {
        send: (raw: string) => {
          const req = JSON.parse(raw);
          queueMicrotask(() => {
            runtimeBridge.handleIncomingMessage({
              type: 'rpc.response',
              requestId: req.requestId,
              ok: false,
              error: {
                code: 'CHANGESET_CONFLICT',
                message: '3-way merge conflict in a.ts',
                status: 409,
              },
            });
          });
        },
      },
    });

    const res = await app.request(`/api/v1/changesets/${changeSetId}/accept`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${ownerToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(409);
    const body = (await res.json()) as Record<string, any>;
    expect(body.status).toBe('conflicted');

    const updated = await inMemoryAgentHistoryService.getChangeSetById(changeSetId);
    expect(updated?.status).toBe('conflicted');
  });

  it('forwards reject to connected runtime and persists rejected status', async () => {
    const res = await app.request(`/api/v1/changesets/${changeSetId}/reject`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${ownerToken}` },
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, any>;
    expect(body.status).toBe('rejected');

    const updated = await inMemoryAgentHistoryService.getChangeSetById(changeSetId);
    expect(updated?.status).toBe('rejected');
  });
});
