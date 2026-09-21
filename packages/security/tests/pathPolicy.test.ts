import { describe, it, expect } from 'vitest';
import { assertWorkspacePath } from '../src/path-policy.js';

describe('assertWorkspacePath', () => {
  it('throws PATH_NOT_ALLOWED on path traversal outside root', () => {
    expect(() => assertWorkspacePath('/workspace/root', '../../etc/passwd')).toThrow('PATH_NOT_ALLOWED');
  });

  it('resolves valid relative paths correctly', () => {
    const resolved = assertWorkspacePath('/workspace/root', 'src/app.ts');
    expect(resolved).toBe('/workspace/root/src/app.ts');
  });

  it('resolves valid absolute paths correctly if they are within root', () => {
    const resolved = assertWorkspacePath('/workspace/root', '/workspace/root/src/app.ts');
    expect(resolved).toBe('/workspace/root/src/app.ts');
  });

  it('allows safe path traversal (..) that remains inside the root', () => {
    const resolved = assertWorkspacePath('/workspace/root', 'src/../lib/app.ts');
    expect(resolved).toBe('/workspace/root/lib/app.ts');
  });

  it('throws on null bytes', () => {
    expect(() => assertWorkspacePath('/workspace/root', 'src/app.ts\0')).toThrow('PATH_NOT_ALLOWED');
  });

  it('allows the root path itself', () => {
    const resolved = assertWorkspacePath('/workspace/root', '.');
    expect(resolved).toBe('/workspace/root');
  });
});
