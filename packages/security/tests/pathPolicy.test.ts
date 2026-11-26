import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { assertWorkspacePath } from '../src/path-policy.js';

describe('assertWorkspacePath', () => {
  it('throws PATH_NOT_ALLOWED on path traversal outside root', () => {
    expect(() => assertWorkspacePath('/workspace/root', '../../etc/passwd')).toThrow('PATH_NOT_ALLOWED');
  });

  it('resolves valid relative paths correctly', () => {
    const root = path.resolve('/workspace/root');
    const resolved = assertWorkspacePath(root, 'src/app.ts');
    expect(resolved).toBe(path.join(root, 'src', 'app.ts'));
  });

  it('resolves valid absolute paths correctly if they are within root', () => {
    const root = path.resolve('/workspace/root');
    const absPath = path.join(root, 'src', 'app.ts');
    const resolved = assertWorkspacePath(root, absPath);
    expect(resolved).toBe(absPath);
  });

  it('allows safe path traversal (..) that remains inside the root', () => {
    const root = path.resolve('/workspace/root');
    const resolved = assertWorkspacePath(root, 'src/../lib/app.ts');
    expect(resolved).toBe(path.join(root, 'lib', 'app.ts'));
  });

  it('throws on null bytes', () => {
    expect(() => assertWorkspacePath('/workspace/root', 'src/app.ts\0')).toThrow('PATH_NOT_ALLOWED');
  });

  it('allows the root path itself', () => {
    const root = path.resolve('/workspace/root');
    const resolved = assertWorkspacePath(root, '.');
    expect(resolved).toBe(root);
  });

  it('rejects directory symlinks or junctions pointing outside workspace root', () => {
    const tempParent = fs.mkdtempSync(path.join(os.tmpdir(), 'covibe-symlink-test-'));
    const workspaceRoot = path.join(tempParent, 'workspace');
    const outsideDir = path.join(tempParent, 'outside');
    fs.mkdirSync(workspaceRoot, { recursive: true });
    fs.mkdirSync(outsideDir, { recursive: true });
    fs.writeFileSync(path.join(outsideDir, 'secret.txt'), 'top-secret', 'utf8');

    const linkPath = path.join(workspaceRoot, 'escape-link');
    const linkType = process.platform === 'win32' ? 'junction' : 'dir';
    try {
      fs.symlinkSync(outsideDir, linkPath, linkType);
      expect(() => assertWorkspacePath(workspaceRoot, 'escape-link/secret.txt')).toThrow(
        'PATH_NOT_ALLOWED'
      );
    } finally {
      fs.rmSync(tempParent, { recursive: true, force: true });
    }
  });
});
