export interface ApiEnvOverrides {
  VITE_API_URL?: string;
  VITE_API_BASE_URL?: string;
  VITE_WS_URL?: string;
  PROD?: boolean;
}

function readDefaultEnv(): ApiEnvOverrides {
  if (typeof import.meta === 'undefined' || !import.meta.env) {
    return {};
  }
  return {
    VITE_API_URL: import.meta.env.VITE_API_URL,
    VITE_API_BASE_URL: import.meta.env.VITE_API_BASE_URL,
    VITE_WS_URL: import.meta.env.VITE_WS_URL,
    PROD: import.meta.env.PROD,
  };
}

/**
 * Resolves the Cloudflare Worker HTTP API base URL without trailing slashes.
 * Returns an empty string when unset so Vite's local `/api` proxy and
 * relative unit-test fetches continue to work seamlessly.
 */
export function getApiBaseUrl(env: ApiEnvOverrides = readDefaultEnv()): string {
  const raw = (env.VITE_API_URL || env.VITE_API_BASE_URL || '').trim();
  return raw.replace(/\/+$/, '');
}

/**
 * Builds an API URL against the configured Worker base URL.
 */
export function apiUrl(path: string, env: ApiEnvOverrides = readDefaultEnv()): string {
  if (/^https?:\/\//.test(path)) {
    return path;
  }
  const base = getApiBaseUrl(env);
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${base}${normalizedPath}`;
}

/**
 * Resolves the WebSocket base URL for collaboration room connections.
 * Priority: VITE_WS_URL -> derived from VITE_API_URL / VITE_API_BASE_URL ->
 * window.location (production) -> localhost:8787 (local dev).
 */
export function getWsBaseUrl(
  env: ApiEnvOverrides = readDefaultEnv(),
  loc: Pick<Location, 'protocol' | 'host' | 'hostname'> | undefined =
    typeof window !== 'undefined' ? window.location : undefined
): string {
  const explicitWs = env.VITE_WS_URL?.trim();
  if (explicitWs) {
    return explicitWs.replace(/\/+$/, '');
  }

  const apiBase = getApiBaseUrl(env);
  if (apiBase) {
    try {
      const parsed = new URL(apiBase);
      const wsProto = parsed.protocol === 'https:' ? 'wss:' : 'ws:';
      return `${wsProto}//${parsed.host}`;
    } catch {
      // Fall through if apiBase is not a full URL
    }
  }

  const proto = loc?.protocol === 'https:' ? 'wss:' : 'ws:';
  const isLocalHost =
    !loc?.hostname || loc.hostname === 'localhost' || loc.hostname === '127.0.0.1';
  if ((env.PROD || !isLocalHost) && loc?.host) {
    return `${proto}//${loc.host}`;
  }
  return `${proto}//localhost:8787`;
}
