import { Hono, type Context } from 'hono';
import { ChangeSetAcceptBodySchema } from '@co-vibe/protocol';
import type { Env } from '../middleware/auth.js';
import { getAgentHistoryService } from '../services/agentHistoryService.js';
import { getProjectService } from '../services/projectService.js';
import {
  runtimeBridge,
  RuntimeOfflineError,
  RuntimeRpcRemoteError,
  RuntimeTimeoutError,
  sendRuntimeRpc,
} from '../services/runtimeBridge.js';

export const changesetRoutes = new Hono<Env>();

async function authorizeChangeSetMutation(c: Context<Env>, changeSetId: string) {
  const authUser = c.get('authUser');
  const historyService = getAgentHistoryService(c.env);
  const changeSet = await historyService.getChangeSetById(changeSetId);

  if (!changeSet) {
    return {
      errorResponse: c.json({ error: 'Not Found', message: 'ChangeSet not found' }, 404),
    };
  }

  const membership = await getProjectService(c.env).checkWorkspaceMembership(
    changeSet.workspaceId,
    authUser.sub
  );

  if (membership.status === 'invalid_id') {
    return {
      errorResponse: c.json({ error: 'Bad Request', message: 'Invalid workspace UUID format' }, 400),
    };
  }
  if (membership.status === 'not_found') {
    return {
      errorResponse: c.json({ error: 'Not Found', message: 'Workspace not found' }, 404),
    };
  }
  if (membership.status === 'forbidden') {
    return {
      errorResponse: c.json(
        { error: 'Forbidden', message: 'User is not a member of this workspace project' },
        403
      ),
    };
  }
  if (membership.role === 'viewer') {
    return {
      errorResponse: c.json(
        { error: 'Forbidden', message: 'Viewer role cannot accept or reject changesets' },
        403
      ),
    };
  }

  return { changeSet, historyService };
}

changesetRoutes.post('/:id/accept', async (c) => {
  const id = c.req.param('id');

  let rawBody: unknown = {};
  const rawText = await c.req.text();
  if (rawText.trim().length > 0) {
    try {
      rawBody = JSON.parse(rawText);
    } catch {
      return c.json({ error: 'Bad Request', message: 'Invalid JSON payload' }, 400);
    }
  }

  const parsed = ChangeSetAcceptBodySchema.safeParse(rawBody);
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

  const authz = await authorizeChangeSetMutation(c, id);
  if (authz.errorResponse) return authz.errorResponse;

  const { changeSet, historyService } = authz;

  if (runtimeBridge.hasConnection(changeSet.workspaceId)) {
    try {
      const rpcResult = await sendRuntimeRpc<{
        status?: string;
        filePath?: string;
        message?: string;
      }>(changeSet.workspaceId, 'changeset.accept', {
        changeSetId: id,
        acceptedHunks: parsed.data.acceptedHunks,
        expectedBaseRevision: parsed.data.expectedBaseRevision,
        changeSet,
      });

      if (rpcResult?.status === 'conflicted') {
        await historyService.updateChangeSetStatus(id, 'conflicted');
        return c.json(
          {
            ok: false,
            success: false,
            status: 'conflicted',
            message: rpcResult.message || 'Merge conflict detected while applying changeset',
          },
          409
        );
      }

      const nextStatus = rpcResult?.status === 'rejected' ? 'rejected' : 'accepted';
      await historyService.updateChangeSetStatus(id, nextStatus);
      return c.json({
        ok: true,
        success: true,
        status: nextStatus,
        ...(rpcResult?.filePath ? { filePath: rpcResult.filePath } : {}),
        message: nextStatus === 'rejected' ? 'Changeset rejected' : 'Changeset accepted',
      });
    } catch (err) {
      if (err instanceof RuntimeRpcRemoteError && err.status === 409) {
        await historyService.updateChangeSetStatus(id, 'conflicted');
        return c.json(
          {
            ok: false,
            success: false,
            status: 'conflicted',
            message: err.message,
          },
          409
        );
      }
      if (err instanceof RuntimeOfflineError) {
        return c.json({ error: 'Service Unavailable', message: err.message }, 503);
      }
      if (err instanceof RuntimeTimeoutError) {
        return c.json({ error: 'Gateway Timeout', message: err.message }, 504);
      }
      return c.json(
        {
          error: 'Bad Gateway',
          message: err instanceof Error ? err.message : 'Failed to apply changeset on runtime',
        },
        502
      );
    }
  }

  await historyService.updateChangeSetStatus(id, 'accepted');
  return c.json({
    ok: true,
    success: true,
    status: 'accepted',
    message: 'Changeset accepted',
  });
});

changesetRoutes.post('/:id/reject', async (c) => {
  const id = c.req.param('id');
  const authz = await authorizeChangeSetMutation(c, id);
  if (authz.errorResponse) return authz.errorResponse;

  const { changeSet, historyService } = authz;

  if (runtimeBridge.hasConnection(changeSet.workspaceId)) {
    try {
      await sendRuntimeRpc(changeSet.workspaceId, 'changeset.reject', {
        changeSetId: id,
      });
    } catch (err) {
      if (err instanceof RuntimeTimeoutError) {
        return c.json({ error: 'Gateway Timeout', message: err.message }, 504);
      }
      if (err instanceof RuntimeRpcRemoteError) {
        return c.json({ error: 'Bad Gateway', message: err.message }, 502);
      }
    }
  }

  await historyService.updateChangeSetStatus(id, 'rejected');

  return c.json({
    ok: true,
    success: true,
    status: 'rejected',
    message: 'Changeset rejected',
  });
});
