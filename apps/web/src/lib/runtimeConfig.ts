export const RUNTIME_URL =
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_RUNTIME_URL) ||
  'http://127.0.0.1:7890';

const RUNTIME_TOKEN_STORAGE_KEY = 'co_vibe_runtime_token';
let memoryRuntimeToken: string | null = null;
let pendingPairingPromise: Promise<string | null> | null = null;

export function getRuntimeToken(): string | null {
  if (memoryRuntimeToken) return memoryRuntimeToken;
  try {
    const stored =
      typeof window !== 'undefined' ? window.localStorage?.getItem(RUNTIME_TOKEN_STORAGE_KEY) : null;
    if (stored) {
      memoryRuntimeToken = stored;
      return stored;
    }
  } catch {
    // Ignore storage errors
  }
  return null;
}

export function setRuntimeToken(token: string | null): void {
  memoryRuntimeToken = token;
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      if (token) {
        window.localStorage.setItem(RUNTIME_TOKEN_STORAGE_KEY, token);
      } else {
        window.localStorage.removeItem(RUNTIME_TOKEN_STORAGE_KEY);
      }
    }
  } catch {
    // Ignore storage errors
  }
}

export async function pairWithRuntime(
  code?: string,
  workspaceId?: string
): Promise<string | null> {
  if (pendingPairingPromise) return pendingPairingPromise;

  pendingPairingPromise = (async () => {
    try {
      let pairingCode = code;
      if (!pairingCode) {
        const codeRes = await fetch(`${RUNTIME_URL}/api/v1/pairing/code`);
        if (!codeRes.ok) return null;
        const codeData = (await codeRes.json()) as { ok?: boolean; code?: string };
        if (!codeData?.ok || !codeData.code) return null;
        pairingCode = codeData.code;
      }

      const verifyRes = await fetch(`${RUNTIME_URL}/api/v1/pairing/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          workspaceId ? { code: pairingCode, workspaceId } : { code: pairingCode }
        ),
      });
      if (!verifyRes.ok) return null;
      const verifyData = (await verifyRes.json()) as { ok?: boolean; token?: string };
      if (!verifyData?.ok || !verifyData.token) return null;

      setRuntimeToken(verifyData.token);
      return verifyData.token;
    } catch {
      return null;
    } finally {
      pendingPairingPromise = null;
    }
  })();

  return pendingPairingPromise;
}

function buildRuntimeHeaders(
  baseHeaders?: HeadersInit,
  workspaceId?: string,
  token?: string | null
): Record<string, string> | undefined {
  const result: Record<string, string> = {
    ...((baseHeaders as Record<string, string> | undefined) ?? {}),
  };
  if (workspaceId && !result['X-Workspace-Id']) {
    result['X-Workspace-Id'] = workspaceId;
  }
  if (token && !result.Authorization && !result.authorization) {
    result.Authorization = `Bearer ${token}`;
  }
  return Object.keys(result).length > 0 ? result : undefined;
}

export async function fetchRuntime(
  pathOrUrl: string,
  init: RequestInit = {},
  workspaceId?: string
): Promise<Response> {
  const url = /^https?:\/\//.test(pathOrUrl) ? pathOrUrl : `${RUNTIME_URL}${pathOrUrl}`;
  const send = (token: string | null) => {
    const headers = buildRuntimeHeaders(init.headers, workspaceId, token);
    return fetch(url, headers ? { ...init, headers } : { ...init });
  };

  const res = await send(getRuntimeToken());
  if (res.status !== 401) return res;

  const newToken = await pairWithRuntime();
  return newToken ? send(newToken) : res;
}
