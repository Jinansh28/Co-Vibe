import { execa } from 'execa';

export interface GitStatus {
  staged: string[];
  modified: string[];
  untracked: string[];
}

export interface GitCloneOptions {
  targetDir?: string;
  branch?: string;
  authToken?: string;
}

export interface GitCommitOptions {
  stageAll?: boolean;
  authorName?: string;
  authorEmail?: string;
}

function sanitizeGitError(message: string, authToken?: string): string {
  let sanitized = message;
  if (authToken) {
    sanitized = sanitized.split(authToken).join('[REDACTED]');
    const basicCred = Buffer.from(`x-access-token:${authToken}`).toString('base64');
    sanitized = sanitized.split(basicCred).join('[REDACTED]');
  }
  return sanitized.replace(/Authorization:\s*Basic\s+\S+/gi, 'Authorization: Basic [REDACTED]');
}

export class GitManager {
  constructor(private workspacePath: string) {}

  private async exec(args: string[]): Promise<string> {
    const { stdout } = await execa('git', args, {
      cwd: this.workspacePath,
      env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
    });
    return stdout;
  }

  async getStatus(): Promise<GitStatus> {
    const output = await this.exec(['status', '--porcelain']);
    const lines = output.split('\n').filter(line => line.trim().length > 0);
    
    const status: GitStatus = {
      staged: [],
      modified: [],
      untracked: []
    };

    for (const line of lines) {
      const x = line[0];
      const y = line[1];
      const filePath = line.substring(3).trim();

      if (x === '?' && y === '?') {
        status.untracked.push(filePath);
      } else {
        if (x !== ' ' && x !== '?') {
          status.staged.push(filePath);
        }
        if (y !== ' ' && y !== '?') {
          status.modified.push(filePath);
        }
      }
    }

    return status;
  }

  async getCurrentBranch(): Promise<string> {
    const output = await this.exec(['rev-parse', '--abbrev-ref', 'HEAD']);
    return output.trim();
  }

  async getDiff(): Promise<string> {
    return await this.exec(['diff']);
  }

  async createBranch(branchName: string): Promise<void> {
    try {
      await this.exec(['checkout', '-b', branchName]);
    } catch {
      await this.exec(['checkout', branchName]);
    }
  }

  async commit(message: string, options?: GitCommitOptions): Promise<void> {
    if (options?.stageAll) {
      await this.exec(['add', '-A']);
    }

    const args: string[] = [];
    if (options?.authorName) {
      args.push('-c', `user.name=${options.authorName}`);
    }
    if (options?.authorEmail) {
      args.push('-c', `user.email=${options.authorEmail}`);
    }
    args.push('commit', '-m', message);
    await this.exec(args);
  }

  async clone(repoUrl: string, options?: GitCloneOptions): Promise<void> {
    const parsedUrl = new URL(repoUrl);
    if (parsedUrl.protocol !== 'https:' || parsedUrl.username || parsedUrl.password) {
      throw new Error('Only clean HTTPS repository URLs without embedded credentials are allowed');
    }

    const args: string[] = [];
    if (options?.authToken) {
      const basicCred = Buffer.from(`x-access-token:${options.authToken}`).toString('base64');
      args.push('-c', `http.${parsedUrl.origin}/.extraheader=Authorization: Basic ${basicCred}`);
    }

    args.push('clone');
    if (options?.branch) {
      args.push('--branch', options.branch);
    }
    args.push('--', repoUrl, options?.targetDir ?? '.');

    try {
      await execa('git', args, {
        cwd: this.workspacePath,
        env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
      });
    } catch (err) {
      const rawMessage = err instanceof Error ? err.message : String(err);
      throw new Error(sanitizeGitError(rawMessage, options?.authToken));
    }
  }
}
