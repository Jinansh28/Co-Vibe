const ALLOWED_BINARIES = new Set(['node', 'npm', 'pnpm', 'git', 'npx', 'vitest']);

const SHELL_INVOKERS = new Set([
  'sh',
  'bash',
  'zsh',
  'dash',
  'ksh',
  'fish',
  'cmd',
  'cmd.exe',
  'powershell',
  'powershell.exe',
  'pwsh',
]);

const RISKY_FLAGS: Record<string, Set<string>> = {
  node: new Set([
    '-e',
    '--eval',
    '-p',
    '--print',
    '-i',
    '--interactive',
    '--input-type',
    '-r',
    '--require',
    '--import',
    '--loader',
  ]),
  npx: new Set(['-c', '--call', '--shell', '-e', '--eval']),
  git: new Set(['-c', '--config-env', '--exec', '--upload-pack', '--receive-pack']),
};

function hasBlockedFlag(arg: string, blockedFlags: Set<string>, blockedChars?: string[]): boolean {
  const base = arg.split('=')[0];
  if (blockedFlags.has(base)) {
    return true;
  }
  if (blockedChars && base.startsWith('-') && !base.startsWith('--') && base.length > 2) {
    return blockedChars.some((ch) => base.slice(1).includes(ch));
  }
  return false;
}

function validateArgsForBinary(binary: string, args: string[]): void {
  const isPkgExec =
    (binary === 'npm' || binary === 'pnpm') &&
    (args[0] === 'exec' || args[0] === 'x' || args[0] === 'dlx');

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (typeof arg !== 'string' || arg.includes('\0')) {
      throw new Error('POLICY_VIOLATION');
    }

    if (binary === 'node' && hasBlockedFlag(arg, RISKY_FLAGS.node, ['e', 'p', 'i', 'r'])) {
      throw new Error('POLICY_VIOLATION');
    }

    if (binary === 'npx') {
      if (
        hasBlockedFlag(arg, RISKY_FLAGS.npx, ['c', 'e']) ||
        (!arg.startsWith('-') && SHELL_INVOKERS.has(arg.toLowerCase()))
      ) {
        throw new Error('POLICY_VIOLATION');
      }
    }

    if (binary === 'npm' || binary === 'pnpm') {
      if (arg.split('=')[0] === '--script-shell') {
        throw new Error('POLICY_VIOLATION');
      }
      if (
        isPkgExec &&
        (hasBlockedFlag(arg, RISKY_FLAGS.npx, ['c', 'e']) ||
          (i > 0 && !arg.startsWith('-') && SHELL_INVOKERS.has(arg.toLowerCase())))
      ) {
        throw new Error('POLICY_VIOLATION');
      }
    }

    if (binary === 'git' && hasBlockedFlag(arg, RISKY_FLAGS.git)) {
      throw new Error('POLICY_VIOLATION');
    }
  }
}

export function validateCommandPolicy(cmd: string[]): void {
  if (!Array.isArray(cmd) || cmd.length === 0) {
    throw new Error('POLICY_VIOLATION');
  }

  const binary = cmd[0];
  if (typeof binary !== 'string' || !ALLOWED_BINARIES.has(binary)) {
    throw new Error('POLICY_VIOLATION');
  }

  validateArgsForBinary(binary, cmd.slice(1));
}
