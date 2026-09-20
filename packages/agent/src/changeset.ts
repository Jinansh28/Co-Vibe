import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

const execFileAsync = promisify(execFile);

export type ChangeSetStatus = 'pending' | 'accepted' | 'rejected' | 'stale' | 'conflicted';

export interface ChangeSet {
  id: string;
  taskId: string;
  runId?: string;
  baseRevision: string;
  status: ChangeSetStatus;
  patch: string;
  changedFiles: string[];
}

export class ChangeSetManager {
  private workspacePath: string;

  constructor(workspacePath: string) {
    this.workspacePath = workspacePath;
  }

  private async execGit(args: string[]): Promise<string> {
    const { stdout } = await execFileAsync('git', args, { cwd: this.workspacePath });
    return stdout.trim();
  }

  async applyChangeSet(changeSet: ChangeSet, acceptedHunks?: boolean): Promise<ChangeSetStatus> {
    if (changeSet.status !== 'pending' && changeSet.status !== 'stale') {
      return changeSet.status;
    }

    const patchPath = path.join(this.workspacePath, `.git`, `patch-${changeSet.id}.diff`);
    
    try {
      const currentHead = await this.execGit(['rev-parse', 'HEAD']);
      await fs.writeFile(patchPath, changeSet.patch, 'utf-8');

      if (currentHead === changeSet.baseRevision) {
        // Clean apply since base revision is identical
        try {
          await this.execGit(['apply', patchPath]);
          return 'accepted';
        } catch (err: any) {
          console.error("Clean apply failed:", err);
          return 'conflicted';
        }
      } else {
        // Base revision changed, try 3-way apply
        try {
          await this.execGit(['apply', '--3way', patchPath]);
          
          // Verify if it introduced conflict markers
          const diff = await this.execGit(['diff']);
          if (diff.includes('<<<<<<<')) {
            // Revert the conflicting changes safely
            if (changeSet.changedFiles && changeSet.changedFiles.length > 0) {
              await this.execGit(['checkout', 'HEAD', '--', ...changeSet.changedFiles]);
            } else {
              await this.execGit(['reset', '--hard', 'HEAD']);
            }
            return 'conflicted';
          }
          
          return 'accepted';
        } catch (err: any) {
          console.error("3-way apply failed:", err);
          // If git apply --3way fails (e.g., due to conflicts), it returns non-zero.
          // Restore the modified files to avoid workspace corruption.
          if (changeSet.changedFiles && changeSet.changedFiles.length > 0) {
            await this.execGit(['checkout', 'HEAD', '--', ...changeSet.changedFiles]);
          } else {
            // Fallback reset if changed files aren't tracked
            await this.execGit(['reset', '--hard', 'HEAD']);
          }
          return 'conflicted';
        }
      }
    } catch (error) {
      return 'conflicted';
    } finally {
      await fs.unlink(patchPath).catch(() => {});
    }
  }
}
