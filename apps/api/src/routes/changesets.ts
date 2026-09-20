import { Hono } from 'hono';
import type { Env } from '../middleware/auth.js';

export const changesetRoutes = new Hono<Env>();

changesetRoutes.post('/:id/accept', async (c) => {
  const id = c.req.param('id');
  
  // In a real implementation, this would update the change_set status in the database
  // and send an instruction to the runtime daemon via WebSocket to apply the patch.
  // The runtime daemon would use ChangeSetManager to apply the patch.

  return c.json({
    success: true,
    status: 'accepted',
    message: 'Changeset accepted'
  });
});

changesetRoutes.post('/:id/reject', async (c) => {
  const id = c.req.param('id');
  
  return c.json({
    success: true,
    status: 'rejected',
    message: 'Changeset rejected'
  });
});
