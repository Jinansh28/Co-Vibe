import { describe, it, expect, vi, afterEach } from 'vitest';
import type { Server } from 'node:http';
import { EventEmitter } from 'node:events';
import type { PassThrough } from 'node:stream';
import fs from 'node:fs/promises';
import path from 'node:path';
import { TokenManager } from '../../../apps/runtime/src/auth/tokenManager.js';
import { DockerManager } from '../../../apps/runtime/src/docker/DockerManager.js';
import { ProcessManager } from '../../../apps/runtime/src/process/ProcessManager.js';
import { createPairingServer } from '../../../apps/runtime/src/server/pairingServer.js';
import { redactSecrets, validateCommandPolicy } from '../../../packages/security/src/index.js';
import { createShellTools } from '../../../packages/agent/src/tools/shell.js';

describe('BUG-018 S0 Regression: Runtime Auth, Strict CORS, Sandbox Exec & Policy Alignment', () => {
  let server: Server | null = null;

  afterEach(async () => {
    if (server) {
      const s = server;
      server = null;
      await new Promise<void>((resolve) => s.close(() => resolve()));
    }
    vi.restoreAllMocks();
  });

  it('enforces runtime auth (401/403), strict CORS (no wildcard *), and Docker/ProcessManager routing', async () => {
    const tokenManager = new TokenManager('bug-018-regression-secret', 'rt-bug-018');
    const dockerManager = new DockerManager();
    const dockerInst = dockerManager.getDockerInstance() as unknown as {
      createContainer: (opts: any) => Promise<{ id: string }>;
      getContainer: (id: string) => any;
      modem: { demuxStream: (stream: any, out: PassThrough, err: PassThrough) => void };
    };

    const capturedContainers: any[] = [];
    vi.spyOn(dockerInst, 'createContainer').mockImplementation(async (opts: any) => {
      capturedContainers.push(opts);
      return { id: 'bug018-sandbox-container' } as any;
    });

    const streamOutputs = new Map<any, PassThrough>();
    vi.spyOn(dockerInst.modem, 'demuxStream').mockImplementation(
      (stream: any, stdoutPass: PassThrough) => {
        streamOutputs.set(stream, stdoutPass);
        setTimeout(() => {
          stdoutPass.write(
            Buffer.from(
              'token=github_pat_11ABCDEFG0123456789_xyzABCDEFGHIJKLMNOPQRSTUV key=AIzaSyDummyKeyForUnitTesting1234567890abcd\n'
            )
          );
          stream.emit('end');
        }, 10);
      }
    );

    vi.spyOn(dockerInst, 'getContainer').mockReturnValue({
      start: vi.fn().mockResolvedValue(undefined),
      inspect: vi.fn().mockResolvedValue({ State: { Running: true } }),
      exec: vi.fn().mockImplementation(async (execOpts: { Cmd: string[] }) => {
        if (execOpts.Cmd[0] === 'rm') {
          return {
            start: vi.fn().mockResolvedValue(null),
            inspect: vi.fn().mockResolvedValue({ ExitCode: 0 }),
          };
        }
        const mockStream = new EventEmitter() as any;
        mockStream.destroy = vi.fn();
        return {
          start: vi.fn().mockResolvedValue(mockStream),
          inspect: vi.fn().mockResolvedValue({ ExitCode: 0 }),
        };
      }),
    } as any);

    const processManager = new ProcessManager(dockerManager);
    const spawnSpy = vi.spyOn(processManager, 'spawnProcess');

    server = createPairingServer(tokenManager, { dockerManager, processManager });
    await new Promise<void>((resolve) => server!.listen(7899, '127.0.0.1', resolve));
    const baseUrl = 'http://127.0.0.1:7899';

    // 1. Disallowed origin must be rejected and never receive Access-Control-Allow-Origin: *
    const corsEvil = await fetch(`${baseUrl}/health`, {
      headers: { Origin: 'https://attacker.invalid' },
    });
    expect(corsEvil.status).toBe(403);
    expect(corsEvil.headers.get('access-control-allow-origin')).toBeNull();

    // 2. Protected routes must reject missing bearer tokens with 401
    const unauthExec = await fetch(`${baseUrl}/api/v1/exec`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cmd: 'node', args: ['--version'] }),
    });
    expect(unauthExec.status).toBe(401);

    // 3. Mismatched workspaceId claim vs X-Workspace-Id must return 403
    const scopedToken = tokenManager.generateRuntimeToken('ws-allowed').token;
    const mismatchFiles = await fetch(`${baseUrl}/api/v1/files`, {
      headers: {
        Authorization: `Bearer ${scopedToken}`,
        'X-Workspace-Id': 'ws-other',
      },
    });
    expect(mismatchFiles.status).toBe(403);

    // 4. Valid token executes via DockerManager (--network=none, CapDrop ALL) + ProcessManager
    const wsId = `bug018-ws-${Date.now()}`;
    const wsToken = tokenManager.generateRuntimeToken(wsId).token;
    const validExec = await fetch(`${baseUrl}/api/v1/exec`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${wsToken}`,
        'X-Workspace-Id': wsId,
      },
      body: JSON.stringify({ cmd: 'node', args: ['--version'], cwd: '.' }),
    });
    expect(validExec.status).toBe(200);
    const ndjson = await validExec.text();
    expect(spawnSpy).toHaveBeenCalledTimes(1);
    expect(capturedContainers[0].NetworkDisabled).toBe(true);
    expect(capturedContainers[0].HostConfig.NetworkMode).toBe('none');
    expect(capturedContainers[0].HostConfig.CapDrop).toContain('ALL');
    expect(ndjson).toContain('token=[REDACTED_SECRET] key=[REDACTED_SECRET]');
    expect(ndjson).not.toContain('github_pat_');
    expect(ndjson).not.toContain('AIzaSy');

    await fs.rm(path.join(process.cwd(), '.workspaces', wsId), { recursive: true, force: true }).catch(() => {});
  });

  it('blocks shell/eval bypasses in command policy, agent shell tools, and redacts AIza/github_pat secrets', async () => {
    expect(() => validateCommandPolicy(['sh', '-c', 'id'])).toThrow('POLICY_VIOLATION');
    expect(() => validateCommandPolicy(['bash', '-c', 'id'])).toThrow('POLICY_VIOLATION');
    expect(() => validateCommandPolicy(['node', '-e', 'process.exit(1)'])).toThrow('POLICY_VIOLATION');
    expect(() => validateCommandPolicy(['node', '--eval', 'process.exit(1)'])).toThrow('POLICY_VIOLATION');
    expect(() => validateCommandPolicy(['npx', '-c', 'id'])).toThrow('POLICY_VIOLATION');

    expect(
      redactSecrets(
        'AIzaSyDummyKeyForUnitTesting1234567890abcd github_pat_11ABCDEFG0123456789_xyzABCDEFGHIJKLMNOPQRSTUV'
      )
    ).toBe('[REDACTED_SECRET] [REDACTED_SECRET]');

    // Agent shell tools must fail closed without a sandbox executor
    const { runCommandTool } = createShellTools();
    const failClosed = await runCommandTool.execute({ command: 'node', args: ['--version'] });
    expect(failClosed).toContain('SANDBOX_REQUIRED');
  });
});
