import fs from 'node:fs/promises';
import path from 'node:path';
import {
  ChangeSetAcceptBodySchema,
  GitBranchBodySchema,
  GitCloneBodySchema,
  GitCommitBodySchema,
  SafeRepoUrlSchema,
} from '@co-vibe/protocol';
import { GitManager } from '@co-vibe/git';
import { assertWorkspacePath, redactSecrets } from '@co-vibe/security';
import type { DockerManager } from '../docker/DockerManager.js';
import type { ProcessManager } from '../process/ProcessManager.js';
import { TestRunner } from '../process/TestRunner.js';
import {
  applyChangeSetInWorkspace,
  pendingChangeSets,
  validateWorkspaceId,
} from './pairingServer.js';
import { RpcHandlerError, type WorkerClient } from './workerClient.js';

export interface RuntimeRpcDependencies {
  dockerManager: DockerManager;
  processManager: ProcessManager;
  resolveWorkspaceRoot?: (workspaceId: string) => string;
}

export function defaultResolveWorkspaceRoot(workspaceId: string): string {
  const cleanWsId = validateWorkspaceId(workspaceId);
  const currentRoot = process.env.BASE_WORKSPACE_ROOT || process.env.WORKSPACE_ROOT || process.cwd();
  const wsSegment = path.join('.workspaces', cleanWsId);
  if (currentRoot.includes(wsSegment)) {
    return currentRoot;
  }
  const workspacesIdx = currentRoot.indexOf('.workspaces');
  const baseDir =
    workspacesIdx !== -1 ? currentRoot.slice(0, workspacesIdx).replace(/[\\/]+$/, '') : currentRoot;
  return assertWorkspacePath(path.join(baseDir, '.workspaces'), cleanWsId);
}

