import { Hono } from 'hono';
import type { Env } from '../middleware/auth.js';

export const gitRoutes = new Hono<Env>();

gitRoutes.get('/:workspaceId/status', async (c) => {
  const workspaceId = c.req.param('workspaceId');
  // In a real implementation, this would send an envelope to the runtime daemon
  // over the WebSocket and await the response.
  return c.json({
    status: {
      staged: [],
      modified: [],
      untracked: []
    }
  });
});

gitRoutes.get('/:workspaceId/diff', async (c) => {
  const workspaceId = c.req.param('workspaceId');
  return c.json({
    diff: ''
  });
});

gitRoutes.post('/:workspaceId/branch', async (c) => {
  const workspaceId = c.req.param('workspaceId');
  const body = await c.req.json();
  
  return c.json({
    success: true,
    branch: body.branchName
  });
});

gitRoutes.post('/:workspaceId/commit', async (c) => {
  const workspaceId = c.req.param('workspaceId');
  const body = await c.req.json();
  
  return c.json({
    success: true,
    message: body.message
  });
});
