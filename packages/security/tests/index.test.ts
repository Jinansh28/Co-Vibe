import { describe, it, expect } from 'vitest';
import {
  assertWorkspacePath,
  validateCommandPolicy,
  redactSecrets,
} from '../src/index.js';

describe('@co-vibe/security barrel exports', () => {
  it('re-exports security guards cleanly', () => {
    expect(typeof assertWorkspacePath).toBe('function');
    expect(typeof validateCommandPolicy).toBe('function');
    expect(typeof redactSecrets).toBe('function');
    expect(redactSecrets('token ghp_1234567890abcdefghijklmnopqrstuvwxyz')).toContain('[REDACTED_SECRET]');
  });
});
