import http from 'node:http';
import { PairingVerifySchema } from '@co-vibe/protocol';
import { TokenManager } from '../auth/tokenManager.js';

export function setCorsHeaders(res: http.ServerResponse): void {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

export async function parseJsonBody<T>(req: http.IncomingMessage): Promise<T | null> {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk.toString();
    });
    req.on('end', () => {
      try {
        resolve(body ? (JSON.parse(body) as T) : null);
      } catch (_e) {
        resolve(null);
      }
    });
    req.on('error', () => resolve(null));
  });
}

export function createPairingRequestHandler(tokenManager: TokenManager) {
  return async (req: http.IncomingMessage, res: http.ServerResponse) => {
    setCorsHeaders(res);
    res.setHeader('Content-Type', 'application/json');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    const url = new URL(req.url || '/', `http://${req.headers.host || '127.0.0.1'}`);
    const pathname = url.pathname;
    const method = req.method?.toUpperCase();

    if (pathname === '/health' && method === 'GET') {
      res.writeHead(200);
      res.end(
        JSON.stringify({
          service: 'local-runtime',
          status: 'ok',
          timestamp: Date.now(),
          version: '0.1.0',
        })
      );
      return;
    }

    if (pathname === '/' && method === 'GET') {
      res.writeHead(200);
      res.end(
        JSON.stringify({
          name: 'Co-Vibe Runtime Daemon',
          status: 'active',
          runtimeId: tokenManager.getRuntimeId(),
        })
      );
      return;
    }

    if (
      (pathname === '/api/v1/pairing/code' || pathname === '/pairing/code') &&
      method === 'GET'
    ) {
      const codeInfo = tokenManager.getPairingCode();
      res.writeHead(200);
      res.end(
        JSON.stringify({
          ok: true,
          code: codeInfo.code,
          expiresAt: codeInfo.expiresAt,
        })
      );
      return;
    }

    if (
      (pathname === '/api/v1/pairing/verify' ||
        pathname === '/pairing/verify' ||
        pathname === '/pair') &&
      method === 'POST'
    ) {
      const body = await parseJsonBody<any>(req);
      const parsed = PairingVerifySchema.safeParse(body);

      if (!parsed.success) {
        res.writeHead(400);
        res.end(
          JSON.stringify({
            ok: false,
            error: 'Invalid request payload: 6-digit code required',
            details: parsed.error.issues,
          })
        );
        return;
      }

      const isValid = tokenManager.verifyPairingCode(parsed.data.code);

      if (!isValid) {
        res.writeHead(401);
        res.end(
          JSON.stringify({
            ok: false,
            error: 'Invalid or expired pairing code',
          })
        );
        return;
      }

      const tokenInfo = tokenManager.generateRuntimeToken(parsed.data.workspaceId);
      res.writeHead(200);
      res.end(
        JSON.stringify({
          ok: true,
          token: tokenInfo.token,
          runtimeId: tokenInfo.runtimeId,
          expiresAt: tokenInfo.expiresAt,
        })
      );
      return;
    }

    if (
      (pathname === '/api/v1/pairing/status' || pathname === '/pairing/status') &&
      method === 'GET'
    ) {
      res.writeHead(200);
      res.end(
        JSON.stringify({
          ok: true,
          paired: Boolean(tokenManager.getActiveToken()),
          runtimeId: tokenManager.getRuntimeId(),
        })
      );
      return;
    }

    res.writeHead(404);
    res.end(JSON.stringify({ ok: false, error: 'Not Found' }));
  };
}

export function createPairingServer(tokenManager: TokenManager = new TokenManager()): http.Server {
  const handler = createPairingRequestHandler(tokenManager);
  return http.createServer(handler);
}
