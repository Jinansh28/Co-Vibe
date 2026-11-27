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

export const RuntimeRpcMethodSchema = z.enum([
  'git.status',
  'git.diff',
  'git.branch',
  'git.commit',
  'git.clone',
  'changeset.accept',
  'changeset.reject',
  'test.run',
]);

export type RuntimeRpcMethod = z.infer<typeof RuntimeRpcMethodSchema>;

export const RuntimeRpcRequestSchema = z.object({
  type: z.literal('rpc.request'),
  requestId: z.string().min(1),
  method: RuntimeRpcMethodSchema,
  workspaceId: z.string().min(1),
  params: z.record(z.unknown()).default({}),
});

export type RuntimeRpcRequest = z.infer<typeof RuntimeRpcRequestSchema>;

export const RuntimeRpcErrorSchema = z.object({
  code: z.string().min(1),
  message: z.string(),
  status: z.number().int().optional(),
});

export type RuntimeRpcError = z.infer<typeof RuntimeRpcErrorSchema>;

export const RuntimeRpcResponseSchema = z.object({
  type: z.literal('rpc.response'),
  requestId: z.string().min(1),
  ok: z.boolean(),
  result: z.unknown().optional(),
  error: RuntimeRpcErrorSchema.optional(),
});

export type RuntimeRpcResponse = z.infer<typeof RuntimeRpcResponseSchema>;

export const GitBranchBodySchema = z.object({
  branchName: z
    .string()
    .trim()
    .min(1, 'Branch name is required')
    .max(128, 'Branch name too long')
    .regex(/^[a-zA-Z0-9._/-]+$/, 'Invalid branch name characters')
    .refine((val) => !val.startsWith('-') && !val.includes('..') && !val.endsWith('.lock'), {
      message: 'Unsafe branch name',
    }),
});

export type GitBranchBody = z.infer<typeof GitBranchBodySchema>;

export const GitCommitBodySchema = z.object({
  message: z.string().trim().min(1, 'Commit message is required').max(1000),
  stageAll: z.boolean().optional(),
});

export type GitCommitBody = z.infer<typeof GitCommitBodySchema>;

export function isSafeGitRepoUrl(rawUrl: string): boolean {
  const trimmed = rawUrl.trim();
  if (!trimmed || /[\s\0]/.test(trimmed)) return false;
  if (trimmed.startsWith('file://') || trimmed.startsWith('/') || /^[a-zA-Z]:[\\/]/.test(trimmed)) {
    return false;
  }
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return false;
  }
  if (parsed.protocol !== 'https:') return false;
  if (parsed.username || parsed.password) return false;
  const host = parsed.hostname.toLowerCase();
  if (!host || host === 'localhost' || host === '127.0.0.1' || host === '::1') return false;
  const segments = parsed.pathname.split('/').filter(Boolean);
  if (segments.length < 2) return false;
  return true;
}

export const SafeRepoUrlSchema = z
  .string()
  .trim()
  .refine(isSafeGitRepoUrl, {
    message: 'Repository URL must be a valid HTTPS URL without embedded credentials',
  });

export const GitCloneBodySchema = z.object({
  repoUrl: SafeRepoUrlSchema,
  branch: z.string().trim().min(1).max(128).optional(),
});

export type GitCloneBody = z.infer<typeof GitCloneBodySchema>;

export const ChangeSetAcceptBodySchema = z.object({
  acceptedHunks: z.array(z.string().min(1)).optional(),
  expectedBaseRevision: z.string().min(1).optional(),
});

export type ChangeSetAcceptBody = z.infer<typeof ChangeSetAcceptBodySchema>;

