import { Hono, type Context } from 'hono';
import { z } from 'zod';
import type { Env } from '../middleware/auth.js';
import { getAgentHistoryService } from '../services/agentHistoryService.js';
import { getProjectService } from '../services/projectService.js';

export const agentHistoryRoutes = new Hono<Env>();

async function authorizeWorkspaceAccess(
  c: Context<Env>,
  workspaceId: string,
  requireWrite: boolean
): Promise<Response | null> {
  const authUser = c.get('authUser');
  if (!authUser?.sub) {
    return c.json({ error: 'Unauthorized', message: 'Missing user identity' }, 401);
  }

  const membership = await getProjectService(c.env).checkWorkspaceMembership(
    workspaceId,
    authUser.sub
  );

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
      { error: 'Forbidden', message: 'Viewer role cannot modify agent tasks' },
      403
    );
  }

  return null;
}

async function authorizeTaskAccess(
  c: Context<Env>,
  taskId: string,
  requireWrite: boolean
): Promise<Response | null> {
  const service = getAgentHistoryService(c.env);
  const workspaceId = await service.getTaskWorkspaceId(taskId);
  if (!workspaceId) {
    return c.json({ error: 'Not Found', message: 'Agent task not found' }, 404);
  }
  return authorizeWorkspaceAccess(c, workspaceId, requireWrite);
}

const CreateAgentTaskSchema = z.object({
  prompt: z.string().trim().min(1, 'Prompt cannot be empty'),
});

const SaveChangeSetSchema = z.object({
  runId: z.string().min(1),
  patch: z.string(),
  changedFiles: z.array(z.string()).default([]),
});

const UpdateTaskStatusSchema = z.object({
  status: z.string().min(1),
  error: z.string().optional(),
});

// GET /api/v1/workspaces/:wsId/agent/tasks
agentHistoryRoutes.get('/workspaces/:wsId/agent/tasks', async (c) => {
  const wsId = c.req.param('wsId');
  const authError = await authorizeWorkspaceAccess(c, wsId, false);
  if (authError) return authError;

  const service = getAgentHistoryService(c.env);
  const tasks = await service.listWorkspaceTasks(wsId);
  return c.json({ tasks });
});

// POST /api/v1/workspaces/:wsId/agent/tasks
agentHistoryRoutes.post('/workspaces/:wsId/agent/tasks', async (c) => {
  const wsId = c.req.param('wsId');
  const authError = await authorizeWorkspaceAccess(c, wsId, true);
  if (authError) return authError;

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Bad Request', message: 'Invalid JSON payload' }, 400);
  }

  const parsed = CreateAgentTaskSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      {
        error: 'Bad Request',
        message: parsed.error.errors[0]?.message || 'Validation failed',
      },
      400
    );
  }

  const service = getAgentHistoryService(c.env);
  const result = await service.createTask(wsId, parsed.data.prompt);
  return c.json(result, 201);
});

// GET /api/v1/agent/tasks/:taskId
agentHistoryRoutes.get('/agent/tasks/:taskId', async (c) => {
  const taskId = c.req.param('taskId');
  const authError = await authorizeTaskAccess(c, taskId, false);
  if (authError) return authError;

  const service = getAgentHistoryService(c.env);
  const task = await service.getTaskDetails(taskId);

  if (!task) {
    return c.json({ error: 'Not Found', message: 'Agent task not found' }, 404);
  }

  return c.json({ task });
});

const AddConversationSchema = z.object({
  role: z.enum(['system', 'user', 'assistant', 'tool']),
  content: z.string().min(1, 'Content cannot be empty'),
  tool_calls: z.any().optional(),
});

