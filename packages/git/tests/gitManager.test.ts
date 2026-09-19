import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { GitManager } from '../src/GitManager.js';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { execa } from 'execa';

describe('GitManager', () => {
  let tempDir: string;
  let git: GitManager;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'git-manager-test-'));
    await execa('git', ['init'], { cwd: tempDir });
    
    // Set up initial commit
    await fs.writeFile(path.join(tempDir, 'file.txt'), 'initial content');
    await execa('git', ['add', '.'], { cwd: tempDir });
    await execa('git', ['commit', '-m', 'initial commit'], { cwd: tempDir });

    git = new GitManager(tempDir);
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('should get status', async () => {
    await fs.writeFile(path.join(tempDir, 'file.txt'), 'modified content');
    await fs.writeFile(path.join(tempDir, 'new.txt'), 'new content');
    
    const status = await git.getStatus();
    
    expect(status.modified).toContain('file.txt');
    expect(status.untracked).toContain('new.txt');
    expect(status.staged).toHaveLength(0);
  });

  it('should get diff', async () => {
    await fs.writeFile(path.join(tempDir, 'file.txt'), 'modified content');
    
    const diff = await git.getDiff();
    
    expect(diff).toContain('diff --git a/file.txt b/file.txt');
    expect(diff).toContain('-initial content');
    expect(diff).toContain('+modified content');
  });

  it('should create branch', async () => {
    await git.createBranch('feature');
    const { stdout } = await execa('git', ['branch', '--show-current'], { cwd: tempDir });
    expect(stdout).toBe('feature');
  });

  it('should commit', async () => {
    await fs.writeFile(path.join(tempDir, 'file.txt'), 'modified content');
    await execa('git', ['add', '.'], { cwd: tempDir });
    await git.commit('my commit message');
    
    const { stdout } = await execa('git', ['log', '-1', '--pretty=%B'], { cwd: tempDir });
    expect(stdout.trim()).toBe('my commit message');
  });
});
