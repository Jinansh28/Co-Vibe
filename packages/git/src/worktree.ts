import { execa } from 'execa';

export class GitWorktreeManager {
  constructor(private workspacePath: string) {}

  async createWorktree(baseCommit: string, worktreePath: string): Promise<void> {
    await execa('git', ['worktree', 'add', '--detach', worktreePath, baseCommit], {
      cwd: this.workspacePath,
    });
  }

  async generatePatch(worktreePath: string, baseCommit: string): Promise<string> {
    const { stdout } = await execa('git', ['diff', '--binary', baseCommit], {
      cwd: worktreePath,
    });
    return stdout;
  }

  async removeWorktree(worktreePath: string): Promise<void> {
    await execa('git', ['worktree', 'remove', '-f', worktreePath], {
      cwd: this.workspacePath,
    });
  }
}
