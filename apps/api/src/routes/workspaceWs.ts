import { Hono } from 'hono';
import type { Env } from '../middleware/auth.js';

export const workspaceWsRoutes = new Hono<Env>();

// GET /api/v1/workspaces/:id/room
workspaceWsRoutes.get('/:id/room', async (c) => {
  const id = c.req.param('id');
  const upgradeHeader = c.req.header('Upgrade');
  
  if (upgradeHeader !== 'websocket') {
    return c.text('Expected Upgrade: websocket', 426);
  }

  const DO = c.env?.WORKSPACE_ROOM;
  if (!DO) {
    return c.text('Durable Object not bound', 500);
  }

  const doId = DO.idFromName(id);
  const stub = DO.get(doId);

  return stub.fetch(c.req.raw);
});
