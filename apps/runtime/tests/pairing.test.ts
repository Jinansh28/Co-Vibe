import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { Server } from 'node:http';
import path from 'node:path';
import fs from 'node:fs/promises';
import { TokenManager } from '../src/auth/tokenManager.js';
import { createPairingServer } from '../src/server/pairingServer.js';

describe('TokenManager', () => {
  it('generates a valid 6-digit pairing code with expiration', () => {
    const tm = new TokenManager('test-secret-key');
    const info = tm.generatePairingCode(60000);

    expect(info.code).toMatch(/^\d{6}$/);
    expect(info.expiresAt).toBeGreaterThan(Date.now());
  });

  it('verifies correct pairing code and invalidates it afterwards', () => {
    const tm = new TokenManager('test-secret-key');
    const info = tm.generatePairingCode(60000);

    expect(tm.verifyPairingCode('000000')).toBe(false);
    expect(tm.verifyPairingCode(info.code)).toBe(true);
    // Reuse should fail
    expect(tm.verifyPairingCode(info.code)).toBe(false);
  });

  it('rejects expired pairing code', () => {
    const tm = new TokenManager('test-secret-key');
    const info = tm.generatePairingCode(-1000); // Already expired

    expect(tm.verifyPairingCode(info.code)).toBe(false);
  });

  it('generates and verifies signed HS256 runtime JWT token', () => {
    const secret = 'custom-test-secret';
    const tm = new TokenManager(secret, 'test-runtime-123');
    const tokenInfo = tm.generateRuntimeToken('ws-project-abc');

    expect(tokenInfo.runtimeId).toBe('test-runtime-123');
    expect(tokenInfo.token.split('.').length).toBe(3);

    const payload = tm.verifyRuntimeToken(tokenInfo.token);
    expect(payload.sub).toBe('test-runtime-123');
    expect(payload.role).toBe('runtime');
    expect(payload.workspaceId).toBe('ws-project-abc');
  });
});

