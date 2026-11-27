import { describe, it, expect, beforeEach, vi } from 'vitest';
import { sign } from 'hono/jwt';
import app from '../src/index.js';
import { inMemoryProjectService } from '../src/services/projectService.js';
import { inMemoryGithubTokenService } from '../src/services/githubTokenService.js';
import { runtimeBridge } from '../src/services/runtimeBridge.js';

const SECRET = 'dev-secret-key-change-in-prod';

describe('Worker Git API Routes (/api/v1/workspaces/:workspaceId/*)', () => {
  let ownerToken: string;
  let viewerToken: string;
  let outsiderToken: string;
  let projectId: string;
  let workspaceId: string;

  const ownerSub = 'git-owner-01';
  const viewerSub = 'git-viewer-02';
  const outsiderSub = 'git-outsider-03';

  beforeEach(async () => {
    inMemoryProjectService.reset();
    inMemoryGithubTokenService.reset();
    runtimeBridge.reset();

    const { project } = await inMemoryProjectService.createProject(ownerSub, 'owner@co-vibe.dev', {
      name: 'Git Test Project',
    });
    projectId = project.id;

    const wsRes = await inMemoryProjectService.createWorkspace(projectId, ownerSub, {
      name: 'Main WS',
      activeBranch: 'main',
    });
    if (wsRes.status !== 'ok') throw new Error('Failed to create workspace');
    workspaceId = wsRes.workspace.id;

    await inMemoryProjectService.addMember(projectId, viewerSub, 'viewer@co-vibe.dev', 'viewer');

    const exp = Math.floor(Date.now() / 1000) + 3600;
    ownerToken = await sign({ sub: ownerSub, email: 'owner@co-vibe.dev', exp }, SECRET, 'HS256');
    viewerToken = await sign({ sub: viewerSub, email: 'viewer@co-vibe.dev', exp }, SECRET, 'HS256');
    outsiderToken = await sign({ sub: outsiderSub, email: 'outsider@co-vibe.dev', exp }, SECRET, 'HS256');
  });

  function connectFakeRuntime(
    wsId: string,
    handler: (req: any) => any
  ): () => void {
    return runtimeBridge.registerConnection({
      runtimeId: 'rt-git-test',
      workspaceId: wsId,
      socket: {
        send: (raw: string) => {
          const req = JSON.parse(raw);
          queueMicrotask(() => {
            try {
              const result = handler(req);
              runtimeBridge.handleIncomingMessage({
                type: 'rpc.response',
                requestId: req.requestId,
                ok: true,
                result,
              });
            } catch (err: any) {
              runtimeBridge.handleIncomingMessage({
                type: 'rpc.response',
                requestId: req.requestId,
                ok: false,
                error: {
                  code: err.code || 'GIT_ERROR',
                  message: err.message || 'Failed',
                  status: err.status || 502,
                },
              });
            }
          });
        },
      },
    });
  }

  it('requires authentication (401) and enforces project RBAC (403 for outsider and viewer writes)', async () => {
    const unauth = await app.request(`/api/v1/workspaces/${workspaceId}/status`);
    expect(unauth.status).toBe(401);

    const outsiderRes = await app.request(`/api/v1/workspaces/${workspaceId}/status`, {
      headers: { Authorization: `Bearer ${outsiderToken}` },
    });
    expect(outsiderRes.status).toBe(403);

    const viewerBranchRes = await app.request(`/api/v1/workspaces/${workspaceId}/branch`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${viewerToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ branchName: 'feat/viewer' }),
    });
    expect(viewerBranchRes.status).toBe(403);
  });

  it('returns 503 Runtime Offline when no runtime WebSocket is connected', async () => {
    const res = await app.request(`/api/v1/workspaces/${workspaceId}/status`, {
      headers: { Authorization: `Bearer ${ownerToken}` },
    });
    expect(res.status).toBe(503);
  });

  it('validates request bodies with Zod (400 Bad Request)', async () => {
    connectFakeRuntime(workspaceId, () => ({}));

    const badBranch = await app.request(`/api/v1/workspaces/${workspaceId}/branch`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${ownerToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ branchName: '--invalid-flag' }),
    });
    expect(badBranch.status).toBe(400);

    const badCommit = await app.request(`/api/v1/workspaces/${workspaceId}/commit`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${ownerToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ message: '' }),
    });
    expect(badCommit.status).toBe(400);

    const badClone = await app.request(`/api/v1/workspaces/${workspaceId}/clone`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${ownerToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ repoUrl: 'file:///etc/passwd' }),
    });
    expect(badClone.status).toBe(400);
  });

  it('forwards status, diff, branch (updating activeBranch), commit, and clone over runtime RPC without leaking tokens', async () => {
    const capturedRpcCalls: any[] = [];
    await inMemoryGithubTokenService.saveToken(ownerSub, 'owner@co-vibe.dev', {
      accessToken: 'gho_secret_clone_token_123456',
      githubUsername: 'octocat',
    });

    const cleanup = connectFakeRuntime(workspaceId, (req) => {
      capturedRpcCalls.push(req);
      if (req.method === 'git.status') {
        return { staged: ['index.ts'], modified: ['app.ts'], untracked: [] };
      }
      if (req.method === 'git.diff') {
        return { diff: 'diff --git a/app.ts b/app.ts' };
      }
      if (req.method === 'git.branch') {
        return { branch: req.params.branchName };
      }
      if (req.method === 'git.commit') {
        return { message: req.params.message };
      }
      if (req.method === 'git.clone') {
        return { repoUrl: req.params.repoUrl, branch: 'main' };
      }
      return {};
    });

    const statusRes = await app.request(`/api/v1/workspaces/${workspaceId}/status`, {
      headers: { Authorization: `Bearer ${viewerToken}` },
    });
    expect(statusRes.status).toBe(200);
    expect(await statusRes.json()).toEqual({
      status: { staged: ['index.ts'], modified: ['app.ts'], untracked: [] },
    });

    const diffRes = await app.request(`/api/v1/workspaces/${workspaceId}/diff`, {
      headers: { Authorization: `Bearer ${ownerToken}` },
    });
    expect(diffRes.status).toBe(200);
    expect(await diffRes.json()).toEqual({ diff: 'diff --git a/app.ts b/app.ts' });

    const branchRes = await app.request(`/api/v1/workspaces/${workspaceId}/branch`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${ownerToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ branchName: 'feat/rpc-bridge' }),
    });
    expect(branchRes.status).toBe(200);
    expect(await branchRes.json()).toEqual({ success: true, branch: 'feat/rpc-bridge' });

    const wsListRes = await inMemoryProjectService.listWorkspaces(projectId, ownerSub);
    expect(wsListRes.status === 'ok' && wsListRes.workspaces[0]?.activeBranch).toBe('feat/rpc-bridge');

    const commitRes = await app.request(`/api/v1/workspaces/${workspaceId}/commit`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${ownerToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ message: 'feat: implement rpc', stageAll: true }),
    });
    expect(commitRes.status).toBe(200);

    const cloneRes = await app.request(`/api/v1/workspaces/${workspaceId}/clone`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${ownerToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ repoUrl: 'https://github.com/co-vibe/demo-repo' }),
    });
    expect(cloneRes.status).toBe(200);
    const cloneText = await cloneRes.text();
    expect(cloneText).not.toContain('gho_secret_clone_token_123456');

    const cloneRpc = capturedRpcCalls.find((c) => c.method === 'git.clone');
    expect(cloneRpc?.params?.authToken).toBe('gho_secret_clone_token_123456');

    cleanup();
  });
});
