// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  RUNTIME_URL,
  getRuntimeToken,
  setRuntimeToken,
  pairWithRuntime,
  fetchRuntime,
} from './runtimeConfig.js';

describe('runtimeConfig token & pairing helpers', () => {
  beforeEach(() => {
    setRuntimeToken(null);
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('stores and retrieves runtime bearer token', () => {
    expect(getRuntimeToken()).toBeNull();
    setRuntimeToken('jwt-token-abc');
    expect(getRuntimeToken()).toBe('jwt-token-abc');
    expect(localStorage.getItem('co_vibe_runtime_token')).toBe('jwt-token-abc');
  });

  it('pairs with runtime using code and verify endpoints', async () => {
    const fetchSpy = vi
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: true, code: '123456', expiresAt: Date.now() + 60000 }), {
          status: 200,
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: true, token: 'paired-jwt-token' }), { status: 200 })
      );

    const token = await pairWithRuntime(undefined, 'ws-1');
    expect(token).toBe('paired-jwt-token');
    expect(getRuntimeToken()).toBe('paired-jwt-token');
    expect(fetchSpy).toHaveBeenNthCalledWith(1, `${RUNTIME_URL}/api/v1/pairing/code`);
    expect(fetchSpy).toHaveBeenNthCalledWith(
      2,
      `${RUNTIME_URL}/api/v1/pairing/verify`,
      expect.objectContaining({ method: 'POST' })
    );
  });

  it('fetchRuntime attaches bearer token and auto-pairs once on 401', async () => {
    const fetchSpy = vi
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: false }), { status: 401 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: true, code: '654321' }), { status: 200 })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: true, token: 'fresh-jwt' }), { status: 200 })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: true, files: [] }), { status: 200 })
      );

    const res = await fetchRuntime('/api/v1/files', {}, 'ws-auto');
    expect(res.status).toBe(200);
    expect(getRuntimeToken()).toBe('fresh-jwt');
    expect(fetchSpy).toHaveBeenLastCalledWith(
      `${RUNTIME_URL}/api/v1/files`,
      expect.objectContaining({
        headers: {
          'X-Workspace-Id': 'ws-auto',
          Authorization: 'Bearer fresh-jwt',
        },
      })
    );
  });
});
