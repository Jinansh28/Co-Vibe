import Docker from 'dockerode';
import { PassThrough } from 'node:stream';
import { randomUUID } from 'node:crypto';
import { DockerManager } from '../docker/DockerManager.js';
import { StreamBuffer } from './streamBuffer.js';
import type { TerminalOutputPayload, WsEnvelope } from '@co-vibe/protocol';

export interface ProcessExecOptions {
  containerId?: string;
  processId?: string;
  workspaceId?: string;
  clientId?: string;
  cwd?: string;
  env?: Record<string, string>;
  /** Timeout in milliseconds (default: 60,000 ms mandatory default) */
  timeoutMs?: number;
  /** Wrap with /bin/sh PID tracker for robust tree killing (default: true) */
  wrapCommand?: boolean;
  /** Max bytes allowed per minute on stdout/stderr (default: 1 MiB) */
  maxBytesPerMinute?: number;
  onStdout?: (chunk: string) => void;
  onStderr?: (chunk: string) => void;
  onOutput?: (payload: TerminalOutputPayload) => void;
  onEnvelope?: (envelope: WsEnvelope<TerminalOutputPayload>) => void;
}

export interface ProcessExecResult {
  processId: string;
  stdout: string;
  stderr: string;
  exitCode: number;
}

export interface ManagedProcess {
  processId: string;
  containerId: string;
  command: string[];
  startTime: number;
  status: 'running' | 'completed' | 'failed' | 'killed' | 'timed_out';
  exitCode: number | null;
  kill: (signal?: string) => Promise<void>;
  wait: () => Promise<ProcessExecResult>;
  onOutput: (listener: (stream: 'stdout' | 'stderr', chunk: string) => void) => () => void;
}

export interface IProcessManager {
  spawnProcess(containerId: string, command: string[], opts?: ProcessExecOptions): Promise<ManagedProcess>;
  killProcess(processId: string, signal?: string): Promise<void>;
  streamLogs(processId: string, onLine: (stream: 'stdout' | 'stderr', chunk: string) => void): () => void;
}

interface InternalProcessRecord extends ManagedProcess {
  stream?: NodeJS.ReadableStream;
  timer?: NodeJS.Timeout | null;
  finish: (result: ProcessExecResult | Error) => void;
  listeners: Set<(stream: 'stdout' | 'stderr', chunk: string) => void>;
  stdoutBuffer: StreamBuffer;
  stderrBuffer: StreamBuffer;
}

export class ProcessManager implements IProcessManager {
  private docker: Docker;
  private dockerManager?: DockerManager;
  private activeProcesses: Map<string, InternalProcessRecord> = new Map();

  constructor(dockerOrManager?: Docker | DockerManager | any) {
    if (dockerOrManager) {
      if (typeof (dockerOrManager as DockerManager).getDockerInstance === 'function') {
        this.dockerManager = dockerOrManager as DockerManager;
        this.docker = (dockerOrManager as DockerManager).getDockerInstance();
      } else {
        this.docker = dockerOrManager as Docker;
      }
    } else {
      this.dockerManager = new DockerManager();
      this.docker = this.dockerManager.getDockerInstance();
    }
  }

  public getDockerInstance(): Docker {
    return this.docker;
  }

  public getActiveProcesses(): ManagedProcess[] {
    return Array.from(this.activeProcesses.values());
  }

  public getProcess(processId: string): ManagedProcess | undefined {
    return this.activeProcesses.get(processId);
  }

