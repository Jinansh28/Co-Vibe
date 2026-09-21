import { describe, it, expect } from 'vitest';
import { validateCommandPolicy } from '../src/command-policy.js';

describe('validateCommandPolicy', () => {
  it('allows allowlisted commands', () => {
    expect(() => validateCommandPolicy(['npm', 'test'])).not.toThrow();
    expect(() => validateCommandPolicy(['git', 'status'])).not.toThrow();
    expect(() => validateCommandPolicy(['node', '--version'])).not.toThrow();
    expect(() => validateCommandPolicy(['pnpm', 'install'])).not.toThrow();
    expect(() => validateCommandPolicy(['npx', 'tsc'])).not.toThrow();
    expect(() => validateCommandPolicy(['vitest', 'run'])).not.toThrow();
  });

  it('blocks commands not in the allowlist', () => {
    expect(() => validateCommandPolicy(['rm', '-rf', '/'])).toThrow('POLICY_VIOLATION');
    expect(() => validateCommandPolicy(['ls', '-la'])).toThrow('POLICY_VIOLATION');
    expect(() => validateCommandPolicy(['cat', '/etc/passwd'])).toThrow('POLICY_VIOLATION');
  });

  it('blocks raw shell invokers', () => {
    expect(() => validateCommandPolicy(['sh', '-c', 'rm -rf /'])).toThrow('POLICY_VIOLATION');
    expect(() => validateCommandPolicy(['bash', '-c', 'rm -rf /'])).toThrow('POLICY_VIOLATION');
    expect(() => validateCommandPolicy(['eval', 'console.log("hello")'])).toThrow('POLICY_VIOLATION');
  });

  it('blocks empty commands', () => {
    expect(() => validateCommandPolicy([])).toThrow('POLICY_VIOLATION');
  });
});
