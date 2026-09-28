import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { HealthCheckResponse } from '@co-vibe/protocol';
import { authMiddleware, type Env } from './middleware/auth.js';
import { auditMiddleware } from './middleware/audit.js';
import { authRoutes } from './routes/auth.js';
import { projectRoutes } from './routes/projects.js';
import { workspaceRoutes } from './routes/workspaces.js';
import { runtimeWsRoutes } from './routes/runtimeWs.js';
import { workspaceWsRoutes } from './routes/workspaceWs.js';
import { gitRoutes } from './routes/git.js';
import { changesetRoutes } from './routes/changesets.js';

export { WorkspaceRoom } from './durable-objects/WorkspaceRoom.js';

const app = new Hono<Env>();

app.use('*', cors());

app.get('/health', (c) => {
  const health: HealthCheckResponse = {
    service: 'api-worker',
    status: 'ok',
    timestamp: Date.now(),
    version: '0.1.0',
  };
  return c.json(health);
});

app.get('/', (c) => {
  return c.json({ name: 'Co-Vibe API Worker', status: 'online' });
});

// Runtime WebSocket — unauthenticated at app level (uses its own token auth)
app.route('/ws/runtime', runtimeWsRoutes);

// Workspace WebSocket — mounted at app level to bypass authMiddleware.
// The route handler performs its own token introspection via Supabase.
// Browser WebSocket APIs cannot send Authorization headers, so the token
// is passed as a query parameter and verified server-side.
app.route('/api/v1/workspaces', workspaceWsRoutes);

// All other API v1 routes — guarded by JWT authMiddleware + audit logging
const apiV1 = new Hono<Env>();
apiV1.route('/ws/runtime', runtimeWsRoutes);
apiV1.use('*', authMiddleware);
apiV1.use('*', auditMiddleware);
apiV1.route('/auth', authRoutes);
apiV1.route('/projects', projectRoutes);
apiV1.route('/projects', workspaceRoutes);
apiV1.route('/workspaces', gitRoutes);
apiV1.route('/changesets', changesetRoutes);

app.route('/api/v1', apiV1);

export default app;
