const ALLOWED_BINARIES = new Set([
  'node',
  'npm',
  'pnpm',
  'git',
  'npx',
  'vitest'
]);

export function validateCommandPolicy(cmd: string[]): void {
  if (!Array.isArray(cmd) || cmd.length === 0) {
    throw new Error('POLICY_VIOLATION');
  }

  const binary = cmd[0];

  if (!ALLOWED_BINARIES.has(binary)) {
    throw new Error('POLICY_VIOLATION');
  }
}
