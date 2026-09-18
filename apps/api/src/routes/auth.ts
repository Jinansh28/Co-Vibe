import { Hono } from 'hono';
import type { Env } from '../middleware/auth.js';

export const authRoutes = new Hono<Env>();

authRoutes.get('/me', (c) => {
  const user = c.get('authUser');
  return c.json({ user });
});

authRoutes.get('/verify', (c) => {
  const user = c.get('authUser');
  return c.json({
    status: 'authenticated',
    user,
  });
});
