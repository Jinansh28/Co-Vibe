import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { Server } from 'node:http';
import { createRuntimeServer } from './index.js';

describe('Runtime Daemon Server Health Check', () => {
  let server: Server;
  const testPort = 7899;

  beforeAll(async () => {
    server = createRuntimeServer();
    await new Promise<void>((resolve) => {
      server.listen(testPort, '127.0.0.1', resolve);
    });
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  });

  it('GET /health returns 200 OK and valid health response', async () => {
    const res = await fetch(`http://127.0.0.1:${testPort}/health`);
    expect(res.status).toBe(200);

    const data = (await res.json()) as Record<string, any>;
    expect(data.service).toBe('local-runtime');
    expect(data.status).toBe('ok');
    expect(typeof data.timestamp).toBe('number');
  });

  it('GET / returns 200 OK and daemon active message', async () => {
    const res = await fetch(`http://127.0.0.1:${testPort}/`);
    expect(res.status).toBe(200);

    const data = (await res.json()) as Record<string, any>;
    expect(data.status).toBe('active');
  });
});
