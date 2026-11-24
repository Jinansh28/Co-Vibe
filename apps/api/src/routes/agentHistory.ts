import { Hono } from 'hono';
import { z } from 'zod';
import type { Env } from '../middleware/auth.js';
import { getAgentHistoryService } from '../services/agentHistoryService.js';

export const agentHistoryRoutes = new Hono<Env>();

const CreateAgentTaskSchema = z.object({
  prompt: z.string().trim().min(1, 'Prompt cannot be empty'),
});

const RecordProgressSchema = z.object({
  runId: z.string().min(1),
  event: z.record(z.any()),
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
  const service = getAgentHistoryService(c.env);
  const tasks = await service.listWorkspaceTasks(wsId);
  return c.json({ tasks });
});

// POST /api/v1/workspaces/:wsId/agent/tasks
agentHistoryRoutes.post('/workspaces/:wsId/agent/tasks', async (c) => {
  const wsId = c.req.param('wsId');
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
