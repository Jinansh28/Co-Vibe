import { describe, it, expect } from 'vitest';
import app from '../src/index.js';

describe('Worker CORS Allowlist', () => {
  it('allows default local dev origin and echoes matching Access-Control-Allow-Origin', async () => {
    const res = await app.request('/health', {
      headers: { Origin: 'http://localhost:5173' },
    });
    expect(res.status).toBe(200);
    expect(res.headers.get('access-control-allow-origin')).toBe('http://localhost:5173');
    expect(res.headers.get('vary')).toContain('Origin');
  });

  it('omits Access-Control-Allow-Origin for non-allowlisted origins', async () => {
    const res = await app.request('/health', {
      headers: { Origin: 'https://evil.example.com' },
    });
    expect(res.status).toBe(200);
    expect(res.headers.get('access-control-allow-origin')).toBeNull();
    expect(res.headers.get('vary')).toContain('Origin');
  });

  it('respects ALLOWED_ORIGINS and FRONTEND_URL from Worker Env bindings', async () => {
    const allowedRes = await app.request(
      '/health',
      {
        headers: { Origin: 'https://app.covibe.dev' },
      },
      {
        ENVIRONMENT: 'production',
        ALLOWED_ORIGINS: 'https://app.covibe.dev',
        FRONTEND_URL: 'https://preview.covibe.dev',
      } as any
    );
    expect(allowedRes.headers.get('access-control-allow-origin')).toBe('https://app.covibe.dev');

    const frontendRes = await app.request(
      '/health',
      {
        headers: { Origin: 'https://preview.covibe.dev' },
      },
      {
        ENVIRONMENT: 'production',
        ALLOWED_ORIGINS: 'https://app.covibe.dev',
        FRONTEND_URL: 'https://preview.covibe.dev',
      } as any
    );
    expect(frontendRes.headers.get('access-control-allow-origin')).toBe('https://preview.covibe.dev');

    // Localhost is not allowed in production unless explicitly configured
    const devOriginInProd = await app.request(
      '/health',
      {
        headers: { Origin: 'http://localhost:5173' },
      },
      {
        ENVIRONMENT: 'production',
        ALLOWED_ORIGINS: 'https://app.covibe.dev',
      } as any
    );
    expect(devOriginInProd.headers.get('access-control-allow-origin')).toBeNull();
  });
});
