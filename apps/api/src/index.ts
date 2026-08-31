import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { HealthCheckResponse } from '@co-vibe/protocol';

const app = new Hono();

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

export default app;
