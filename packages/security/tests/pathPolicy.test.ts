import { describe, it, expect } from 'vitest';
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
});
