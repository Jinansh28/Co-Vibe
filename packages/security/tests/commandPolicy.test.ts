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

  it('blocks empty commands and non-string arguments or null bytes', () => {
    expect(() => validateCommandPolicy([])).toThrow('POLICY_VIOLATION');
    expect(() => validateCommandPolicy(['node', 'index.js\0'])).toThrow('POLICY_VIOLATION');
    expect(() => validateCommandPolicy([123 as unknown as string])).toThrow('POLICY_VIOLATION');
  });

  it('blocks risky inline-eval and shell-escape flags on allowed binaries', () => {
    // node inline eval / print / preload / interactive flags
    expect(() => validateCommandPolicy(['node', '-e', 'console.log(1)'])).toThrow('POLICY_VIOLATION');
    expect(() => validateCommandPolicy(['node', '--eval', 'console.log(1)'])).toThrow('POLICY_VIOLATION');
    expect(() => validateCommandPolicy(['node', '--eval=console.log(1)'])).toThrow('POLICY_VIOLATION');
    expect(() => validateCommandPolicy(['node', '-p', 'process.env'])).toThrow('POLICY_VIOLATION');
    expect(() => validateCommandPolicy(['node', '--print', 'process.env'])).toThrow('POLICY_VIOLATION');
    expect(() => validateCommandPolicy(['node', '-pe', 'process.env'])).toThrow('POLICY_VIOLATION');
    expect(() => validateCommandPolicy(['node', '-r', 'evil.js'])).toThrow('POLICY_VIOLATION');
    expect(() => validateCommandPolicy(['node', '--import=data:text/javascript,'])).toThrow('POLICY_VIOLATION');
    expect(() => validateCommandPolicy(['node', '--input-type=module'])).toThrow('POLICY_VIOLATION');

    // npx shell invocation flags
    expect(() => validateCommandPolicy(['npx', '-c', 'whoami'])).toThrow('POLICY_VIOLATION');
    expect(() => validateCommandPolicy(['npx', '--call=whoami'])).toThrow('POLICY_VIOLATION');
    expect(() => validateCommandPolicy(['npx', 'bash'])).toThrow('POLICY_VIOLATION');

    // npm / pnpm script-shell & exec escapes
    expect(() => validateCommandPolicy(['npm', 'test', '--script-shell=/bin/sh'])).toThrow('POLICY_VIOLATION');
    expect(() => validateCommandPolicy(['pnpm', 'exec', 'sh', '-c', 'id'])).toThrow('POLICY_VIOLATION');
    expect(() => validateCommandPolicy(['npm', 'exec', '-c', 'id'])).toThrow('POLICY_VIOLATION');

    // git config / pack execution flags
    expect(() => validateCommandPolicy(['git', '-c', 'core.sshCommand=id', 'fetch'])).toThrow('POLICY_VIOLATION');
    expect(() => validateCommandPolicy(['git', '--upload-pack=evil', 'ls-remote'])).toThrow('POLICY_VIOLATION');
  });
});
