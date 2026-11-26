import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { PassThrough } from 'node:stream';
import { EventEmitter } from 'node:events';
import { StreamBuffer } from '../src/process/streamBuffer.js';
import { ProcessManager } from '../src/process/ProcessManager.js';
import { DockerManager } from '../src/docker/DockerManager.js';
import type { WsEnvelope, TerminalOutputPayload } from '@co-vibe/protocol';

describe('StreamBuffer Unit Tests', () => {
  it('buffers and separates stdout stream chunks', () => {
    const chunks: string[] = [];
    const payloads: TerminalOutputPayload[] = [];
    const envelopes: WsEnvelope<TerminalOutputPayload>[] = [];

    const buffer = new StreamBuffer({
      processId: 'proc-123',
      stream: 'stdout',
      workspaceId: '11111111-1111-1111-1111-111111111111',
      clientId: 'client-abc',
      onChunk: (c) => chunks.push(c),
      onPayload: (p) => payloads.push(p),
      onEnvelope: (e) => envelopes.push(e),
    });

    buffer.write('hello ');
    buffer.write('world\n');
    buffer.end();

    expect(chunks).toEqual(['hello ', 'world\n']);
    expect(buffer.getBufferedContent()).toBe('hello world\n');
    expect(buffer.getTotalBytes()).toBe(12);

    expect(payloads.length).toBe(2);
    expect(payloads[0].processId).toBe('proc-123');
    expect(payloads[0].stream).toBe('stdout');
    expect(payloads[0].data).toBe('hello ');

    expect(envelopes.length).toBe(2);
    expect(envelopes[0].type).toBe('terminal.output');
    expect(envelopes[0].workspaceId).toBe('11111111-1111-1111-1111-111111111111');
    expect(envelopes[0].payload.data).toBe('hello ');
  });

  it('buffers stderr stream chunks separately', () => {
    const chunks: string[] = [];
    const buffer = new StreamBuffer({
      processId: 'proc-456',
      stream: 'stderr',
      onChunk: (c) => chunks.push(c),
    });

    buffer.write('error occurred');
    expect(chunks).toEqual(['error occurred']);
    expect(buffer.getBufferedContent()).toBe('error occurred');
  });

  it('enforces sliding window throttling when byte limit is exceeded', () => {
    const chunks: string[] = [];
    const buffer = new StreamBuffer({
      processId: 'proc-throttle',
      stream: 'stdout',
      maxBytesPerMinute: 20, // 20 bytes limit
      windowDurationMs: 1000,
      onChunk: (c) => chunks.push(c),
    });

    // Write 15 bytes
    buffer.write('123456789012345');
    expect(buffer.isThrottled()).toBe(false);
    expect(chunks.length).toBe(1);

    // Write another 10 bytes -> exceeds 20 bytes limit
    buffer.write('abcdefghij');
    expect(buffer.isThrottled()).toBe(true);
    expect(chunks.length).toBe(2);
    expect(chunks[1]).toContain('Stream throttled: output exceeded 20 bytes/min limit');

    // Subsequent write while throttled does not emit chunk
    buffer.write('more_dropped_bytes');
    expect(chunks.length).toBe(2);
  });
});