describe('Pairing Server HTTP Endpoints', () => {
  let server: Server;
  let tokenManager: TokenManager;
  const testPort = 7898;
  const baseUrl = `http://127.0.0.1:${testPort}`;

  beforeAll(async () => {
    tokenManager = new TokenManager('test-secret-key', 'runtime-test-id');
    server = createPairingServer(tokenManager);
    await new Promise<void>((resolve) => {
      server.listen(testPort, '127.0.0.1', resolve);
    });
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  });

  it('GET /health returns 200 OK', async () => {
    const res = await fetch(`${baseUrl}/health`);
    expect(res.status).toBe(200);

    const data = (await res.json()) as Record<string, any>;
    expect(data.status).toBe('ok');
    expect(data.service).toBe('local-runtime');
  });

  it('GET /api/v1/pairing/code returns active pairing code', async () => {
    const res = await fetch(`${baseUrl}/api/v1/pairing/code`);
    expect(res.status).toBe(200);

    const data = (await res.json()) as Record<string, any>;
    expect(data.ok).toBe(true);
    expect(data.code).toMatch(/^\d{6}$/);
    expect(typeof data.expiresAt).toBe('number');
  });

  it('POST /api/v1/pairing/verify rejects incorrect code', async () => {
    const res = await fetch(`${baseUrl}/api/v1/pairing/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: '000000' }),
    });

    expect(res.status).toBe(401);
    const data = (await res.json()) as Record<string, any>;
    expect(data.ok).toBe(false);
    expect(data.error).toBe('Invalid or expired pairing code');
  });

  it('POST /api/v1/pairing/verify accepts valid code and exchanges for token', async () => {
    const codeInfo = tokenManager.getPairingCode();

    const res = await fetch(`${baseUrl}/api/v1/pairing/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: codeInfo.code, workspaceId: 'ws-456' }),
    });

    expect(res.status).toBe(200);
    const data = (await res.json()) as Record<string, any>;
    expect(data.ok).toBe(true);
    expect(typeof data.token).toBe('string');
    expect(data.runtimeId).toBe('runtime-test-id');
    expect(typeof data.expiresAt).toBe('number');

    // Check status endpoint
    const statusRes = await fetch(`${baseUrl}/api/v1/pairing/status`);
    const statusData = (await statusRes.json()) as Record<string, any>;
    expect(statusData.paired).toBe(true);
    expect(statusData.runtimeId).toBe('runtime-test-id');
  });

  it('OPTIONS CORS preflight returns 204 No Content', async () => {
    const res = await fetch(`${baseUrl}/api/v1/pairing/verify`, {
      method: 'OPTIONS',
    });
    expect(res.status).toBe(204);
  });

  it('GET /api/v1/files initializes workspace directory and seeds files once', async () => {
    const testWsId = `test-ws-${Date.now()}`;
    const res = await fetch(`${baseUrl}/api/v1/files`, {
      headers: { 'X-Workspace-Id': testWsId },
    });
    expect(res.status).toBe(200);
    const data = (await res.json()) as Record<string, any>;
    expect(data.ok).toBe(true);
    expect(Array.isArray(data.files)).toBe(true);

    const fileNames = data.files.map((f: any) => f.name);
    expect(fileNames).toContain('README.md');
    expect(fileNames).toContain('package.json');
    expect(fileNames).toContain('src');

    // Delete a file
    const delRes = await fetch(`${baseUrl}/api/v1/files?path=README.md`, {
      method: 'DELETE',
      headers: { 'X-Workspace-Id': testWsId },
    });
    expect(delRes.status).toBe(200);

    // Fetch again: README.md must NOT reappear
    const res2 = await fetch(`${baseUrl}/api/v1/files`, {
      headers: { 'X-Workspace-Id': testWsId },
    });
    const data2 = (await res2.json()) as Record<string, any>;
    const fileNames2 = data2.files.map((f: any) => f.name);
    expect(fileNames2).not.toContain('README.md');
  });

  it('POST /api/v1/agent/run rejects missing prompt with 400 Bad Request', async () => {
    const res = await fetch(`${baseUrl}/api/v1/agent/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
    const data = (await res.json()) as any;
    expect(data.ok).toBe(false);
  });

  it('POST /api/v1/agent/run executes agent and streams NDJSON progress events', async () => {
    process.env.AI_PROVIDER = 'mock';
    const testWsId = `test-ws-agent-${Date.now()}`;

    const res = await fetch(`${baseUrl}/api/v1/agent/run`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Workspace-Id': testWsId,
      },
      body: JSON.stringify({ prompt: 'Create a greeting file' }),
    });

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('application/x-ndjson');

    const text = await res.text();
    const lines = text.trim().split('\n').map((l) => JSON.parse(l));

    expect(lines.length).toBeGreaterThan(0);
    const states = lines.map((l: any) => l.state);
    expect(states).toContain('PLANNING');
    expect(states).toContain('EXECUTING');
    expect(states).toContain('SUCCESS');
  });

  it('POST /api/v1/agent/run accepts optional visual snapshot image and passes to agent', async () => {
    process.env.AI_PROVIDER = 'mock';
    const testWsId = `test-ws-agent-vision-${Date.now()}`;

    const res = await fetch(`${baseUrl}/api/v1/agent/run`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Workspace-Id': testWsId,
      },
      body: JSON.stringify({
        prompt: 'Fix button alignment in this screenshot',
        image: {
          mimeType: 'image/png',
          base64: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
        },
      }),
    });

    expect(res.status).toBe(200);
    const text = await res.text();
    const lines = text.trim().split('\n').map((l) => JSON.parse(l));

    expect(lines.length).toBeGreaterThan(0);
    const visualEvent = lines.find((l: any) => l.stepName === 'Visual Context');
    expect(visualEvent).toBeDefined();
    expect(visualEvent.image?.mimeType).toBe('image/png');
    expect(visualEvent.image?.base64).toBeDefined();
  });

  it('handles changeset endpoints: accept saves staged file and reject discards it', async () => {
    const { pendingChangeSets } = await import('../src/server/pairingServer.js');
    const testWsId = `test-ws-cs-${Date.now()}`;
    const wsRoot = path.join(process.cwd(), '.workspaces', testWsId);
    await fs.mkdir(wsRoot, { recursive: true });

    // Seed a staged changeset
    const changeSetId = `cs-test-${Date.now()}`;
    pendingChangeSets.set(changeSetId, {
      id: changeSetId,
      filePath: 'src/staged.ts',
      originalContent: '// empty',
      modifiedContent: 'export const staged = true;',
      workspaceRoot: wsRoot,
      createdAt: Date.now(),
    });

    // 1. GET changeset info
    const getRes = await fetch(`${baseUrl}/api/v1/changesets/${changeSetId}`);
    expect(getRes.status).toBe(200);
    const getData = await getRes.json();
    expect(getData.ok).toBe(true);
    expect(getData.changeset.filePath).toBe('src/staged.ts');

    // 2. Accept changeset -> file should be written to disk
    const acceptRes = await fetch(`${baseUrl}/api/v1/changesets/${changeSetId}/accept`, {
      method: 'POST',
    });
    expect(acceptRes.status).toBe(200);
    const acceptData = await acceptRes.json();
    expect(acceptData.status).toBe('accepted');

    const writtenContent = await fs.readFile(path.join(wsRoot, 'src/staged.ts'), 'utf8');
    expect(writtenContent).toBe('export const staged = true;');
    expect(pendingChangeSets.has(changeSetId)).toBe(false);

    // 3. Reject changeset
    const rejectId = `cs-reject-${Date.now()}`;
    pendingChangeSets.set(rejectId, {
      id: rejectId,
      filePath: 'src/rejected.ts',
      originalContent: '',
      modifiedContent: 'do not save',
      workspaceRoot: wsRoot,
      createdAt: Date.now(),
    });

    const rejectRes = await fetch(`${baseUrl}/api/v1/changesets/${rejectId}/reject`, {
      method: 'POST',
    });
    expect(rejectRes.status).toBe(200);
    expect(pendingChangeSets.has(rejectId)).toBe(false);

    // Verify rejected file was NOT saved to disk
    const exists = await fs
      .access(path.join(wsRoot, 'src/rejected.ts'))
      .then(() => true)
      .catch(() => false);
    expect(exists).toBe(false);
  });

  it('PUT /api/v1/files/content saves files in subdirectories without path doubling when X-Workspace-Id is set', async () => {
    const testWsId = `ws-${Date.now()}`;
    const wsRoot = path.join(process.cwd(), '.workspaces', testWsId);
    await fs.mkdir(wsRoot, { recursive: true });

    // Simulate an agent run setting process.env.WORKSPACE_ROOT to wsRoot
    process.env.WORKSPACE_ROOT = wsRoot;

    // Save a file in a nested subdirectory
    const putRes = await fetch(`${baseUrl}/api/v1/files/content?path=src/index.html`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'X-Workspace-Id': testWsId,
      },
      body: JSON.stringify({ content: '<h1>Hello World</h1>' }),
    });

    expect(putRes.status).toBe(200);
    const putData = await putRes.json();
    expect(putData.ok).toBe(true);

    // Verify it was saved to the exact workspace root and NOT double nested
    const filePath = path.join(wsRoot, 'src', 'index.html');
    const content = await fs.readFile(filePath, 'utf8');
    expect(content).toBe('<h1>Hello World</h1>');

    // Clean up
    await fs.rm(wsRoot, { recursive: true, force: true }).catch(() => {});
  });
});
