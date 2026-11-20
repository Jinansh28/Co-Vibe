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

if (typeof document !== 'undefined' && !document.queryCommandSupported) {
  document.queryCommandSupported = () => false;
}

if (typeof window !== 'undefined') {
  if (!window.CSS) {
    (window as any).CSS = {};
  }
  if (!window.CSS.escape) {
    window.CSS.escape = (s: string) => s;
  }
  if (!window.matchMedia) {
    window.matchMedia = vi.fn().mockImplementation((query) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));
  }
}

if (typeof navigator !== 'undefined') {
  if (!navigator.clipboard) {
    (navigator as any).clipboard = {
      writeText: vi.fn().mockResolvedValue(undefined),
      readText: vi.fn().mockResolvedValue(''),
      write: vi.fn().mockResolvedValue(undefined),
      read: vi.fn().mockResolvedValue([]),
    };
  }
}

if (typeof HTMLCanvasElement !== 'undefined') {
  HTMLCanvasElement.prototype.getContext = vi.fn().mockReturnValue({
    fillRect: vi.fn(),
    clearRect: vi.fn(),
    getImageData: vi.fn().mockReturnValue({ data: new Uint8ClampedArray(100) }),
    putImageData: vi.fn(),
    createImageData: vi.fn().mockReturnValue({ data: new Uint8ClampedArray(100) }),
    setTransform: vi.fn(),
    drawImage: vi.fn(),
    save: vi.fn(),
    fillText: vi.fn(),
    restore: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    closePath: vi.fn(),
    stroke: vi.fn(),
    translate: vi.fn(),
    scale: vi.fn(),
    rotate: vi.fn(),
    arc: vi.fn(),
    fill: vi.fn(),
    measureText: vi.fn().mockReturnValue({ width: 0 }),
    transform: vi.fn(),
    rect: vi.fn(),
    clip: vi.fn(),
  }) as any;
}

if (typeof globalThis !== 'undefined' && !(globalThis as any).ClipboardItem) {
  (globalThis as any).ClipboardItem = class ClipboardItem {};
}


// Ignore Monaco Editor unmount cancellation rejections in JSDOM
if (typeof process !== 'undefined') {
  process.on('unhandledRejection', (reason: any) => {
    if (reason === 'Canceled' || reason?.message === 'Canceled' || reason?.name === 'Canceled') {
      return;
    }
  });
}