  public async spawnProcess(
    containerId: string,
    command: string[],
    opts?: ProcessExecOptions
  ): Promise<ManagedProcess> {
    if (!containerId) {
      throw new Error('Container ID is required to spawn process');
    }
    if (!command || command.length === 0) {
      throw new Error('Command cannot be empty');
    }

    const processId = opts?.processId || randomUUID();
    const timeoutMs = opts?.timeoutMs ?? 60000;
    const pidFile = `/tmp/covibe-${processId}.pid`;
    const wrap = opts?.wrapCommand ?? true;

    // Use PID recording wrapper to accurately track the spawned process & enable process-tree killing
    const finalCmd = wrap
      ? ['/bin/sh', '-c', 'echo $$ > "$1" && shift && exec "$@"', '--', pidFile, ...command]
      : command;

    const listeners = new Set<(stream: 'stdout' | 'stderr', chunk: string) => void>();

    const emitToListeners = (stream: 'stdout' | 'stderr', chunk: string) => {
      listeners.forEach((listener) => {
        try {
          listener(stream, chunk);
        } catch (_err) {
          // Ignore listener error
        }
      });
    };

    const stdoutBuffer = new StreamBuffer({
      processId,
      stream: 'stdout',
      workspaceId: opts?.workspaceId,
      clientId: opts?.clientId,
      maxBytesPerMinute: opts?.maxBytesPerMinute,
      onChunk: (chunk) => {
        opts?.onStdout?.(chunk);
        emitToListeners('stdout', chunk);
      },
      onPayload: opts?.onOutput,
      onEnvelope: opts?.onEnvelope,
    });

    const stderrBuffer = new StreamBuffer({
      processId,
      stream: 'stderr',
      workspaceId: opts?.workspaceId,
      clientId: opts?.clientId,
      maxBytesPerMinute: opts?.maxBytesPerMinute,
      onChunk: (chunk) => {
        opts?.onStderr?.(chunk);
        emitToListeners('stderr', chunk);
      },
      onPayload: opts?.onOutput,
      onEnvelope: opts?.onEnvelope,
    });

    let resolveWait!: (result: ProcessExecResult) => void;
    let rejectWait!: (err: Error) => void;
    const waitPromise = new Promise<ProcessExecResult>((resolve, reject) => {
      resolveWait = resolve;
      rejectWait = reject;
    });

    let isCompleted = false;

    const internalRecord: InternalProcessRecord = {
      processId,
      containerId,
      command,
      startTime: Date.now(),
      status: 'running',
      exitCode: null,
      listeners,
      stdoutBuffer,
      stderrBuffer,
      finish: (result: ProcessExecResult | Error) => {
        if (isCompleted) return;
        isCompleted = true;

        if (internalRecord.timer) {
          clearTimeout(internalRecord.timer);
          internalRecord.timer = null;
        }

        stdoutBuffer.end();
        stderrBuffer.end();
        this.activeProcesses.delete(processId);

        if (result instanceof Error) {
          rejectWait(result);
        } else {
          internalRecord.exitCode = result.exitCode;
          resolveWait(result);
        }
      },
      kill: async (signal: string = 'SIGKILL') => {
        if (isCompleted) return;
        internalRecord.status = 'killed';
        await this.killProcessTree(containerId, processId, signal);
        try {
          (internalRecord.stream as unknown as { destroy?: () => void })?.destroy?.();
        } catch (_e) {
          // Ignore stream destroy error
        }
        const killedError = new Error(`Process ${processId} was killed with ${signal}`);
        (killedError as unknown as { code: string }).code = 'KILLED';
        internalRecord.finish(killedError);
      },
      wait: () => waitPromise,
      onOutput: (listener: (stream: 'stdout' | 'stderr', chunk: string) => void) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
    };

    this.activeProcesses.set(processId, internalRecord);

    const container = this.docker.getContainer(containerId);
    let exec: Docker.Exec;
    try {
      exec = await container.exec({
        Cmd: finalCmd,
        AttachStdout: true,
        AttachStderr: true,
        WorkingDir: opts?.cwd || '/workspace',
        Env: opts?.env ? Object.entries(opts.env).map(([k, v]) => `${k}=${v}`) : undefined,
      });
    } catch (err) {
      this.activeProcesses.delete(processId);
      throw err;
    }

    let stream: NodeJS.ReadableStream;
    try {
      stream = (await exec.start({
        hijack: true,
        stdin: false,
      })) as unknown as NodeJS.ReadableStream;
      internalRecord.stream = stream;
    } catch (err) {
      this.activeProcesses.delete(processId);
      throw err;
    }

    const stdoutPass = new PassThrough();
    const stderrPass = new PassThrough();

    stdoutPass.on('data', (chunk: Buffer) => {
      stdoutBuffer.write(chunk);
    });

    stderrPass.on('data', (chunk: Buffer) => {
      stderrBuffer.write(chunk);
    });

    this.docker.modem.demuxStream(stream, stdoutPass, stderrPass);

    // Enforce execution timeout (mandatory default 60s)
    if (timeoutMs > 0) {
      internalRecord.timer = setTimeout(async () => {
        if (isCompleted) return;
        internalRecord.status = 'timed_out';
        try {
          await this.killProcessTree(containerId, processId, 'SIGKILL');
        } catch (_e) {
          // Ignore kill error
        }
        try {
          (stream as unknown as { destroy?: () => void })?.destroy?.();
        } catch (_e) {
          // Ignore stream destroy error
        }
        const timeoutError = new Error(`Command execution timed out after ${timeoutMs}ms`);
        (timeoutError as unknown as { code: string }).code = 'TIMEOUT';
        internalRecord.finish(timeoutError);
      }, timeoutMs);
    }

    stream.on('end', async () => {
      if (isCompleted) return;
      internalRecord.status = 'completed';

      // Best effort removal of pidfile
      this.cleanupPidFile(containerId, processId).catch((_err) => {
        void _err;
      });

      let exitCode = 0;
      try {
        const inspectData = await exec.inspect();
        exitCode = inspectData.ExitCode ?? 0;
      } catch (_e) {
        // Fallback to exitCode 0 if inspect fails
      }

      internalRecord.finish({
        processId,
        stdout: stdoutBuffer.getBufferedContent(),
        stderr: stderrBuffer.getBufferedContent(),
        exitCode,
      });
    });

    stream.on('error', (err: Error) => {
      if (isCompleted) return;
      internalRecord.status = 'failed';
      internalRecord.finish(err);
    });

    return internalRecord;
  }

