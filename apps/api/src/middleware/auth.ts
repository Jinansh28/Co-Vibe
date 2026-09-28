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
    SUPABASE_URL?: string;
    SUPABASE_JWT_SECRET?: string;
    WORKSPACE_ROOM?: DurableObjectNamespace;
  };
  Variables: {
    authUser: AuthUser;
  };
};

// Module-level JWKS cache: maps kid -> CryptoKey, refreshed every 5 minutes
let jwksCache: Map<string, CryptoKey> | null = null;
let jwksCachedAt = 0;
const JWKS_TTL_MS = 5 * 60 * 1000;

async function getJwksKey(supabaseUrl: string, kid: string): Promise<CryptoKey | null> {
  const now = Date.now();
  if (!jwksCache || now - jwksCachedAt > JWKS_TTL_MS) {
    try {
      const res = await fetch(`${supabaseUrl}/auth/v1/.well-known/jwks.json`);
      if (!res.ok) return null;
      const jwks = (await res.json()) as { keys: any[] };
      const newCache = new Map<string, CryptoKey>();
      for (const jwk of jwks.keys) {
        try {
          const key = await crypto.subtle.importKey(
            'jwk',
            jwk,
            { name: 'ECDSA', namedCurve: 'P-256' },
            false,
            ['verify']
          );
          newCache.set(jwk.kid, key);
        } catch {
          // skip keys that cannot be imported
        }
      }
      jwksCache = newCache;
      jwksCachedAt = now;
    } catch {
      return null;
    }
  }
  return jwksCache?.get(kid) ?? null;
}

async function verifyToken(
  token: string,
  supabaseUrl: string | undefined,
  jwtSecret: string
): Promise<AuthUser> {
  // Decode the JWT header to read alg and kid without full verification
  const [headerB64] = token.split('.');
  let alg = 'HS256';
  let kid: string | undefined;
  try {
    const headerJson = atob(headerB64.replace(/-/g, '+').replace(/_/g, '/'));
    const header = JSON.parse(headerJson) as { alg?: string; kid?: string };
    alg = header.alg ?? 'HS256';
    kid = header.kid;
  } catch {
    // fall through to HS256
  }

  // Supabase user JWTs use ES256. Fetch the public key from JWKS and verify.
  if (alg === 'ES256' && supabaseUrl && kid) {
    const pubKey = await getJwksKey(supabaseUrl, kid);
    if (pubKey) {
      // hono/jwt verify() accepts a CryptoKey directly for asymmetric algorithms
      return (await verify(token, pubKey, 'ES256')) as AuthUser;
    }
  }

  // Fall back to HS256 — covers dev tokens, test tokens, and older Supabase projects
  return (await verify(token, jwtSecret, 'HS256')) as AuthUser;
}

export const authMiddleware: MiddlewareHandler<Env> = async (c, next) => {
  const authHeader = c.req.header('Authorization');
  let token: string | undefined;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.substring(7).trim();
  }

  if (!token) {
    token =
      getCookie(c, 'sb-access-token') ||
      getCookie(c, 'access_token') ||
      getCookie(c, 'sb:token') ||
      c.req.query('token');
  }

  if (!token) {
    return c.json(
      { error: 'Unauthorized', message: 'Missing authentication token' },
      401
    );
  }

  const processSecret =
    typeof process !== 'undefined' ? process.env?.SUPABASE_JWT_SECRET : undefined;
  const jwtSecret =
    c.env?.SUPABASE_JWT_SECRET || processSecret || 'dev-secret-key-change-in-prod';
  const supabaseUrl =
    c.env?.SUPABASE_URL ||
    (typeof process !== 'undefined' ? process.env?.SUPABASE_URL : undefined);

  try {
    const payload = await verifyToken(token, supabaseUrl, jwtSecret);
    c.set('authUser', payload);
    await next();
  } catch (_err) {
    return c.json(
      { error: 'Unauthorized', message: 'Invalid or expired token' },
      401
    );
  }
};
