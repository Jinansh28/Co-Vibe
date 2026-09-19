import { execa } from 'execa';

export interface GitStatus {
  staged: string[];
  modified: string[];
  untracked: string[];
}

export class GitManager {
  constructor(private workspacePath: string) {}

  private async exec(args: string[]): Promise<string> {
    const { stdout } = await execa('git', args, { cwd: this.workspacePath });
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
      const path = line.substring(3).trim();

      if (x === '?' && y === '?') {
        status.untracked.push(path);
      } else {
        if (x !== ' ' && x !== '?') {
          status.staged.push(path);
        }
        if (y !== ' ' && y !== '?') {
          status.modified.push(path);
        }
      }
    }

    return status;
  }

  async getDiff(): Promise<string> {
    return await this.exec(['diff']);
  }

  async createBranch(branchName: string): Promise<void> {
    await this.exec(['checkout', '-b', branchName]);
  }

  async commit(message: string): Promise<void> {
    await this.exec(['commit', '-m', message]);
  }
}