  public async execCommand(
    containerIdOrCmd: string | string[],
    cmdOrOpts?: string[] | ProcessExecOptions,
    maybeOpts?: ProcessExecOptions
  ): Promise<ProcessExecResult> {
    let containerId: string;
    let command: string[];
    let opts: ProcessExecOptions | undefined;

    if (typeof containerIdOrCmd === 'string') {
      containerId = containerIdOrCmd;
      command = (cmdOrOpts as string[]) || [];
      opts = maybeOpts;
    } else {
      command = containerIdOrCmd;
      opts = cmdOrOpts as ProcessExecOptions | undefined;
      containerId = opts?.containerId || '';
    }

    if (!containerId) {
      throw new Error('Container ID is required to execute command');
    }

    const proc = await this.spawnProcess(containerId, command, opts);
    return await proc.wait();
  }

  public async killProcess(processId: string, signal: string = 'SIGKILL'): Promise<void> {
    const proc = this.activeProcesses.get(processId);
    if (!proc) {
      return;
    }
    await proc.kill(signal);
  }

  public streamLogs(
    processId: string,
    onLine: (stream: 'stdout' | 'stderr', chunk: string) => void
  ): () => void {
    const proc = this.activeProcesses.get(processId);
    if (!proc) {
      throw new Error(`Process with ID ${processId} not found or has finished`);
    }
    return proc.onOutput(onLine);
  }

  private async killProcessTree(containerId: string, processId: string, signal: string): Promise<void> {
    const pidFile = `/tmp/covibe-${processId}.pid`;
    const sigNum = signal === 'SIGKILL' || signal === '9' ? '9' : signal.replace(/^SIG/, '');

    // Process tree killer script:
    // 1. Reads recorded PID from pidFile
    // 2. Kills process tree using pkill -P if available
    // 3. Walks /proc/<pid>/status to kill any child processes (orphans)
    // 4. Kills parent PID with requested signal (default SIGKILL / 9)
    // 5. Removes pidFile
    const script = `
      PID=$(cat "${pidFile}" 2>/dev/null)
      if [ -n "$PID" ]; then
        if command -v pkill >/dev/null 2>&1; then
          pkill -${sigNum} -P "$PID" 2>/dev/null || true
        fi
        for cpid in $(grep -l "PPID.*$PID" /proc/[0-9]*/status 2>/dev/null | cut -d/ -f3); do
          kill -${sigNum} "$cpid" 2>/dev/null || true
        done
        kill -${sigNum} "$PID" 2>/dev/null || true
        rm -f "${pidFile}" 2>/dev/null || true
      fi
    `;

    try {
      const container = this.docker.getContainer(containerId);
      const killExec = await container.exec({
        Cmd: ['/bin/sh', '-c', script],
        AttachStdout: false,
        AttachStderr: false,
      });
      await killExec.start({ hijack: false, stdin: false });
    } catch (_e) {
      // Best-effort cleanup inside container
    }
  }

  private async cleanupPidFile(containerId: string, processId: string): Promise<void> {
    const pidFile = `/tmp/covibe-${processId}.pid`;
    try {
      const container = this.docker.getContainer(containerId);
      const rmExec = await container.exec({
        Cmd: ['rm', '-f', pidFile],
        AttachStdout: false,
        AttachStderr: false,
      });
      await rmExec.start({ hijack: false, stdin: false });
    } catch (_e) {
      // Best effort cleanup
    }
  }
}
