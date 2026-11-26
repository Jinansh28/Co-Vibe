import { create } from 'zustand';
import { RUNTIME_URL } from '../../lib/runtimeConfig.js';

export interface TerminalLine {
  stream: 'stdout' | 'stderr' | 'system' | 'exit';
  chunk?: string;
  exitCode?: number;
  executionId?: string;
}

export interface TerminalSession {
  id: string;
  title: string;
  lines: TerminalLine[];
  isRunning: boolean;
  executionId: string | null;
  runType: 'terminal' | 'tests';
  abortController: AbortController | null;
}

interface TerminalState {
  sessions: TerminalSession[];
  activeSessionId: string;
  createSession: (title?: string) => string;
  closeSession: (id: string) => void;
  setActiveSession: (id: string) => void;
  appendLine: (sessionId: string, line: TerminalLine) => void;
  clearSession: (sessionId: string) => void;
  setSessionRunning: (
    sessionId: string,
    isRunning: boolean,
    executionId?: string | null,
    abortController?: AbortController | null
  ) => void;
  setSessionTitle: (sessionId: string, title: string) => void;
  setSessionRunType: (sessionId: string, runType: 'terminal' | 'tests') => void;
  resetSessions: () => void;
}

const createDefaultSession = (): TerminalSession => ({
  id: 'default',
  title: 'Terminal 1',
  lines: [],
  isRunning: false,
  executionId: null,
  runType: 'terminal',
  abortController: null,
});

function generateSessionId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `term-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function getNextDefaultTitle(sessions: TerminalSession[]): string {
  const existingTitles = new Set(sessions.map((s) => s.title));
  let num = sessions.length + 1;
  while (existingTitles.has(`Terminal ${num}`)) {
    num += 1;
  }
  return `Terminal ${num}`;
}

export const useTerminalStore = create<TerminalState>((set, get) => ({
  sessions: [createDefaultSession()],
  activeSessionId: 'default',

  createSession: (title) => {
    const id = generateSessionId();
    set((state) => {
      const nextTitle = title?.trim() || getNextDefaultTitle(state.sessions);
      const newSession: TerminalSession = {
        id,
        title: nextTitle,
        lines: [],
        isRunning: false,
        executionId: null,
        runType: 'terminal',
        abortController: null,
      };
      return {
        sessions: [...state.sessions, newSession],
        activeSessionId: id,
      };
    });
    return id;
  },

  closeSession: (id) => {
    const target = get().sessions.find((s) => s.id === id);
    if (!target) return;

    if (target.abortController) {
      try {
        target.abortController.abort();
      } catch {
        // Ignore abort errors
      }
    }

    if (target.isRunning && target.executionId && typeof fetch === 'function') {
      fetch(`${RUNTIME_URL}/api/v1/exec/${target.executionId}/kill`, {
        method: 'POST',
      }).catch(() => {
        // Ignore network errors if runtime already exited or is unreachable
      });
    }

    set((state) => {
      if (state.sessions.length <= 1) {
        // Prevent closing the last remaining tab; reset it to a clean idle state
        const only = state.sessions[0];
        return {
          sessions: [
            {
              ...only,
              lines: [],
              isRunning: false,
              executionId: null,
              abortController: null,
            },
          ],
          activeSessionId: only.id,
        };
      }

      const removedIndex = state.sessions.findIndex((s) => s.id === id);
      const remaining = state.sessions.filter((s) => s.id !== id);
      let nextActiveId = state.activeSessionId;

      if (state.activeSessionId === id) {
        const nearestIndex = Math.min(Math.max(0, removedIndex), remaining.length - 1);
        nextActiveId = remaining[nearestIndex].id;
      }

      return {
        sessions: remaining,
        activeSessionId: nextActiveId,
      };
    });
  },

  setActiveSession: (id) =>
    set((state) => {
      if (!state.sessions.some((s) => s.id === id)) return state;
      return { activeSessionId: id };
    }),

  appendLine: (sessionId, line) =>
    set((state) => ({
      sessions: state.sessions.map((s) =>
        s.id === sessionId ? { ...s, lines: [...s.lines, line] } : s
      ),
    })),

  clearSession: (sessionId) =>
    set((state) => ({
      sessions: state.sessions.map((s) =>
        s.id === sessionId ? { ...s, lines: [] } : s
      ),
    })),

  setSessionRunning: (sessionId, isRunning, executionId, abortController) =>
    set((state) => ({
      sessions: state.sessions.map((s) => {
        if (s.id !== sessionId) return s;
        return {
          ...s,
          isRunning,
          executionId: executionId !== undefined ? executionId : s.executionId,
          abortController:
            abortController !== undefined ? abortController : s.abortController,
        };
      }),
    })),

  setSessionTitle: (sessionId, title) =>
    set((state) => ({
      sessions: state.sessions.map((s) =>
        s.id === sessionId ? { ...s, title } : s
      ),
    })),

  setSessionRunType: (sessionId, runType) =>
    set((state) => ({
      sessions: state.sessions.map((s) =>
        s.id === sessionId ? { ...s, runType } : s
      ),
    })),

  resetSessions: () => {
    set({
      sessions: [createDefaultSession()],
      activeSessionId: 'default',
    });
  },
}));
