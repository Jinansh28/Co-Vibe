import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { GitWorktreeManager } from '../src/worktree.js';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { execa } from 'execa';

describe('GitWorktreeManager', () => {
  let tempDir: string;
  let worktreesToRemove: string[];
  let worktreeManager: GitWorktreeManager;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'git-manager-test-'));
    worktreesToRemove = [];
    await execa('git', ['init'], { cwd: tempDir });
    
    // Set up initial commit
    await fs.writeFile(path.join(tempDir, 'file.txt'), 'initial content');
    await execa('git', ['add', '.'], { cwd: tempDir });
    await execa('git', ['commit', '-m', 'initial commit'], { cwd: tempDir });

    worktreeManager = new GitWorktreeManager(tempDir);
  });

  afterEach(async () => {
    for (const wt of worktreesToRemove) {
      try {
        await worktreeManager.removeWorktree(wt);
      } catch (e) {
        // Ignore errors during cleanup
      }
    }
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('should create and remove a worktree', async () => {
    const worktreePath = path.join(tempDir, '..', 'wt-' + Math.random().toString(36).substring(7));
    worktreesToRemove.push(worktreePath);
    
    await worktreeManager.createWorktree('HEAD', worktreePath);
    
    const stat = await fs.stat(worktreePath);
    expect(stat.isDirectory()).toBe(true);

    const fileContent = await fs.readFile(path.join(worktreePath, 'file.txt'), 'utf-8');
    expect(fileContent).toBe('initial content');

    await worktreeManager.removeWorktree(worktreePath);
    
    // Ensure it's pruned from disk
    await expect(fs.stat(worktreePath)).rejects.toThrow();
    
    // Ensure main workspace is unaffected
    const mainStat = await fs.stat(tempDir);
    expect(mainStat.isDirectory()).toBe(true);
  });

  it('should generate binary patch diff', async () => {
    const worktreePath = path.join(tempDir, '..', 'wt-' + Math.random().toString(36).substring(7));
    worktreesToRemove.push(worktreePath);
    
    await worktreeManager.createWorktree('HEAD', worktreePath);
    
    // Modify file in worktree
    await fs.writeFile(path.join(worktreePath, 'file.txt'), 'modified content');
    
    const patch = await worktreeManager.generatePatch(worktreePath, 'HEAD');
    
    expect(patch).toContain('diff --git a/file.txt b/file.txt');
    expect(patch).toContain('-initial content');
    expect(patch).toContain('+modified content');
    
    // Ensure main workspace branch is untouched
    const mainContent = await fs.readFile(path.join(tempDir, 'file.txt'), 'utf-8');
    expect(mainContent).toBe('initial content');
  });
});
