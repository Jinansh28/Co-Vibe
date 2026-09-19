import type { MiddlewareHandler } from 'hono';
import { verify } from 'hono/jwt';
import { getCookie } from 'hono/cookie';

export interface AuthUser {
  sub: string;
  email?: string;
  role?: string;
  app_metadata?: Record<string, any>;
  user_metadata?: Record<string, any>;
  [key: string]: any;
}

export type Env = {
  Bindings: {
    SUPABASE_JWT_SECRET?: string;
    WORKSPACE_ROOM?: DurableObjectNamespace;
  };
  Variables: {
    authUser: AuthUser;
  };
};

export const authMiddleware: MiddlewareHandler<Env> = async (c, next) => {
  const authHeader = c.req.header('Authorization');
  let token: string | undefined;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.substring(7).trim();
  }

  if (!token) {
    token = getCookie(c, 'sb-access-token') || getCookie(c, 'access_token') || getCookie(c, 'sb:token');
  }

  if (!token) {
    return c.json(
      {
        error: 'Unauthorized',
        message: 'Missing authentication token',
      },
      401
    );
  }

  const processSecret = typeof process !== 'undefined' ? process.env?.SUPABASE_JWT_SECRET : undefined;
  const jwtSecret = c.env?.SUPABASE_JWT_SECRET || processSecret || 'dev-secret-key-change-in-prod';

  try {
    const payload = (await verify(token, jwtSecret, 'HS256')) as AuthUser;
    c.set('authUser', payload);
    await next();
  } catch (_err) {
    return c.json(
      {
        error: 'Unauthorized',
        message: 'Invalid or expired token',
      },
      401
    );
  }
};
