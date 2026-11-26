// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useTerminalStore } from './useTerminalStore.js';

describe('useTerminalStore', () => {
  beforeEach(() => {
    useTerminalStore.getState().resetSessions();
    vi.restoreAllMocks();
  });

  it('initializes with a single default idle session', () => {
    const state = useTerminalStore.getState();
    expect(state.sessions).toHaveLength(1);
    expect(state.activeSessionId).toBe('default');
    expect(state.sessions[0]).toMatchObject({
      id: 'default',
      title: 'Terminal 1',
      lines: [],
      isRunning: false,
      executionId: null,
    });
  });

  it('creates a new session, assigns default or custom title, and switches active focus', () => {
    const store = useTerminalStore.getState();
    const id2 = store.createSession();
    const id3 = store.createSession('npm run dev');

    const state = useTerminalStore.getState();
    expect(state.sessions).toHaveLength(3);
    expect(state.sessions[1]).toMatchObject({ id: id2, title: 'Terminal 2' });
    expect(state.sessions[2]).toMatchObject({ id: id3, title: 'npm run dev' });
    expect(state.activeSessionId).toBe(id3);
  });

  it('switches active session and isolates output lines per session', () => {
    const store = useTerminalStore.getState();
    const id2 = store.createSession('Build');

    store.appendLine('default', { stream: 'stdout', chunk: 'server ready\n' });
    store.appendLine(id2, { stream: 'stderr', chunk: 'build failed\n' });
    store.setActiveSession('default');

    const state = useTerminalStore.getState();
    expect(state.activeSessionId).toBe('default');
    expect(state.sessions[0].lines).toEqual([{ stream: 'stdout', chunk: 'server ready\n' }]);
    expect(state.sessions[1].lines).toEqual([{ stream: 'stderr', chunk: 'build failed\n' }]);

    store.clearSession('default');
    expect(useTerminalStore.getState().sessions[0].lines).toEqual([]);
    expect(useTerminalStore.getState().sessions[1].lines).toHaveLength(1);
  });

  it('updates running status, executionId, and abortController independently per session', () => {
    const store = useTerminalStore.getState();
    const id2 = store.createSession('Worker');
    const ac1 = new AbortController();
    const ac2 = new AbortController();

    store.setSessionRunning('default', true, 'exec-1', ac1);
    store.setSessionRunning(id2, true, 'exec-2', ac2);

    const state = useTerminalStore.getState();
    expect(state.sessions[0].isRunning).toBe(true);
    expect(state.sessions[0].executionId).toBe('exec-1');
    expect(state.sessions[0].abortController).toBe(ac1);

    expect(state.sessions[1].isRunning).toBe(true);
    expect(state.sessions[1].executionId).toBe('exec-2');
    expect(state.sessions[1].abortController).toBe(ac2);

    store.setSessionRunning('default', false, null, null);
    expect(useTerminalStore.getState().sessions[0].isRunning).toBe(false);
    expect(useTerminalStore.getState().sessions[1].isRunning).toBe(true);
  });

  it('aborts fetch stream, calls /kill endpoint, and switches to nearest tab when closing a running session', () => {
    const fetchSpy = vi
      .spyOn(global, 'fetch')
      .mockResolvedValue(new Response(JSON.stringify({ ok: true })));

    const store = useTerminalStore.getState();
    const id2 = store.createSession('npm run dev');
    const id3 = store.createSession('git status');
    const ac = new AbortController();
    const abortSpy = vi.spyOn(ac, 'abort');

    store.setSessionRunning(id2, true, 'exec-dev-123', ac);
    store.setActiveSession(id2);
    store.closeSession(id2);

    expect(abortSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy).toHaveBeenCalledWith(
      'http://127.0.0.1:7890/api/v1/exec/exec-dev-123/kill',
      { method: 'POST' }
    );

    const state = useTerminalStore.getState();
    expect(state.sessions.map((s) => s.id)).toEqual(['default', id3]);
    expect(state.activeSessionId).toBe(id3);
  });

  it('prevents closing the last remaining session and resets it cleanly if running', () => {
    const fetchSpy = vi
      .spyOn(global, 'fetch')
      .mockResolvedValue(new Response(JSON.stringify({ ok: true })));

    const store = useTerminalStore.getState();
    const ac = new AbortController();
    store.setSessionRunning('default', true, 'exec-only', ac);
    store.appendLine('default', { stream: 'stdout', chunk: 'hello' });

    store.closeSession('default');

    expect(fetchSpy).toHaveBeenCalledWith(
      'http://127.0.0.1:7890/api/v1/exec/exec-only/kill',
      { method: 'POST' }
    );
    const state = useTerminalStore.getState();
    expect(state.sessions).toHaveLength(1);
    expect(state.sessions[0].id).toBe('default');
    expect(state.sessions[0].isRunning).toBe(false);
    expect(state.sessions[0].lines).toEqual([]);
  });
});
