import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { Server } from 'node:http';
import { TokenManager } from '../src/auth/tokenManager.js';
import { createPairingServer } from '../src/server/pairingServer.js';

describe('TokenManager', () => {
  it('generates a valid 6-digit pairing code with expiration', () => {
    const tm = new TokenManager('test-secret-key');
    const info = tm.generatePairingCode(60000);

    expect(info.code).toMatch(/^\d{6}$/);
    expect(info.expiresAt).toBeGreaterThan(Date.now());
  });

  it('verifies correct pairing code and invalidates it afterwards', () => {
    const tm = new TokenManager('test-secret-key');
    const info = tm.generatePairingCode(60000);

    expect(tm.verifyPairingCode('000000')).toBe(false);
    expect(tm.verifyPairingCode(info.code)).toBe(true);
    // Reuse should fail
    expect(tm.verifyPairingCode(info.code)).toBe(false);
  });

  it('rejects expired pairing code', () => {
    const tm = new TokenManager('test-secret-key');
    const info = tm.generatePairingCode(-1000); // Already expired

    expect(tm.verifyPairingCode(info.code)).toBe(false);
  });

  it('generates and verifies signed HS256 runtime JWT token', () => {
    const secret = 'custom-test-secret';
    const tm = new TokenManager(secret, 'test-runtime-123');
    const tokenInfo = tm.generateRuntimeToken('ws-project-abc');

    expect(tokenInfo.runtimeId).toBe('test-runtime-123');
    expect(tokenInfo.token.split('.').length).toBe(3);

    const payload = tm.verifyRuntimeToken(tokenInfo.token);
    expect(payload.sub).toBe('test-runtime-123');
    expect(payload.role).toBe('runtime');
    expect(payload.workspaceId).toBe('ws-project-abc');
  });
});

describe('Pairing Server HTTP Endpoints', () => {
  let server: Server;
  let tokenManager: TokenManager;
  const testPort = 7898;
  const baseUrl = `http://127.0.0.1:${testPort}`;

  beforeAll(async () => {
    tokenManager = new TokenManager('test-secret-key', 'runtime-test-id');
    server = createPairingServer(tokenManager);
    await new Promise<void>((resolve) => {
      server.listen(testPort, '127.0.0.1', resolve);
    });
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  });

  it('GET /health returns 200 OK', async () => {
    const res = await fetch(`${baseUrl}/health`);
    expect(res.status).toBe(200);

    const data = (await res.json()) as Record<string, any>;
    expect(data.status).toBe('ok');
    expect(data.service).toBe('local-runtime');
  });

  it('GET /api/v1/pairing/code returns active pairing code', async () => {
    const res = await fetch(`${baseUrl}/api/v1/pairing/code`);
    expect(res.status).toBe(200);

    const data = (await res.json()) as Record<string, any>;
    expect(data.ok).toBe(true);
    expect(data.code).toMatch(/^\d{6}$/);
    expect(typeof data.expiresAt).toBe('number');
  });

  it('POST /api/v1/pairing/verify rejects incorrect code', async () => {
    const res = await fetch(`${baseUrl}/api/v1/pairing/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: '000000' }),
    });

    expect(res.status).toBe(401);
    const data = (await res.json()) as Record<string, any>;
    expect(data.ok).toBe(false);
    expect(data.error).toBe('Invalid or expired pairing code');
  });

  it('POST /api/v1/pairing/verify accepts valid code and exchanges for token', async () => {
    const codeInfo = tokenManager.getPairingCode();

    const res = await fetch(`${baseUrl}/api/v1/pairing/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: codeInfo.code, workspaceId: 'ws-456' }),
    });

    expect(res.status).toBe(200);
    const data = (await res.json()) as Record<string, any>;
    expect(data.ok).toBe(true);
    expect(typeof data.token).toBe('string');
    expect(data.runtimeId).toBe('runtime-test-id');
    expect(typeof data.expiresAt).toBe('number');

    // Check status endpoint
    const statusRes = await fetch(`${baseUrl}/api/v1/pairing/status`);
    const statusData = (await statusRes.json()) as Record<string, any>;
    expect(statusData.paired).toBe(true);
    expect(statusData.runtimeId).toBe('runtime-test-id');
  });

  it('OPTIONS CORS preflight returns 204 No Content', async () => {
    const res = await fetch(`${baseUrl}/api/v1/pairing/verify`, {
      method: 'OPTIONS',
    });
    expect(res.status).toBe(204);
  });
});
