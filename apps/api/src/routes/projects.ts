import { Hono } from 'hono';
import { CreateProjectSchema, InviteProjectMemberSchema } from '@co-vibe/protocol';
import type { Env } from '../middleware/auth.js';
import { projectService } from '../services/projectService.js';

export const projectRoutes = new Hono<Env>();

// GET /api/v1/projects - List user's projects
projectRoutes.get('/', (c) => {
  const authUser = c.get('authUser');
  const projects = projectService.listUserProjects(authUser.sub, authUser.email);
  return c.json({ projects });
});

// POST /api/v1/projects - Create project
projectRoutes.post('/', async (c) => {
  const authUser = c.get('authUser');
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

  const result = CreateProjectSchema.safeParse(body);
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

  const email = authUser.email || `${authUser.sub}@co-vibe.dev`;
  const { project, member } = projectService.createProject(authUser.sub, email, result.data);

  return c.json(
    {
      project,
      member,
    },
    201
  );
});

// GET /api/v1/projects/:id - Get project details with RBAC authorization check
projectRoutes.get('/:id', (c) => {
  const authUser = c.get('authUser');
  const id = c.req.param('id');

  const result = projectService.getProject(id, authUser.sub);

  if (result.status === 'invalid_id') {
    return c.json(
      {
        error: 'Bad Request',
        message: 'Invalid UUID format',
      },
      400
    );
  }

  if (result.status === 'not_found') {
    return c.json(
      {
        error: 'Not Found',
        message: 'Project not found',
      },
      404
    );
  }

  if (result.status === 'forbidden') {
    return c.json(
      {
        error: 'Forbidden',
        message: 'User is not a member of this project',
      },
      403
    );
  }

  return c.json({
    project: result.project,
    role: result.role,
    members: result.members,
    workspaces: result.workspaces,
  });
});

// POST /api/v1/projects/:id/invite - Invite a collaborator to a project
projectRoutes.post('/:id/invite', async (c) => {
  const authUser = c.get('authUser');
  const id = c.req.param('id');

  // Check if user is owner
  const result = projectService.getProject(id, authUser.sub);
  if (result.status === 'invalid_id') {
    return c.json({ error: 'Bad Request', message: 'Invalid UUID format' }, 400);
  }
  if (result.status === 'not_found') {
    return c.json({ error: 'Not Found', message: 'Project not found' }, 404);
  }
  if (result.status === 'forbidden') {
    return c.json({ error: 'Forbidden', message: 'User is not a member of this project' }, 403);
  }
  if (result.role !== 'owner') {
    return c.json({ error: 'Forbidden', message: 'Only project owners can invite members' }, 403);
  }

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Bad Request', message: 'Invalid JSON payload' }, 400);
  }

  const parseResult = InviteProjectMemberSchema.safeParse(body);
  if (!parseResult.success) {
    return c.json(
      {
        error: 'Bad Request',
        message: parseResult.error.errors[0]?.message || 'Validation failed',
        details: parseResult.error.format(),
      },
      400
    );
  }

  // Create or add the member (mocking the authUserId for now with invite_ prefix)
  const mockAuthUserId = `invite_${parseResult.data.email}`;
  const member = projectService.addMember(id, mockAuthUserId, parseResult.data.email, parseResult.data.role);

  return c.json({ member }, 201);
});
