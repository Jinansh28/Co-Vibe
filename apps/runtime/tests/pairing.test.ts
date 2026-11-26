import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import type { Server } from 'node:http';
import { EventEmitter } from 'node:events';
import type { PassThrough } from 'node:stream';
import path from 'node:path';
import fs from 'node:fs/promises';
import { TokenManager } from '../src/auth/tokenManager.js';
import { DockerManager } from '../src/docker/DockerManager.js';
import { ProcessManager } from '../src/process/ProcessManager.js';
import { createPairingServer } from '../src/server/pairingServer.js';

function createMockDockerDeps() {
  const dockerManager = new DockerManager();
  const dockerInst = dockerManager.getDockerInstance() as unknown as {
    createContainer: (opts: any) => Promise<{ id: string }>;
    getContainer: (id: string) => any;
    modem: { demuxStream: (stream: any, out: PassThrough, err: PassThrough) => void };
  };

  const spawnedContainerConfigs: any[] = [];
  const spawnedExecCmds: string[][] = [];
  const stdinWrites: string[] = [];

  vi.spyOn(dockerInst, 'createContainer').mockImplementation(async (opts: any) => {
    spawnedContainerConfigs.push(opts);
    return { id: `mock-container-${spawnedContainerConfigs.length}` } as any;
  });

  const activeStreams = new Map<
    any,
    { stdout: PassThrough; stderr: PassThrough; cmd: string[] }
  >();

  vi.spyOn(dockerInst.modem, 'demuxStream').mockImplementation(
    (stream: any, stdoutPass: PassThrough, stderrPass: PassThrough) => {
      const entry = activeStreams.get(stream);
      if (!entry) return;
      entry.stdout = stdoutPass;
      entry.stderr = stderrPass;

      const innerCmd = entry.cmd.slice(entry.cmd.indexOf('--') + 2);
      if (innerCmd[0] === 'node' && innerCmd[1] === 'long-running.js') {
        setTimeout(() => {
          if (!stream._destroyed) {
            stdoutPass.write(Buffer.from('alive\n'));
          }
        }, 10);
      } else {
        setTimeout(() => {
          if (!stream._destroyed) {
            stdoutPass.write(
              Buffer.from(
                `ran ${innerCmd.join(' ')} AIzaSyDummyKeyForUnitTesting1234567890abcd\n`
              )
            );
            stream.emit('end');
          }
        }, 10);
      }
    }
  );

  vi.spyOn(dockerInst, 'getContainer').mockImplementation(() => {
    return {
      start: vi.fn().mockResolvedValue(undefined),
      inspect: vi.fn().mockResolvedValue({ State: { Running: true } }),
      exec: vi.fn().mockImplementation(async (execOpts: { Cmd: string[] }) => {
        const cmd = execOpts.Cmd;
        // Kill / rm helper execs inside container
        if (cmd[0] === 'rm' || (cmd[0] === '/bin/sh' && !cmd.includes('--'))) {
          return {
            start: vi.fn().mockResolvedValue(null),
            inspect: vi.fn().mockResolvedValue({ ExitCode: 0 }),
          };
        }

        spawnedExecCmds.push(cmd);
        const mockStream = new EventEmitter() as any;
        mockStream._destroyed = false;
        mockStream.destroyed = false;
        mockStream.writableEnded = false;
        mockStream.write = vi.fn((chunk: string) => {
          stdinWrites.push(chunk);
          return true;
        });
        mockStream.destroy = vi.fn(() => {
          mockStream._destroyed = true;
          mockStream.destroyed = true;
        });

        activeStreams.set(mockStream, {
          stdout: null as any,
          stderr: null as any,
          cmd,
        });

        return {
          start: vi.fn().mockResolvedValue(mockStream),
          inspect: vi.fn().mockResolvedValue({ ExitCode: 0 }),
        };
      }),
    } as any;
  });

  const processManager = new ProcessManager(dockerManager);

  return {
    dockerManager,
    processManager,
    spawnedContainerConfigs,
    spawnedExecCmds,
    stdinWrites,
  };
}

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
    expect(tm.verifyPairingCode(info.code)).toBe(false);
  });

  it('rejects expired pairing code', () => {
    const tm = new TokenManager('test-secret-key');
    const info = tm.generatePairingCode(-1000);

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
  let authToken: string;
  let sandboxMocks: ReturnType<typeof createMockDockerDeps>;
  const testPort = 7898;
  const baseUrl = `http://127.0.0.1:${testPort}`;

  beforeAll(async () => {
    tokenManager = new TokenManager('test-secret-key', 'runtime-test-id');
    authToken = tokenManager.generateRuntimeToken().token;
    sandboxMocks = createMockDockerDeps();
    server = createPairingServer(tokenManager, {
      dockerManager: sandboxMocks.dockerManager,
      processManager: sandboxMocks.processManager,
    });
    await new Promise<void>((resolve) => {
      server.listen(testPort, '127.0.0.1', resolve);
    });
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
    vi.restoreAllMocks();
  });

  function authHeaders(extra: Record<string, string> = {}, token: string = authToken) {
    return {
      Authorization: `Bearer ${token}`,
      ...extra,
    };
  }

  it('GET /health, GET /, and GET /api/v1/agent/info are accessible without token', async () => {
    const healthRes = await fetch(`${baseUrl}/health`);
    expect(healthRes.status).toBe(200);
    const healthData = (await healthRes.json()) as Record<string, any>;
    expect(healthData.status).toBe('ok');
    expect(healthData.service).toBe('local-runtime');

    const rootRes = await fetch(`${baseUrl}/`);
    expect(rootRes.status).toBe(200);

    const infoRes = await fetch(`${baseUrl}/api/v1/agent/info`);
    expect(infoRes.status).toBe(200);
  });

  it('GET /api/v1/pairing/code returns active pairing code without token', async () => {
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

    const statusRes = await fetch(`${baseUrl}/api/v1/pairing/status`);
    const statusData = (await statusRes.json()) as Record<string, any>;
    expect(statusData.paired).toBe(true);
    expect(statusData.runtimeId).toBe('runtime-test-id');
  });

  it('enforces strict CORS allowlist and omits Access-Control-Allow-Origin for disallowed origins', async () => {
    const allowedRes = await fetch(`${baseUrl}/health`, {
      headers: { Origin: 'http://localhost:5173' },
    });
    expect(allowedRes.status).toBe(200);
    expect(allowedRes.headers.get('access-control-allow-origin')).toBe('http://localhost:5173');
    expect(allowedRes.headers.get('vary')).toContain('Origin');

    const evilPreflight = await fetch(`${baseUrl}/api/v1/files`, {
      method: 'OPTIONS',
      headers: { Origin: 'https://evil.example' },
    });
    expect(evilPreflight.status).toBe(403);
    expect(evilPreflight.headers.get('access-control-allow-origin')).toBeNull();
    expect(evilPreflight.headers.get('vary')).toContain('Origin');

    const evilGet = await fetch(`${baseUrl}/health`, {
      headers: { Origin: 'https://evil.example' },
    });
    expect(evilGet.status).toBe(403);
    expect(evilGet.headers.get('access-control-allow-origin')).toBeNull();

    // Respects RUNTIME_ALLOWED_ORIGINS override
    const prevOrigins = process.env.RUNTIME_ALLOWED_ORIGINS;
    process.env.RUNTIME_ALLOWED_ORIGINS = 'https://studio.covibe.dev';
    try {
      const customRes = await fetch(`${baseUrl}/health`, {
        headers: { Origin: 'https://studio.covibe.dev' },
      });
      expect(customRes.status).toBe(200);
      expect(customRes.headers.get('access-control-allow-origin')).toBe('https://studio.covibe.dev');
    } finally {
      if (prevOrigins === undefined) {
        delete process.env.RUNTIME_ALLOWED_ORIGINS;
      } else {
        process.env.RUNTIME_ALLOWED_ORIGINS = prevOrigins;
      }
    }
  });

  it('OPTIONS CORS preflight returns 204 No Content for allowlisted or non-browser callers', async () => {
    const res = await fetch(`${baseUrl}/api/v1/pairing/verify`, {
      method: 'OPTIONS',
      headers: { Origin: 'http://127.0.0.1:5173' },
    });
    expect(res.status).toBe(204);
    expect(res.headers.get('access-control-allow-origin')).toBe('http://127.0.0.1:5173');
  });

  it('rejects unauthenticated, malformed, invalid, and expired bearer tokens with 401 across protected endpoints', async () => {
    const expiredToken = tokenManager.generateRuntimeToken('ws-1', -60).token;
    const otherTm = new TokenManager('different-secret', 'other-runtime');
    const wrongSigToken = otherTm.generateRuntimeToken('ws-1').token;

    const endpoints: Array<{ url: string; method: string; body?: string }> = [
      { url: `${baseUrl}/api/v1/files`, method: 'GET' },
      { url: `${baseUrl}/api/v1/files/content?path=README.md`, method: 'GET' },
      { url: `${baseUrl}/api/v1/exec`, method: 'POST', body: JSON.stringify({ cmd: 'node', args: ['--version'] }) },
      { url: `${baseUrl}/api/v1/exec/fake-id/kill`, method: 'POST' },
      { url: `${baseUrl}/api/v1/exec/fake-id/stdin`, method: 'POST', body: JSON.stringify({ input: 'hi' }) },
      { url: `${baseUrl}/api/v1/agent/run`, method: 'POST', body: JSON.stringify({ prompt: 'hi' }) },
      { url: `${baseUrl}/api/v1/changesets/cs-1/accept`, method: 'POST' },
    ];

    for (const ep of endpoints) {
      // Missing Authorization header
      const missingRes = await fetch(ep.url, {
        method: ep.method,
        headers: ep.body ? { 'Content-Type': 'application/json' } : undefined,
        body: ep.body,
      });
      expect(missingRes.status).toBe(401);

      // Malformed Authorization header
      const malformedRes = await fetch(ep.url, {
        method: ep.method,
        headers: {
          Authorization: 'Basic dXNlcjpwYXNz',
          ...(ep.body ? { 'Content-Type': 'application/json' } : {}),
        },
        body: ep.body,
      });
      expect(malformedRes.status).toBe(401);
    }

    // Wrong signature token
    const badSigRes = await fetch(`${baseUrl}/api/v1/files`, {
      headers: { Authorization: `Bearer ${wrongSigToken}` },
    });
    expect(badSigRes.status).toBe(401);

    // Expired token
    const expRes = await fetch(`${baseUrl}/api/v1/files`, {
      headers: { Authorization: `Bearer ${expiredToken}` },
    });
    expect(expRes.status).toBe(401);
  });

  it('returns 403 Forbidden when JWT workspaceId claim does not match X-Workspace-Id header', async () => {
    const scopedToken = tokenManager.generateRuntimeToken('ws-alpha').token;

    const mismatchRes = await fetch(`${baseUrl}/api/v1/files`, {
      headers: {
        Authorization: `Bearer ${scopedToken}`,
        'X-Workspace-Id': 'ws-beta',
      },
    });
    expect(mismatchRes.status).toBe(403);
    const data = (await mismatchRes.json()) as Record<string, any>;
    expect(data.ok).toBe(false);
    expect(data.error).toContain('Workspace ID mismatch');
  });

  it('GET /api/v1/files initializes workspace directory and seeds files once', async () => {
    const testWsId = `test-ws-${Date.now()}`;
    const res = await fetch(`${baseUrl}/api/v1/files`, {
      headers: authHeaders({ 'X-Workspace-Id': testWsId }),
    });
    expect(res.status).toBe(200);
    const data = (await res.json()) as Record<string, any>;
    expect(data.ok).toBe(true);
    expect(Array.isArray(data.files)).toBe(true);

    const fileNames = data.files.map((f: any) => f.name);
    expect(fileNames).toContain('README.md');
    expect(fileNames).toContain('package.json');
    expect(fileNames).toContain('src');

    const delRes = await fetch(`${baseUrl}/api/v1/files?path=README.md`, {
      method: 'DELETE',
      headers: authHeaders({ 'X-Workspace-Id': testWsId }),
    });
    expect(delRes.status).toBe(200);

    const res2 = await fetch(`${baseUrl}/api/v1/files`, {
      headers: authHeaders({ 'X-Workspace-Id': testWsId }),
    });
    const data2 = (await res2.json()) as Record<string, any>;
    const fileNames2 = data2.files.map((f: any) => f.name);
    expect(fileNames2).not.toContain('README.md');

    await fs.rm(path.join(process.cwd(), '.workspaces', testWsId), { recursive: true, force: true }).catch(() => {});
  });

  it('rejects path traversal in X-Workspace-Id header across endpoints with 403', async () => {
    for (const badId of ['../../escape', '../secret', 'foo/bar', 'foo\\bar', '..']) {
      const filesRes = await fetch(`${baseUrl}/api/v1/files`, {
        headers: authHeaders({ 'X-Workspace-Id': badId }),
      });
      expect(filesRes.status).toBe(403);

      const execRes = await fetch(`${baseUrl}/api/v1/exec`, {
        method: 'POST',
        headers: authHeaders({
          'Content-Type': 'application/json',
          'X-Workspace-Id': badId,
        }),
        body: JSON.stringify({ cmd: 'node', args: ['--version'] }),
      });
      expect(execRes.status).toBe(403);

      const agentRes = await fetch(`${baseUrl}/api/v1/agent/run`, {
        method: 'POST',
        headers: authHeaders({
          'Content-Type': 'application/json',
          'X-Workspace-Id': badId,
        }),
        body: JSON.stringify({ prompt: 'Hello' }),
      });
      expect(agentRes.status).toBe(403);
    }
  });

  it('POST /api/v1/exec enforces @co-vibe/security command policy and rejects risky flags with 403', async () => {
    const testWsId = `test-ws-policy-${Date.now()}`;

    for (const badExec of [
      { cmd: 'sh', args: ['-c', 'echo pwned'] },
      { cmd: 'bash', args: ['-c', 'id'] },
      { cmd: 'node', args: ['-e', 'console.log(1)'] },
      { cmd: 'node', args: ['--eval=process.exit(1)'] },
      { cmd: 'npx', args: ['-c', 'whoami'] },
    ]) {
      const res = await fetch(`${baseUrl}/api/v1/exec`, {
        method: 'POST',
        headers: authHeaders({
          'Content-Type': 'application/json',
          'X-Workspace-Id': testWsId,
        }),
        body: JSON.stringify(badExec),
      });
      expect(res.status).toBe(403);
      const data = (await res.json()) as Record<string, any>;
      expect(data.error).toBe('POLICY_VIOLATION');
    }
  });

  it('POST /api/v1/exec routes through DockerManager + ProcessManager with secret redaction', async () => {
    const testWsId = `test-ws-sandbox-${Date.now()}`;
    const wsRoot = path.join(process.cwd(), '.workspaces', testWsId);

    const execRes = await fetch(`${baseUrl}/api/v1/exec`, {
      method: 'POST',
      headers: authHeaders({
        'Content-Type': 'application/json',
        'X-Workspace-Id': testWsId,
      }),
      body: JSON.stringify({
        cmd: 'node',
        args: ['--version'],
        cwd: '.',
      }),
    });

    expect(execRes.status).toBe(200);
    expect(execRes.headers.get('content-type')).toContain('application/x-ndjson');

    const text = await execRes.text();
    const lines = text
      .trim()
      .split('\n')
      .map((l) => JSON.parse(l));

    const stdoutLine = lines.find((l: any) => l.stream === 'stdout');
    expect(stdoutLine).toBeDefined();
    expect(stdoutLine.chunk).toContain('[REDACTED_SECRET]');
    expect(stdoutLine.chunk).not.toContain('AIzaSy');
    expect(lines.some((l: any) => l.stream === 'exit' && l.exitCode === 0)).toBe(true);

    // Verify sandbox container was created with --network=none and CapDrop ALL
    const containerConfig = sandboxMocks.spawnedContainerConfigs.find((c) =>
      c.Env?.includes(`WORKSPACE_ID=${testWsId}`)
    );
    expect(containerConfig).toBeDefined();
    expect(containerConfig.NetworkDisabled).toBe(true);
    expect(containerConfig.HostConfig.NetworkMode).toBe('none');
    expect(containerConfig.HostConfig.CapDrop).toContain('ALL');
    expect(containerConfig.User).toBe('10001');

    await fs.rm(wsRoot, { recursive: true, force: true }).catch(() => {});
  });

  it('POST /api/v1/agent/run rejects missing prompt with 400 Bad Request', async () => {
    const res = await fetch(`${baseUrl}/api/v1/agent/run`, {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
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
      headers: authHeaders({
        'Content-Type': 'application/json',
        'X-Workspace-Id': testWsId,
      }),
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

    await fs.rm(path.join(process.cwd(), '.workspaces', testWsId), { recursive: true, force: true }).catch(() => {});
  });

  it('POST /api/v1/agent/run accepts optional visual snapshot image and passes to agent', async () => {
    process.env.AI_PROVIDER = 'mock';
    const testWsId = `test-ws-agent-vision-${Date.now()}`;

    const res = await fetch(`${baseUrl}/api/v1/agent/run`, {
      method: 'POST',
      headers: authHeaders({
        'Content-Type': 'application/json',
        'X-Workspace-Id': testWsId,
      }),
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

    await fs.rm(path.join(process.cwd(), '.workspaces', testWsId), { recursive: true, force: true }).catch(() => {});
  });

  it('handles changeset endpoints: accept saves staged file and reject discards it', async () => {
    const { pendingChangeSets } = await import('../src/server/pairingServer.js');
    const testWsId = `test-ws-cs-${Date.now()}`;
    const wsRoot = path.join(process.cwd(), '.workspaces', testWsId);
    await fs.mkdir(wsRoot, { recursive: true });

    const changeSetId = `cs-test-${Date.now()}`;
    pendingChangeSets.set(changeSetId, {
      id: changeSetId,
      filePath: 'src/staged.ts',
      originalContent: '// empty',
      modifiedContent: 'export const staged = true;',
      workspaceRoot: wsRoot,
      createdAt: Date.now(),
    });

    const getRes = await fetch(`${baseUrl}/api/v1/changesets/${changeSetId}`, {
      headers: authHeaders(),
    });
    expect(getRes.status).toBe(200);
    const getData = (await getRes.json()) as Record<string, any>;
    expect(getData.ok).toBe(true);
    expect(getData.changeset.filePath).toBe('src/staged.ts');

    const acceptRes = await fetch(`${baseUrl}/api/v1/changesets/${changeSetId}/accept`, {
      method: 'POST',
      headers: authHeaders(),
    });
    expect(acceptRes.status).toBe(200);
    const acceptData = (await acceptRes.json()) as Record<string, any>;
    expect(acceptData.status).toBe('accepted');

    const writtenContent = await fs.readFile(path.join(wsRoot, 'src/staged.ts'), 'utf8');
    expect(writtenContent).toBe('export const staged = true;');
    expect(pendingChangeSets.has(changeSetId)).toBe(false);

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
      headers: authHeaders(),
    });
    expect(rejectRes.status).toBe(200);
    expect(pendingChangeSets.has(rejectId)).toBe(false);

    const exists = await fs
      .access(path.join(wsRoot, 'src/rejected.ts'))
      .then(() => true)
      .catch(() => false);
    expect(exists).toBe(false);

    await fs.rm(wsRoot, { recursive: true, force: true }).catch(() => {});
  });

  it('PUT /api/v1/files/content saves files in subdirectories without path doubling when X-Workspace-Id is set', async () => {
    const testWsId = `ws-${Date.now()}`;
    const wsRoot = path.join(process.cwd(), '.workspaces', testWsId);
    await fs.mkdir(wsRoot, { recursive: true });

    const prevWsRoot = process.env.WORKSPACE_ROOT;
    process.env.WORKSPACE_ROOT = wsRoot;

    try {
      const putRes = await fetch(`${baseUrl}/api/v1/files/content?path=src/index.html`, {
        method: 'PUT',
        headers: authHeaders({
          'Content-Type': 'application/json',
          'X-Workspace-Id': testWsId,
        }),
        body: JSON.stringify({ content: '<h1>Hello World</h1>' }),
      });

      expect(putRes.status).toBe(200);
      const putData = (await putRes.json()) as Record<string, any>;
      expect(putData.ok).toBe(true);

      const filePath = path.join(wsRoot, 'src', 'index.html');
      const content = await fs.readFile(filePath, 'utf8');
      expect(content).toBe('<h1>Hello World</h1>');
    } finally {
      if (prevWsRoot === undefined) {
        delete process.env.WORKSPACE_ROOT;
      } else {
        process.env.WORKSPACE_ROOT = prevWsRoot;
      }
      await fs.rm(wsRoot, { recursive: true, force: true }).catch(() => {});
    }
  });

  it('POST /api/v1/exec/:id/stdin and /kill route through ProcessManager lifecycle', async () => {
    const testWsId = `test-ws-exec-kill-${Date.now()}`;
    const wsRoot = path.join(process.cwd(), '.workspaces', testWsId);
    await fs.mkdir(wsRoot, { recursive: true });

    const execRes = await fetch(`${baseUrl}/api/v1/exec`, {
      method: 'POST',
      headers: authHeaders({
        'Content-Type': 'application/json',
        'X-Workspace-Id': testWsId,
      }),
      body: JSON.stringify({
        cmd: 'node',
        args: ['long-running.js'],
        cwd: '.',
      }),
    });

    expect(execRes.status).toBe(200);
    expect(execRes.body).not.toBeNull();

    const reader = execRes.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let executionId = '';

    while (!executionId) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        if (!line.trim()) continue;
        const parsed = JSON.parse(line);
        if (parsed.executionId) {
          executionId = parsed.executionId;
          break;
        }
      }
    }

    expect(executionId).toBeTruthy();

    // Write stdin through container exec stream
    const stdinRes = await fetch(`${baseUrl}/api/v1/exec/${executionId}/stdin`, {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ input: 'hello sandbox' }),
    });
    expect(stdinRes.status).toBe(200);
    expect(sandboxMocks.stdinWrites).toContain('hello sandbox\n');

    // Terminate the running sandbox process via kill endpoint
    const killRes = await fetch(`${baseUrl}/api/v1/exec/${executionId}/kill`, {
      method: 'POST',
      headers: authHeaders(),
    });
    expect(killRes.status).toBe(200);
    const killData = (await killRes.json()) as Record<string, any>;
    expect(killData.ok).toBe(true);
    expect(killData.message).toBe('Process terminated');

    while (true) {
      const { done } = await reader.read();
      if (done) break;
    }

    const killAgainRes = await fetch(`${baseUrl}/api/v1/exec/${executionId}/kill`, {
      method: 'POST',
      headers: authHeaders(),
    });
    expect(killAgainRes.status).toBe(404);

    await fs.rm(wsRoot, { recursive: true, force: true }).catch(() => {});
  });

  it('aborted POST /api/v1/exec stream terminates the sandboxed process cleanly', async () => {
    const testWsId = `test-ws-exec-abort-${Date.now()}`;
    const wsRoot = path.join(process.cwd(), '.workspaces', testWsId);
    await fs.mkdir(wsRoot, { recursive: true });

    const abortController = new AbortController();
    const execRes = await fetch(`${baseUrl}/api/v1/exec`, {
      method: 'POST',
      headers: authHeaders({
        'Content-Type': 'application/json',
        'X-Workspace-Id': testWsId,
      }),
      body: JSON.stringify({
        cmd: 'node',
        args: ['long-running.js'],
        cwd: '.',
      }),
      signal: abortController.signal,
    });

    const reader = execRes.body!.getReader();
    const decoder = new TextDecoder();
    let executionId = '';
    while (!executionId) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value, { stream: true });
      for (const line of chunk.split('\n')) {
        if (!line.trim()) continue;
        try {
          const parsed = JSON.parse(line);
          if (parsed.executionId) {
            executionId = parsed.executionId;
            break;
          }
        } catch {
          // Wait for full JSON line
        }
      }
    }

    expect(executionId).toBeTruthy();

    abortController.abort();
    await reader.cancel().catch(() => {});

    await new Promise((r) => setTimeout(r, 100));

    const killRes = await fetch(`${baseUrl}/api/v1/exec/${executionId}/kill`, {
      method: 'POST',
      headers: authHeaders(),
    });
    expect(killRes.status).toBe(404);

    await fs.rm(wsRoot, { recursive: true, force: true }).catch(() => {});
  });
});
