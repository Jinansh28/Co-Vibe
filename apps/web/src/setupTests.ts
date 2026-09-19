import { vi } from 'vitest';

vi.mock('@co-vibe/collaboration', () => ({
  YjsMonacoAdapter: class {
    bind() {}
    destroy() {}
  },
  AwarenessManager: class {
    setLocalState() {}
    getLocalState() { return {}; }
    getAwareness() { return {}; }
  }
}));

// Mock ResizeObserver for Monaco Editor
class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}

global.ResizeObserver = ResizeObserverMock;