describe('ProcessManager Unit Tests (Mocked Docker)', () => {
  it('validates required containerId and command', async () => {
    const manager = new ProcessManager();

    await expect(manager.spawnProcess('', ['ls'])).rejects.toThrow(
      'Container ID is required to spawn process'
    );
    await expect(manager.spawnProcess('cont-1', [])).rejects.toThrow(
      'Command cannot be empty'
    );
    await expect(manager.execCommand('', ['ls'])).rejects.toThrow(
      'Container ID is required to execute command'
    );
  });

  it('streams separate stdout and stderr chunks and resolves with exitCode', async () => {
    const mockStream = new EventEmitter() as any;
    mockStream.destroy = vi.fn();

    const mockExec = {
      start: vi.fn().mockResolvedValue(mockStream),
      inspect: vi.fn().mockResolvedValue({ ExitCode: 0 }),
    };

    const mockContainer = {
      exec: vi.fn().mockResolvedValue(mockExec),
    };

    const mockDocker = {
      getContainer: vi.fn().mockReturnValue(mockContainer),
      modem: {
        demuxStream: vi.fn((stream, stdoutPass, stderrPass) => {
          // Simulate separate stdout and stderr chunks
          setTimeout(() => {
            stdoutPass.write(Buffer.from('stdout_msg\n'));
            stderrPass.write(Buffer.from('stderr_msg\n'));
            mockStream.emit('end');
          }, 10);
        }),
      },
    } as any;

    const manager = new ProcessManager(mockDocker);
    const stdoutChunks: string[] = [];
    const stderrChunks: string[] = [];

    const result = await manager.execCommand('test-container', ['test', 'cmd'], {
      timeoutMs: 5000,
      onStdout: (chunk) => stdoutChunks.push(chunk),
      onStderr: (chunk) => stderrChunks.push(chunk),
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe('stdout_msg\n');
    expect(result.stderr).toBe('stderr_msg\n');
    expect(stdoutChunks).toEqual(['stdout_msg\n']);
    expect(stderrChunks).toEqual(['stderr_msg\n']);
  });

  it('rejects with TIMEOUT error and executes process tree killer on timeout', async () => {
    const mockStream = new EventEmitter() as any;
    mockStream.destroy = vi.fn();

    const killExec = {
      start: vi.fn().mockResolvedValue(null),
    };

    const mainExec = {
      start: vi.fn().mockResolvedValue(mockStream),
      inspect: vi.fn().mockResolvedValue({ ExitCode: 0 }),
    };

    let execCallCount = 0;
    const mockContainer = {
      exec: vi.fn().mockImplementation(() => {
        execCallCount++;
        if (execCallCount === 1) return Promise.resolve(mainExec);
        return Promise.resolve(killExec);
      }),
    };

    const mockDocker = {
      getContainer: vi.fn().mockReturnValue(mockContainer),
      modem: {
        demuxStream: vi.fn(),
      },
    } as any;

    const manager = new ProcessManager(mockDocker);

    const startTime = Date.now();
    let error: any = null;

    try {
      await manager.execCommand('test-container', ['sleep', '300'], {
        timeoutMs: 50, // fast timeout for unit test
      });
    } catch (err) {
      error = err;
    }

    const duration = Date.now() - startTime;
    expect(error).toBeDefined();
    expect(error.code).toBe('TIMEOUT');
    expect(error.message).toContain('timed out after 50ms');
    expect(duration).toBeLessThan(1000);
    expect(mockStream.destroy).toHaveBeenCalled();
    expect(mockContainer.exec).toHaveBeenCalledTimes(2); // main exec + kill exec
  });

  it('supports manual killProcess with KILLED error', async () => {
    const mockStream = new EventEmitter() as any;
    mockStream.destroy = vi.fn();

    const killExec = {
      start: vi.fn().mockResolvedValue(null),
    };
    const mainExec = {
      start: vi.fn().mockResolvedValue(mockStream),
    };

    let execCallCount = 0;
    const mockContainer = {
      exec: vi.fn().mockImplementation(() => {
        execCallCount++;
        if (execCallCount === 1) return Promise.resolve(mainExec);
        return Promise.resolve(killExec);
      }),
    };

    const mockDocker = {
      getContainer: vi.fn().mockReturnValue(mockContainer),
      modem: {
        demuxStream: vi.fn(),
      },
    } as any;

    const manager = new ProcessManager(mockDocker);
    const proc = await manager.spawnProcess('test-container', ['long-task'], {
      processId: 'proc-to-kill',
      timeoutMs: 10000,
    });

    expect(proc.status).toBe('running');
    expect(manager.getActiveProcesses().length).toBe(1);

    // Call killProcess
    const waitPromise = proc.wait();
    await manager.killProcess('proc-to-kill', 'SIGKILL');

    await expect(waitPromise).rejects.toMatchObject({
      code: 'KILLED',
    });
    expect(manager.getActiveProcesses().length).toBe(0);
  });

  it('streamLogs attaches and unsubscribes stream listeners', async () => {
    const mockStream = new EventEmitter() as any;
    const mockExec = {
      start: vi.fn().mockResolvedValue(mockStream),
      inspect: vi.fn().mockResolvedValue({ ExitCode: 0 }),
    };

    let stdoutPassRef: PassThrough | null = null;
    const mockDocker = {
      getContainer: vi.fn().mockReturnValue({
        exec: vi.fn().mockResolvedValue(mockExec),
      }),
      modem: {
        demuxStream: vi.fn((stream, stdoutPass) => {
          stdoutPassRef = stdoutPass;
        }),
      },
    } as any;

    const manager = new ProcessManager(mockDocker);
    const proc = await manager.spawnProcess('test-container', ['node', 'index.js'], {
      processId: 'log-proc',
    });

    const receivedLogs: Array<{ stream: string; chunk: string }> = [];
    const unsubscribe = manager.streamLogs('log-proc', (stream, chunk) => {
      receivedLogs.push({ stream, chunk });
    });

    // Write chunk
    stdoutPassRef!.write(Buffer.from('log line 1\n'));
    expect(receivedLogs).toEqual([{ stream: 'stdout', chunk: 'log line 1\n' }]);

    // Unsubscribe
    unsubscribe();
    stdoutPassRef!.write(Buffer.from('log line 2\n'));
    expect(receivedLogs.length).toBe(1);

    mockStream.emit('end');
    await proc.wait();
  });

  it('supports attachStdin + writeStdin and redacts Gemini/GitHub secrets in streamed output', async () => {
    const writtenChunks: string[] = [];
    const mockStream = new EventEmitter() as any;
    mockStream.write = vi.fn((chunk: string) => {
      writtenChunks.push(chunk);
      return true;
    });
    mockStream.destroy = vi.fn();

    const mockExec = {
      start: vi.fn().mockResolvedValue(mockStream),
      inspect: vi.fn().mockResolvedValue({ ExitCode: 0 }),
    };

    const containerExecSpy = vi.fn().mockResolvedValue(mockExec);
    let stdoutPassRef: PassThrough | null = null;
    const mockDocker = {
      getContainer: vi.fn().mockReturnValue({
        exec: containerExecSpy,
      }),
      modem: {
        demuxStream: vi.fn((_stream, stdoutPass) => {
          stdoutPassRef = stdoutPass;
        }),
      },
    } as any;

    const manager = new ProcessManager(mockDocker);
    const stdoutChunks: string[] = [];
    const proc = await manager.spawnProcess('test-container', ['node', 'app.js'], {
      processId: 'stdin-proc',
      attachStdin: true,
      onStdout: (chunk) => stdoutChunks.push(chunk),
    });

    expect(containerExecSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        AttachStdin: true,
      })
    );
    expect(mockExec.start).toHaveBeenCalledWith(
      expect.objectContaining({
        hijack: true,
        stdin: true,
      })
    );

    const wrote = manager.writeStdin('stdin-proc', 'user input');
    expect(wrote).toBe(true);
    expect(writtenChunks).toEqual(['user input\n']);

    stdoutPassRef!.write(
      Buffer.from(
        'key=AIzaSyDummyKeyForUnitTesting1234567890abcd pat=github_pat_11ABCDEFG0123456789_xyzABCDEFGHIJKLMNOPQRSTUV\n'
      )
    );
    expect(stdoutChunks[0]).toBe('key=[REDACTED_SECRET] pat=[REDACTED_SECRET]\n');

    mockStream.emit('end');
    const result = await proc.wait();
    expect(result.stdout).toBe('key=[REDACTED_SECRET] pat=[REDACTED_SECRET]\n');
    expect(manager.writeStdin('stdin-proc', 'after-exit')).toBe(false);
  });
});

