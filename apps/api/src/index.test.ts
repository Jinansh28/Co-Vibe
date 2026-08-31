import { describe, it, expect } from 'vitest';
import app from './index.js';

describe('API Worker Health Check', () => {
  it('GET /health returns 200 OK and valid health JSON', async () => {
    const res = await app.request('/health');
    expect(res.status).toBe(200);

    const body = (await res.json()) as Record<string, any>;
    expect(body.service).toBe('api-worker');
    expect(body.status).toBe('ok');
    expect(typeof body.timestamp).toBe('number');
  });

  it('GET / returns 200 OK and info JSON', async () => {
    const res = await app.request('/');
    expect(res.status).toBe(200);

    const body = (await res.json()) as Record<string, any>;
    expect(body.status).toBe('online');
  });
});
