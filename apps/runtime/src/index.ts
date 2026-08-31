import http from 'node:http';
import type { HealthCheckResponse } from '@co-vibe/protocol';

export const PORT = Number(process.env.RUNTIME_PORT || 7890);

export function createRuntimeServer() {
  return http.createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Content-Type', 'application/json');

    if (req.url === '/health' && req.method === 'GET') {
      const health: HealthCheckResponse = {
        service: 'local-runtime',
        status: 'ok',
        timestamp: Date.now(),
        version: '0.1.0',
      };
      res.writeHead(200);
      res.end(JSON.stringify(health));
      return;
    }

    if (req.url === '/' && req.method === 'GET') {
      res.writeHead(200);
      res.end(JSON.stringify({ name: 'Co-Vibe Runtime Daemon', status: 'active' }));
      return;
    }

    res.writeHead(404);
    res.end(JSON.stringify({ error: 'Not Found' }));
  });
}

if (process.env.NODE_ENV !== 'test') {
  const server = createRuntimeServer();
  server.listen(PORT, '127.0.0.1', () => {
    console.log(`[Runtime Daemon] Listening on http://127.0.0.1:${PORT}`);
  });
}
