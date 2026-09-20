import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { ChangeSetManager, type ChangeSet } from '../src/changeset.js';

const execFileAsync = promisify(execFile);

describe('ChangeSetManager', () => {
  let workspacePath: string;
  let manager: ChangeSetManager;

  const execGitRaw = async (args: string[]) => {
    const { stdout } = await execFileAsync('git', args, { cwd: workspacePath });
    return stdout;
  };

  const execGit = async (args: string[]) => {
    const { stdout } = await execFileAsync('git', args, { cwd: workspacePath });
    return stdout.trim();
  };

  beforeEach(async () => {
    workspacePath = await fs.mkdtemp(path.join(os.tmpdir(), 'covibe-agent-test-'));
    manager = new ChangeSetManager(workspacePath);

    await execGit(['init']);
    await execGit(['config', 'user.name', 'Test User']);
    await execGit(['config', 'user.email', 'test@example.com']);
    await execGit(['config', 'core.autocrlf', 'false']); // Avoid Windows line ending issues
  });

  afterEach(async () => {
    await fs.rm(workspacePath, { recursive: true, force: true });
  });

  it('should apply a clean patch when base revision matches', async () => {
    // Setup initial state
    await fs.writeFile(path.join(workspacePath, 'test.txt'), 'line 1\nline 2\nline 3\n');
    await execGit(['add', 'test.txt']);
    await execGit(['commit', '-m', 'initial']);
    const baseRevision = await execGit(['rev-parse', 'HEAD']);

    // Create a branch for agent changes
    await execGit(['checkout', '-b', 'agent-branch']);
    await fs.writeFile(path.join(workspacePath, 'test.txt'), 'line 1\nline 2 changed\nline 3\n');
    await execGit(['add', 'test.txt']);
    await execGit(['commit', '-m', 'agent change']);
    
    // Generate patch
    const patch = (await execGitRaw(['diff', baseRevision, 'HEAD'])).replace(/\r\n/g, '\n') + '\n';
    
    await execGit(['checkout', '-']);

    const changeSet: ChangeSet = {
      id: 'cs-1',
      taskId: 'task-1',
      baseRevision,
      status: 'pending',
      patch,
      changedFiles: ['test.txt']
    };

    const status = await manager.applyChangeSet(changeSet);
    expect(status).toBe('accepted');

    const content = await fs.readFile(path.join(workspacePath, 'test.txt'), 'utf-8');
    expect(content.replace(/\r\n/g, '\n')).toBe('line 1\nline 2 changed\nline 3\n');
  });

  it('should apply using 3-way merge when base revision has changed but no conflict', async () => {
    // Setup initial state
    await fs.writeFile(path.join(workspacePath, 'test.txt'), 'line 1\nline 2\nline 3\nline 4\nline 5\n');
    await execGit(['add', 'test.txt']);
    await execGit(['commit', '-m', 'initial']);
    const baseRevision = (await execGit(['rev-parse', 'HEAD'])).trim();

    // Create agent branch and change beginning
    await execGit(['checkout', '-b', 'agent-branch']);
    await fs.writeFile(path.join(workspacePath, 'test.txt'), 'line 1 agent\nline 2\nline 3\nline 4\nline 5\n');
    await execGit(['add', 'test.txt']);
    await execGit(['commit', '-m', 'agent change']);
    const patch = (await execGitRaw(['diff', baseRevision, 'HEAD'])).replace(/\r\n/g, '\n') + '\n';

    await execGit(['checkout', '-']);
    await fs.writeFile(path.join(workspacePath, 'test.txt'), 'line 1\nline 2\nline 3\nline 4\nline 5 human\n');
    await execGit(['add', 'test.txt']);
    await execGit(['commit', '-m', 'human edit']);

    const changeSet: ChangeSet = {
      id: 'cs-2',
      taskId: 'task-1',
      baseRevision,
      status: 'pending',
      patch,
      changedFiles: ['test.txt']
    };

    const status = await manager.applyChangeSet(changeSet);
    expect(status).toBe('accepted');

    const content = await fs.readFile(path.join(workspacePath, 'test.txt'), 'utf-8');
    expect(content.replace(/\r\n/g, '\n')).toBe('line 1 agent\nline 2\nline 3\nline 4\nline 5 human\n');
  });

  it('should reject application without corrupting workspace when 3-way merge has conflicts', async () => {
    // Setup initial state
    await fs.writeFile(path.join(workspacePath, 'test.txt'), 'line 1\nline 2\nline 3\n');
    await execGit(['add', 'test.txt']);
    await execGit(['commit', '-m', 'initial']);
    const baseRevision = await execGit(['rev-parse', 'HEAD']);

    // Agent modifies line 2
    await execGit(['checkout', '-b', 'agent-branch']);
    await fs.writeFile(path.join(workspacePath, 'test.txt'), 'line 1\nline 2 agent\nline 3\n');
    await execGit(['add', 'test.txt']);
    await execGit(['commit', '-m', 'agent change']);
    const patch = (await execGitRaw(['diff', baseRevision, 'HEAD'])).replace(/\r\n/g, '\n') + '\n';

    await execGit(['checkout', '-']);
    await fs.writeFile(path.join(workspacePath, 'test.txt'), 'line 1\nline 2 human\nline 3\n');
    await execGit(['add', 'test.txt']);
    await execGit(['commit', '-m', 'human edit']);
    const humanHead = (await execGit(['rev-parse', 'HEAD'])).trim();

    const changeSet: ChangeSet = {
      id: 'cs-3',
      taskId: 'task-1',
      baseRevision,
      status: 'pending',
      patch,
      changedFiles: ['test.txt']
    };

    const status = await manager.applyChangeSet(changeSet);
    expect(status).toBe('conflicted');

    // Workspace should not have conflict markers (should be restored to human edit state)
    const content = await fs.readFile(path.join(workspacePath, 'test.txt'), 'utf-8');
    expect(content.replace(/\r\n/g, '\n')).toBe('line 1\nline 2 human\nline 3\n');

    // Make sure we didn't accidentally commit or leave index dirty
    const currentHead = (await execGit(['rev-parse', 'HEAD'])).trim();
    expect(currentHead).toBe(humanHead);
    const gitStatus = (await execGit(['status', '--porcelain'])).trim();
    expect(gitStatus).toBe('');
  });
});