// POST /api/v1/agent/tasks/:taskId/conversations
agentHistoryRoutes.post('/agent/tasks/:taskId/conversations', async (c) => {
  const taskId = c.req.param('taskId');
  const authError = await authorizeTaskAccess(c, taskId, true);
  if (authError) return authError;

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Bad Request', message: 'Invalid JSON payload' }, 400);
  }

  const parsed = AddConversationSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      {
        error: 'Bad Request',
        message: parsed.error.errors[0]?.message || 'Validation failed',
      },
      400
    );
  }

  const service = getAgentHistoryService(c.env);
  await service.addConversation(taskId, parsed.data.role, parsed.data.content, parsed.data.tool_calls);
  return c.json({ ok: true }, 201);
});

// POST /api/v1/agent/tasks/:taskId/runs/:runId/progress
agentHistoryRoutes.post('/agent/tasks/:taskId/runs/:runId/progress', async (c) => {
  const taskId = c.req.param('taskId');
  const authError = await authorizeTaskAccess(c, taskId, true);
  if (authError) return authError;

  const runId = c.req.param('runId');
  let body: any;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Bad Request', message: 'Invalid JSON payload' }, 400);
  }

  const event = body?.event || body;
  const service = getAgentHistoryService(c.env);
  await service.recordProgressEvent(taskId, runId, event);
  return c.json({ ok: true });
});

// POST /api/v1/agent/tasks/:taskId/runs/:runId/changeset
agentHistoryRoutes.post('/agent/tasks/:taskId/runs/:runId/changeset', async (c) => {
  const taskId = c.req.param('taskId');
  const authError = await authorizeTaskAccess(c, taskId, true);
  if (authError) return authError;

  const runId = c.req.param('runId');
  let body: any;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Bad Request', message: 'Invalid JSON payload' }, 400);
  }

  const patch = body?.patch || (body?.diffData ? JSON.stringify(body.diffData) : '');
  const changedFiles = body?.changedFiles || (body?.diffData?.filePath ? [body.diffData.filePath] : []);
  const service = getAgentHistoryService(c.env);
  const changeSetId = await service.saveChangeSet(taskId, runId, patch, changedFiles, body?.changeSetId);
  return c.json({ changeSetId }, 201);
});

// POST /api/v1/agent/tasks/:taskId/progress
agentHistoryRoutes.post('/agent/tasks/:taskId/progress', async (c) => {
  const taskId = c.req.param('taskId');
  const authError = await authorizeTaskAccess(c, taskId, true);
  if (authError) return authError;

  let body: any;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Bad Request', message: 'Invalid JSON payload' }, 400);
  }

  const runId = body?.runId || 'run-default';
  const event = body?.event || body;
  const service = getAgentHistoryService(c.env);
  await service.recordProgressEvent(taskId, runId, event);
  return c.json({ ok: true });
});

// POST /api/v1/agent/tasks/:taskId/changesets
agentHistoryRoutes.post('/agent/tasks/:taskId/changesets', async (c) => {
  const taskId = c.req.param('taskId');
  const authError = await authorizeTaskAccess(c, taskId, true);
  if (authError) return authError;

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Bad Request', message: 'Invalid JSON payload' }, 400);
  }

  const parsed = SaveChangeSetSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      {
        error: 'Bad Request',
        message: parsed.error.errors[0]?.message || 'Validation failed',
      },
      400
    );
  }

  const service = getAgentHistoryService(c.env);
  const changeSetId = await service.saveChangeSet(
    taskId,
    parsed.data.runId,
    parsed.data.patch,
    parsed.data.changedFiles
  );
  return c.json({ changeSetId }, 201);
});

// PATCH /api/v1/agent/tasks/:taskId/status
agentHistoryRoutes.patch('/agent/tasks/:taskId/status', async (c) => {
  const taskId = c.req.param('taskId');
  const authError = await authorizeTaskAccess(c, taskId, true);
  if (authError) return authError;

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Bad Request', message: 'Invalid JSON payload' }, 400);
  }

  const parsed = UpdateTaskStatusSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      {
        error: 'Bad Request',
        message: parsed.error.errors[0]?.message || 'Validation failed',
      },
      400
    );
  }

  const service = getAgentHistoryService(c.env);
  await service.updateTaskStatus(taskId, parsed.data.status, parsed.data.error);
  return c.json({ ok: true });
});
