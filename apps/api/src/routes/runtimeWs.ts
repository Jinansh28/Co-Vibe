import { Hono } from 'hono';
import { verify } from 'hono/jwt';
import { resolveJwtSecret, type Env } from '../middleware/auth.js';

export const runtimeWsRoutes = new Hono<Env>();

runtimeWsRoutes.get('/', async (c) => {
  const secretResolution = resolveJwtSecret('runtime', c.env);
  if (!secretResolution.ok) {
    return c.json(
      {
        error: 'Internal Server Error',
        message: 'Server authentication configuration error',
      },
      500
    );
  }

  const authHeader = c.req.header('Authorization');
  let token = c.req.query('token');

  if (!token && authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.substring(7).trim();
  }

  if (!token) {
    const secProtocol = c.req.header('Sec-WebSocket-Protocol');
    if (secProtocol) {
      const parts = secProtocol.split(',').map((s) => s.trim());
      const bearerPart = parts.find((p) => p.startsWith('bearer.') || p.startsWith('Bearer.'));
      if (bearerPart) {
        token = bearerPart.substring(7);
      } else if (parts[0] && !parts[0].includes(' ')) {
        token = parts[0];
      }
    }
  }

  if (!token) {
    return c.json(
      {
        error: 'Unauthorized',
        message: 'Missing runtime authentication token',
      },
      401
    );
  }

  let payload: any;
  try {
    payload = await verify(token, secretResolution.secret, 'HS256');
  } catch (_err) {
    return c.json(
      {
        error: 'Unauthorized',
        message: 'Invalid or expired runtime token',
      },
      401
    );
  }

  const isWsUpgrade = c.req.header('Upgrade') === 'websocket';

  if (isWsUpgrade && typeof (globalThis as any).WebSocketPair !== 'undefined') {
    const webSocketPair = new (globalThis as any).WebSocketPair();
    const [client, server] = Object.values(webSocketPair) as [any, any];

    server.accept();

    server.addEventListener('message', (event: any) => {
      try {
        const rawData = typeof event.data === 'string' ? event.data : new TextDecoder().decode(event.data);
        const msg = JSON.parse(rawData);

        if (msg.type === 'ping') {
          server.send(
            JSON.stringify({
              type: 'pong',
              timestamp: Date.now(),
              replyTo: msg.id,
            })
          );
        }
      } catch (_err) {
        // Non-JSON or invalid payload
      }
    });

    return new Response(null, {
      status: 101,
      webSocket: client,
    } as any);
  }

  return c.json({
    status: 'connected',
    runtimeId: payload.sub,
    workspaceId: payload.workspaceId,
    message: 'Outbound WebSocket runtime endpoint ready',
  });
});
