import { Hono } from 'hono';
import { CreateWorkspaceSchema } from '@co-vibe/protocol';
import type { Env } from '../middleware/auth.js';
import { projectService } from '../services/projectService.js';

export const workspaceRoutes = new Hono<Env>();

// POST /api/v1/projects/:id/workspaces - Spawn new workspace instance
workspaceRoutes.post('/:id/workspaces', async (c) => {
  const authUser = c.get('authUser');
  const id = c.req.param('id');
  let body: unknown;

  try {
    body = await c.req.json();
  } catch {
    return c.json(
      {
        error: 'Bad Request',
        message: 'Invalid JSON payload',
      },
      400
    );
  }

  const result = CreateWorkspaceSchema.safeParse(body);
  if (!result.success) {
    return c.json(
      {
        error: 'Bad Request',
        message: result.error.errors[0]?.message || 'Validation failed',
        details: result.error.format(),
      },
      400
    );
  }

  const res = projectService.createWorkspace(id, authUser.sub, result.data);

  if (res.status === 'invalid_id') {
    return c.json(
      {
        error: 'Bad Request',
        message: 'Invalid UUID format',
      },
      400
    );
  }

  if (res.status === 'not_found') {
    return c.json(
      {
        error: 'Not Found',
        message: 'Project not found',
      },
      404
    );
  }

  if (res.status === 'forbidden') {
    return c.json(
      {
        error: 'Forbidden',
        message: res.message || 'User is not a member of this project',
      },
      403
    );
  }

  return c.json(
    {
      workspace: res.workspace,
    },
    201
  );
});

// GET /api/v1/projects/:id/workspaces - List workspaces in a project
workspaceRoutes.get('/:id/workspaces', (c) => {
  const authUser = c.get('authUser');
  const id = c.req.param('id');

  const res = projectService.listWorkspaces(id, authUser.sub);

  if (res.status === 'invalid_id') {
    return c.json(
      {
        error: 'Bad Request',
        message: 'Invalid UUID format',
      },
      400
    );
  }

  if (res.status === 'not_found') {
    return c.json(
      {
        error: 'Not Found',
        message: 'Project not found',
      },
      404
    );
  }

  if (res.status === 'forbidden') {
    return c.json(
      {
        error: 'Forbidden',
        message: 'User is not a member of this project',
      },
      403
    );
  }

  return c.json({
    workspaces: res.workspaces,
  });
});
