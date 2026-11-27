import { Hono, type Context } from 'hono';
import {
  GitBranchBodySchema,
  GitCloneBodySchema,
  GitCommitBodySchema,
} from '@co-vibe/protocol';
import type { Env } from '../middleware/auth.js';
import { getProjectService } from '../services/projectService.js';
import { getGithubTokenService } from '../services/githubTokenService.js';
import {
  RuntimeOfflineError,
  RuntimeRpcRemoteError,
  RuntimeTimeoutError,
  sendRuntimeRpc,
} from '../services/runtimeBridge.js';

export const gitRoutes = new Hono<Env>();

async function authorizeWorkspaceGit(
  c: Context<Env>,
  workspaceId: string,
  requireWrite: boolean
): Promise<Response | null> {
  const authUser = c.get('authUser');
  const service = getProjectService(c.env);
  const membership = await service.checkWorkspaceMembership(workspaceId, authUser.sub);

  if (membership.status === 'invalid_id') {
    return c.json({ error: 'Bad Request', message: 'Invalid workspace UUID format' }, 400);
  }
  if (membership.status === 'not_found') {
    return c.json({ error: 'Not Found', message: 'Workspace not found' }, 404);
  }
  if (membership.status === 'forbidden') {
    return c.json(
      { error: 'Forbidden', message: 'User is not a member of this workspace project' },
      403
    );
  }
  if (requireWrite && membership.role === 'viewer') {
    return c.json(
      { error: 'Forbidden', message: 'Viewer role cannot perform mutating Git operations' },
      403
    );
  }
  return null;
}

function handleGitRpcError(c: Context<Env>, err: unknown): Response {
  if (err instanceof RuntimeOfflineError) {
    return c.json({ error: 'Service Unavailable', message: err.message }, 503);
  }
  if (err instanceof RuntimeTimeoutError) {
    return c.json({ error: 'Gateway Timeout', message: err.message }, 504);
  }
  if (err instanceof RuntimeRpcRemoteError) {
    const status = err.status === 400 || err.status === 403 || err.status === 404 || err.status === 409
      ? err.status
      : 502;
    return c.json(
      {
        error: status === 400 ? 'Bad Request' : 'Bad Gateway',
        code: err.code,
        message: err.message,
      },
      status as any
    );
  }
  return c.json(
    {
      error: 'Bad Gateway',
      message: err instanceof Error ? err.message : 'Git RPC failed',
    },
    502
  );
}

gitRoutes.get('/:workspaceId/status', async (c) => {
  const workspaceId = c.req.param('workspaceId');
  const authError = await authorizeWorkspaceGit(c, workspaceId, false);
  if (authError) return authError;

  try {
    const status = await sendRuntimeRpc(workspaceId, 'git.status', {});
    return c.json({ status });
  } catch (err) {
    return handleGitRpcError(c, err);
  }
});

gitRoutes.get('/:workspaceId/diff', async (c) => {
  const workspaceId = c.req.param('workspaceId');
  const authError = await authorizeWorkspaceGit(c, workspaceId, false);
  if (authError) return authError;

  try {
    const result = await sendRuntimeRpc<{ diff?: string } | string>(workspaceId, 'git.diff', {});
    const diff = typeof result === 'string' ? result : result?.diff ?? '';
    return c.json({ diff });
  } catch (err) {
    return handleGitRpcError(c, err);
  }
});

gitRoutes.post('/:workspaceId/branch', async (c) => {
  const workspaceId = c.req.param('workspaceId');
  const authError = await authorizeWorkspaceGit(c, workspaceId, true);
  if (authError) return authError;

  let rawBody: unknown;
  try {
    rawBody = await c.req.json();
  } catch {
    return c.json({ error: 'Bad Request', message: 'Invalid JSON payload' }, 400);
  }

  const parsed = GitBranchBodySchema.safeParse(rawBody);
  if (!parsed.success) {
    return c.json(
      {
        error: 'Bad Request',
        message: parsed.error.errors[0]?.message || 'Validation failed',
        details: parsed.error.format(),
      },
      400
    );
  }

  try {
    await sendRuntimeRpc(workspaceId, 'git.branch', {
      branchName: parsed.data.branchName,
    });
    await getProjectService(c.env).updateWorkspaceBranch(workspaceId, parsed.data.branchName);

    return c.json({
      success: true,
      branch: parsed.data.branchName,
    });
  } catch (err) {
    return handleGitRpcError(c, err);
  }
});

gitRoutes.post('/:workspaceId/commit', async (c) => {
  const workspaceId = c.req.param('workspaceId');
  const authError = await authorizeWorkspaceGit(c, workspaceId, true);
  if (authError) return authError;

  let rawBody: unknown;
  try {
    rawBody = await c.req.json();
  } catch {
    return c.json({ error: 'Bad Request', message: 'Invalid JSON payload' }, 400);
  }

  const parsed = GitCommitBodySchema.safeParse(rawBody);
  if (!parsed.success) {
    return c.json(
      {
        error: 'Bad Request',
        message: parsed.error.errors[0]?.message || 'Validation failed',
        details: parsed.error.format(),
      },
      400
    );
  }

  const authUser = c.get('authUser');

  try {
    await sendRuntimeRpc(workspaceId, 'git.commit', {
      message: parsed.data.message,
      stageAll: parsed.data.stageAll ?? false,
      authorName: authUser.user_metadata?.full_name || authUser.email?.split('@')[0] || 'Co-Vibe User',
      authorEmail: authUser.email || 'user@co-vibe.dev',
    });

    return c.json({
      success: true,
      message: parsed.data.message,
    });
  } catch (err) {
    return handleGitRpcError(c, err);
  }
});

gitRoutes.post('/:workspaceId/clone', async (c) => {
  const workspaceId = c.req.param('workspaceId');
  const authError = await authorizeWorkspaceGit(c, workspaceId, true);
  if (authError) return authError;

  let rawBody: unknown;
  try {
    rawBody = await c.req.json();
  } catch {
    return c.json({ error: 'Bad Request', message: 'Invalid JSON payload' }, 400);
  }

  const parsed = GitCloneBodySchema.safeParse(rawBody);
  if (!parsed.success) {
    return c.json(
      {
        error: 'Bad Request',
        message: parsed.error.errors[0]?.message || 'Validation failed',
        details: parsed.error.format(),
      },
      400
    );
  }

  const authUser = c.get('authUser');
  let authToken: string | null = null;
  try {
    authToken = await getGithubTokenService(c.env).getDecryptedToken(authUser.sub, c.env);
  } catch {
    // Non-fatal if encryption key/token unavailable for public clone
    authToken = null;
  }

  try {
    const result = await sendRuntimeRpc<{ branch?: string }>(
      workspaceId,
      'git.clone',
      {
        repoUrl: parsed.data.repoUrl,
        ...(parsed.data.branch ? { branch: parsed.data.branch } : {}),
        ...(authToken ? { authToken } : {}),
      },
      30000
    );

    if (result?.branch) {
      await getProjectService(c.env).updateWorkspaceBranch(workspaceId, result.branch);
    }

    return c.json({
      success: true,
      repoUrl: parsed.data.repoUrl,
      ...(result?.branch ? { branch: result.branch } : {}),
    });
  } catch (err) {
    return handleGitRpcError(c, err);
  }
});
