import { z } from 'zod';

export const RuntimeStartSchema = z.object({
  runtimeId: z.string().min(1),
  token: z.string().min(16),
  capabilities: z.array(z.string()).default([]),
  version: z.string().min(1),
  os: z.enum(['windows', 'linux', 'darwin']),
});

export type RuntimeStartRequest = z.infer<typeof RuntimeStartSchema>;

export const ProcessExecSchema = z.object({
  processId: z.string().min(1).optional(),
  command: z.string().min(1),
  args: z.array(z.string()).default([]),
  cwd: z.string().min(1).optional(),
  env: z.record(z.string()).optional(),
  timeoutMs: z.number().int().positive().max(300000).default(30000),
});

export type ProcessExecRequest = z.infer<typeof ProcessExecSchema>;

export const GitCommandSchema = z.object({
  operation: z.enum([
    'status',
    'checkout',
    'commit',
    'branch',
    'diff',
    'worktree',
    'push',
    'fetch',
    'pull',
  ]),
  args: z.array(z.string()).default([]),
  worktreePath: z.string().optional(),
});

export type GitCommandRequest = z.infer<typeof GitCommandSchema>;

export const PathValidationSchema = z.object({
  path: z.string().min(1),
  workspaceRoot: z.string().min(1),
  allowAbsolute: z.boolean().default(false),
});

export type PathValidationRequest = z.infer<typeof PathValidationSchema>;

export const PairingCodeResponseSchema = z.object({
  code: z.string().length(6),
  expiresAt: z.number().int().positive(),
});

export type PairingCodeResponse = z.infer<typeof PairingCodeResponseSchema>;

export const PairingVerifySchema = z.object({
  code: z.string().length(6),
  workspaceId: z.string().optional(),
});

export type PairingVerifyRequest = z.infer<typeof PairingVerifySchema>;

export const PairingTokenResponseSchema = z.object({
  ok: z.boolean(),
  token: z.string().optional(),
  runtimeId: z.string().optional(),
  expiresAt: z.number().optional(),
  error: z.string().optional(),
});

export type PairingTokenResponse = z.infer<typeof PairingTokenResponseSchema>;

