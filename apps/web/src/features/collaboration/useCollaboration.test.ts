// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useCollaboration } from './useCollaboration.js';

const { providerInstances, MockWebsocketProvider } = vi.hoisted(() => {
  const instances: Array<{
    serverUrl: string;
    roomName: string;
    handlers: Record<string, Array<(arg: any) => void>>;
    disconnect: ReturnType<typeof vi.fn>;
  }> = [];

  class MockProvider {
    awareness = {};
    handlers: Record<string, Array<(arg: any) => void>> = {};
    disconnect = vi.fn();
    serverUrl: string;
    roomName: string;

    constructor(serverUrl: string, roomName: string) {
      this.serverUrl = serverUrl;
      this.roomName = roomName;
      instances.push(this);
    }

    on(event: string, cb: (arg: any) => void) {
      this.handlers[event] = this.handlers[event] || [];
      this.handlers[event].push(cb);
    }

    emit(event: string, arg: any) {
      for (const cb of this.handlers[event] || []) {
        cb(arg);
      }
    }
  }

  return { providerInstances: instances, MockWebsocketProvider: MockProvider };
});

vi.mock('y-websocket', () => ({
  WebsocketProvider: MockWebsocketProvider,
}));

vi.mock('../auth/useAuth.js', () => ({
  useAuth: () => ({
    session: { access_token: 'test-jwt-token' },
  }),
}));

describe('useCollaboration WebSocket URL routing', () => {
  beforeEach(() => {
    providerInstances.length = 0;
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('connects to localhost:8787 in local dev when env vars are unset', () => {
    const { result } = renderHook(() =>
      useCollaboration('ws-1', null, null, { name: 'Dev', color: '#38bdf8' })
    );

    expect(providerInstances).toHaveLength(1);
    expect(providerInstances[0].serverUrl).toBe('ws://localhost:8787/api/v1/workspaces');
    expect(providerInstances[0].roomName).toBe('ws-1/room?token=test-jwt-token');
    expect(result.current.connected).toBe(false);

    act(() => {
      (providerInstances[0] as any).emit('status', { status: 'connected' });
    });
    expect(result.current.connected).toBe(true);
  });

  it('derives wss:// URL from VITE_API_URL when VITE_WS_URL is unset', () => {
    vi.stubEnv('VITE_API_URL', 'https://co-vibe-api.workers.dev/');

    renderHook(() =>
      useCollaboration('ws-prod', null, null, { name: 'Dev', color: '#38bdf8' })
    );

    expect(providerInstances).toHaveLength(1);
    expect(providerInstances[0].serverUrl).toBe('wss://co-vibe-api.workers.dev/api/v1/workspaces');
  });

  it('uses explicit VITE_WS_URL when configured', () => {
    vi.stubEnv('VITE_API_URL', 'https://co-vibe-api.workers.dev');
    vi.stubEnv('VITE_WS_URL', 'wss://realtime.co-vibe.dev/');

    renderHook(() =>
      useCollaboration('ws-custom', null, null, { name: 'Dev', color: '#38bdf8' })
    );

    expect(providerInstances).toHaveLength(1);
    expect(providerInstances[0].serverUrl).toBe('wss://realtime.co-vibe.dev/api/v1/workspaces');
  });
});