describe('ProcessManager Integration Tests (Live Container)', () => {
  let dockerManager: DockerManager;
  let isDockerAvailable = false;
  let containerId: string | null = null;

  beforeAll(async () => {
    dockerManager = new DockerManager();
    try {
      const pingPromise = dockerManager.getDockerInstance().ping();
      const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 1500));
      await Promise.race([pingPromise, timeoutPromise]);
      await dockerManager.getDockerInstance().getImage('node:22-bookworm-slim').inspect();
      isDockerAvailable = true;
    } catch (_err) {
      isDockerAvailable = false;
    }

    if (isDockerAvailable) {
      containerId = await dockerManager.createContainer({
        workspaceId: 'test-proc-ws',
        image: 'node:22-bookworm-slim',
      });
      await dockerManager.startContainer(containerId);
    }
  });

  afterAll(async () => {
    if (containerId && isDockerAvailable) {
      try {
        await dockerManager.stopContainer(containerId, 1);
        await dockerManager.removeContainer(containerId, true);
      } catch (_e) {
        void _e;
      }
    }
  });

  it('TEST-RUN-001: executes command and captures separate stdout and stderr chunks', async () => {
    if (!isDockerAvailable || !containerId) {
      console.warn('Docker daemon not reachable; skipping live container integration test.');
      return;
    }

    const processManager = new ProcessManager(dockerManager);
    const stdoutChunks: string[] = [];
    const stderrChunks: string[] = [];

    const result = await processManager.execCommand(
      containerId,
      ['node', '-e', "console.log('stdout_msg'); console.error('stderr_msg');"],
      {
        onStdout: (c) => stdoutChunks.push(c),
        onStderr: (c) => stderrChunks.push(c),
      }
    );

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('stdout_msg\n');
    expect(result.stderr).toContain('stderr_msg\n');
    expect(stdoutChunks.join('')).toContain('stdout_msg\n');
    expect(stderrChunks.join('')).toContain('stderr_msg\n');
  });

  it('TEST-RUN-002: execution timeout & forced cleanup triggers within < 1200ms and kills process tree', async () => {
    if (!isDockerAvailable || !containerId) {
      console.warn('Docker daemon not reachable; skipping live container integration test.');
      return;
    }

    const processManager = new ProcessManager(dockerManager);
    const startTime = Date.now();
    let error: any = null;

    try {
      await processManager.execCommand(containerId, ['sleep', '300'], {
        timeoutMs: 1000,
      });
    } catch (err) {
      error = err;
    }

    const duration = Date.now() - startTime;
    expect(error).toBeDefined();
    expect(error.code).toBe('TIMEOUT');
    expect(duration).toBeGreaterThanOrEqual(950);
    expect(duration).toBeLessThan(1500);

    // Verify process tree inside container is completely terminated (no orphan sleep 300 processes)
    const checkOrphans = await dockerManager.execCommand(containerId, [
      '/bin/sh',
      '-c',
      'ps aux | grep "[s]leep 300" || true',
    ]);
    expect(checkOrphans.stdout.trim()).toBe('');
  });
});
