import Docker from 'dockerode';
import { PassThrough } from 'node:stream';

export interface CreateContainerOptions {
  workspaceId: string;
  hostPath?: string;
  image?: string;
  containerName?: string;
  env?: Record<string, string>;
}

export interface ExecOptions {
  cwd?: string;
  env?: Record<string, string>;
  timeoutMs?: number;
}

export interface ExecResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export class DockerManager {
  private docker: Docker;

  constructor(dockerOptions?: Docker.DockerOptions) {
    this.docker = new Docker(dockerOptions);
  }

  public getDockerInstance(): Docker {
    return this.docker;
  }

  public async createContainer(options: CreateContainerOptions): Promise<string> {
    const { workspaceId, hostPath, image = 'node:22-bookworm-slim', containerName, env } = options;

    if (hostPath && hostPath.includes('docker.sock')) {
      throw new Error('Mounting docker.sock inside sandbox container is strictly prohibited');
    }

    const binds: string[] = [];
    if (hostPath) {
      binds.push(`${hostPath}:/workspace:rw`);
    }

    const envArray: string[] = [
      `WORKSPACE_ID=${workspaceId}`,
      `NODE_ENV=development`,
      ...(env ? Object.entries(env).map(([k, v]) => `${k}=${v}`) : []),
    ];

    const containerOptions: Docker.ContainerCreateOptions = {
      Image: image,
      name: containerName || `covibe-sandbox-${workspaceId}-${Date.now()}`,
      Cmd: ['sleep', 'infinity'],
      User: '10001',
      WorkingDir: '/workspace',
      Env: envArray,
      HostConfig: {
        Binds: binds,
        NanoCpus: 2 * 1e9, // 2 CPUs
        Memory: 1024 * 1024 * 1024, // 1GB
        MemorySwap: 1024 * 1024 * 1024, // 1GB (no extra swap)
        PidsLimit: 256,
        CapDrop: ['ALL'],
        SecurityOpt: ['no-new-privileges:true'],
        Tmpfs: {
          '/tmp': 'rw,noexec,nosuid,size=256m',
        },
      },
    };

    const container = await this.docker.createContainer(containerOptions);
    return container.id;
  }

  public async startContainer(containerId: string): Promise<void> {
    const container = this.docker.getContainer(containerId);
    await container.start();
  }

  public async stopContainer(containerId: string, timeoutSec: number = 10): Promise<void> {
    const container = this.docker.getContainer(containerId);
    try {
      await container.stop({ t: timeoutSec });
    } catch (err: any) {
      if (err?.statusCode !== 304 && err?.statusCode !== 404) {
        throw err;
      }
    }
  }

  public async removeContainer(containerId: string, force: boolean = true): Promise<void> {
    const container = this.docker.getContainer(containerId);
    try {
      await container.remove({ force, v: true });
    } catch (err: any) {
      if (err?.statusCode !== 404) {
        throw err;
      }
    }
  }

  public async inspectContainer(containerId: string): Promise<Docker.ContainerInspectInfo> {
    const container = this.docker.getContainer(containerId);
    return await container.inspect();
  }

  public async execCommand(
    containerId: string,
    cmd: string[],
    opts?: ExecOptions
  ): Promise<ExecResult> {
    const container = this.docker.getContainer(containerId);
    const timeoutMs = opts?.timeoutMs || 60000;

    const exec = await container.exec({
      Cmd: cmd,
      AttachStdout: true,
      AttachStderr: true,
      WorkingDir: opts?.cwd || '/workspace',
      Env: opts?.env ? Object.entries(opts.env).map(([k, v]) => `${k}=${v}`) : undefined,
    });

    const stream = (await exec.start({
      hijack: true,
      stdin: false,
    })) as unknown as NodeJS.ReadableStream;

    return new Promise<ExecResult>((resolve, reject) => {
      let stdout = '';
      let stderr = '';
      let timer: NodeJS.Timeout | null = null;
      let completed = false;

      const stdoutStream = new PassThrough();
      const stderrStream = new PassThrough();

      stdoutStream.on('data', (chunk: Buffer) => {
        stdout += chunk.toString('utf-8');
      });

      stderrStream.on('data', (chunk: Buffer) => {
        stderr += chunk.toString('utf-8');
      });

      this.docker.modem.demuxStream(stream, stdoutStream, stderrStream);

      const cleanup = () => {
        if (timer) clearTimeout(timer);
      };

      timer = setTimeout(() => {
        if (!completed) {
          completed = true;
          try {
            (stream as unknown as { destroy?: () => void }).destroy?.();
          } catch (err) {
            void err;
          }
          reject(new Error(`Command execution timed out after ${timeoutMs}ms`));
        }
      }, timeoutMs);

      stream.on('end', async () => {
        if (completed) return;
        completed = true;
        cleanup();
        try {
          const inspectData = await exec.inspect();
          resolve({
            stdout,
            stderr,
            exitCode: inspectData.ExitCode ?? 0,
          });
        } catch (err) {
          reject(err);
        }
      });

      stream.on('error', (err: Error) => {
        if (completed) return;
        completed = true;
        cleanup();
        reject(err);
      });
    });
  }
}
