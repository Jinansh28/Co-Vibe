import { describe, it, expect } from 'vitest';
import {
  RuntimeStartSchema,
  ProcessExecSchema,
  GitCommandSchema,
  PathValidationSchema,
} from '../src/index.js';

describe('Protocol Runtime Schemas', () => {
  it('validates a valid RuntimeStartSchema object', () => {
    const valid = {
      runtimeId: 'rt_local_dev',
      token: 'secret-token-at-least-16-chars-long',
      capabilities: ['docker', 'git', 'terminal'],
      version: '0.1.0',
      os: 'linux' as const,
    };

    const parsed = RuntimeStartSchema.parse(valid);
    expect(parsed.runtimeId).toBe('rt_local_dev');
    expect(parsed.capabilities).toContain('docker');
  });

  it('rejects RuntimeStartSchema with short token', () => {
    const invalid = {
      runtimeId: 'rt_local_dev',
      token: 'short',
      capabilities: [],
      version: '0.1.0',
      os: 'windows' as const,
    };

    expect(() => RuntimeStartSchema.parse(invalid)).toThrow();
  });

  it('validates ProcessExecSchema with defaults', () => {
    const valid = {
      command: 'pnpm',
      args: ['test'],
    };

    const parsed = ProcessExecSchema.parse(valid);
    expect(parsed.command).toBe('pnpm');
    expect(parsed.timeoutMs).toBe(30000);
  });

  it('validates GitCommandSchema operation enum', () => {
    const valid = {
      operation: 'checkout' as const,
      args: ['-b', 'feature-branch'],
    };

    const parsed = GitCommandSchema.parse(valid);
    expect(parsed.operation).toBe('checkout');

    const invalid = {
      operation: 'invalid-git-op',
      args: [],
    };
    expect(() => GitCommandSchema.parse(invalid)).toThrow();
  });

  it('validates PathValidationSchema', () => {
    const valid = {
      path: 'src/components/Button.tsx',
      workspaceRoot: '/app/workspace',
    };

    const parsed = PathValidationSchema.parse(valid);
    expect(parsed.path).toBe('src/components/Button.tsx');
    expect(parsed.allowAbsolute).toBe(false);
  });
});