export function registerRuntimeRpcHandlers(
  client: WorkerClient,
  deps: RuntimeRpcDependencies
): void {
  const resolveRoot = deps.resolveWorkspaceRoot ?? defaultResolveWorkspaceRoot;

  const getSafeWsRoot = (workspaceId: string): string => {
    try {
      return resolveRoot(workspaceId);
    } catch (err) {
      throw new RpcHandlerError(
        'INVALID_WORKSPACE_ID',
        err instanceof Error ? err.message : 'Invalid workspace identifier',
        403
      );
    }
  };

  client.registerRpcHandler('git.status', async (_params, req) => {
    const wsRoot = getSafeWsRoot(req.workspaceId);
    const git = new GitManager(wsRoot);
    try {
      return await git.getStatus();
    } catch (err) {
      throw new RpcHandlerError(
        'GIT_STATUS_FAILED',
        redactSecrets(err instanceof Error ? err.message : String(err)),
        502
      );
    }
  });

  client.registerRpcHandler('git.diff', async (_params, req) => {
    const wsRoot = getSafeWsRoot(req.workspaceId);
    const git = new GitManager(wsRoot);
    try {
      const diff = await git.getDiff();
      return { diff };
    } catch (err) {
      throw new RpcHandlerError(
        'GIT_DIFF_FAILED',
        redactSecrets(err instanceof Error ? err.message : String(err)),
        502
      );
    }
  });

  client.registerRpcHandler('git.branch', async (params, req) => {
    const parsed = GitBranchBodySchema.safeParse(params);
    if (!parsed.success) {
      throw new RpcHandlerError(
        'INVALID_PARAMS',
        parsed.error.issues[0]?.message || 'Invalid branch name',
        400
      );
    }
    const wsRoot = getSafeWsRoot(req.workspaceId);
    const git = new GitManager(wsRoot);
    try {
      await git.createBranch(parsed.data.branchName);
      return { branch: parsed.data.branchName };
    } catch (err) {
      throw new RpcHandlerError(
        'GIT_BRANCH_FAILED',
        redactSecrets(err instanceof Error ? err.message : String(err)),
        502
      );
    }
  });

  client.registerRpcHandler('git.commit', async (params, req) => {
    const parsed = GitCommitBodySchema.safeParse(params);
    if (!parsed.success) {
      throw new RpcHandlerError(
        'INVALID_PARAMS',
        parsed.error.issues[0]?.message || 'Invalid commit parameters',
        400
      );
    }
    const wsRoot = getSafeWsRoot(req.workspaceId);
    const git = new GitManager(wsRoot);
    try {
      await git.commit(parsed.data.message, {
        stageAll: parsed.data.stageAll,
        authorName: typeof params.authorName === 'string' ? params.authorName : undefined,
        authorEmail: typeof params.authorEmail === 'string' ? params.authorEmail : undefined,
      });
      return { message: parsed.data.message };
    } catch (err) {
      throw new RpcHandlerError(
        'GIT_COMMIT_FAILED',
        redactSecrets(err instanceof Error ? err.message : String(err)),
        502
      );
    }
  });

  client.registerRpcHandler('git.clone', async (params, req) => {
    const parsed = GitCloneBodySchema.safeParse({
      repoUrl: params.repoUrl,
      branch: params.branch,
    });
    if (!parsed.success) {
      throw new RpcHandlerError(
        'INVALID_PARAMS',
        parsed.error.issues[0]?.message || 'Invalid repository URL',
        400
      );
    }
    SafeRepoUrlSchema.parse(parsed.data.repoUrl);
    const wsRoot = getSafeWsRoot(req.workspaceId);
    const authToken = typeof params.authToken === 'string' ? params.authToken : undefined;

    try {
      await fs.mkdir(wsRoot, { recursive: true });
      const git = new GitManager(wsRoot);
      await git.clone(parsed.data.repoUrl, {
        branch: parsed.data.branch,
        authToken,
      });
      const activeBranch = await git.getCurrentBranch().catch(() => parsed.data.branch || 'main');
      await fs.writeFile(path.join(wsRoot, '.initialized'), new Date().toISOString(), 'utf8').catch(() => {});
      return { repoUrl: parsed.data.repoUrl, branch: activeBranch };
    } catch (err) {
      throw new RpcHandlerError(
        'GIT_CLONE_FAILED',
        redactSecrets(err instanceof Error ? err.message : String(err)),
        502
      );
    }
  });

  client.registerRpcHandler('changeset.accept', async (params, req) => {
    const wsRoot = getSafeWsRoot(req.workspaceId);
    const changeSetId = typeof params.changeSetId === 'string' ? params.changeSetId : '';
    if (!changeSetId) {
      throw new RpcHandlerError('INVALID_PARAMS', 'changeSetId is required', 400);
    }

    const bodyParsed = ChangeSetAcceptBodySchema.safeParse({
      acceptedHunks: params.acceptedHunks,
      expectedBaseRevision: params.expectedBaseRevision,
    });
    if (!bodyParsed.success) {
      throw new RpcHandlerError(
        'INVALID_PARAMS',
        bodyParsed.error.issues[0]?.message || 'Invalid changeset accept parameters',
        400
      );
    }

    const pending = pendingChangeSets.get(changeSetId);
    const remoteCs =
      params.changeSet && typeof params.changeSet === 'object'
        ? (params.changeSet as Record<string, any>)
        : undefined;

    const result = await applyChangeSetInWorkspace(wsRoot, {
      changeSetId,
      acceptedHunks: bodyParsed.data.acceptedHunks,
      pending,
      remoteChangeSet: remoteCs
        ? {
            id: remoteCs.id,
            taskId: remoteCs.taskId,
            baseRevision: remoteCs.baseRevision,
            patch: remoteCs.patch,
            changedFiles: Array.isArray(remoteCs.changedFiles) ? remoteCs.changedFiles : undefined,
          }
        : undefined,
    });

    if (result.status === 'conflicted') {
      throw new RpcHandlerError('CHANGESET_CONFLICT', result.message || 'Merge conflict', 409);
    }

    return result;
  });

  client.registerRpcHandler('changeset.reject', async (params) => {
    const changeSetId = typeof params.changeSetId === 'string' ? params.changeSetId : '';
    if (!changeSetId) {
      throw new RpcHandlerError('INVALID_PARAMS', 'changeSetId is required', 400);
    }
    pendingChangeSets.delete(changeSetId);
    return { status: 'rejected' };
  });

  client.registerRpcHandler('test.run', async (_params, req) => {
    const wsRoot = getSafeWsRoot(req.workspaceId);
    const cleanWsId = validateWorkspaceId(req.workspaceId);
    try {
      await fs.mkdir(wsRoot, { recursive: true });
      const containerId = await deps.dockerManager.ensureWorkspaceContainer(cleanWsId, wsRoot);
      const runner = new TestRunner(deps.processManager);
      return await runner.runTests(containerId, '/workspace');
    } catch (err) {
      throw new RpcHandlerError(
        'TEST_RUN_FAILED',
        redactSecrets(err instanceof Error ? err.message : String(err)),
        502
      );
    }
  });
}
