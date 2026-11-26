// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import React from 'react';
import { AppLayout } from './AppLayout.js';
import { useEditorStore } from '../../features/editor/useEditorStore.js';
import { useDiagnosticsStore } from '../../features/editor/useDiagnosticsStore.js';
import { useTerminalStore } from '../../features/terminal/useTerminalStore.js';

vi.mock('../../features/auth/useAuth.js', () => ({
  useAuth: () => ({ user: { email: 'test@example.com' } }),
}));

function setViewportSize(width: number, height: number) {
  Object.defineProperty(window, 'innerWidth', {
    configurable: true,
    writable: true,
    value: width,
  });
  Object.defineProperty(window, 'innerHeight', {
    configurable: true,
    writable: true,
    value: height,
  });
}

function dispatchPointerEvent(
  target: Element | Node | Window | Document,
  type: 'pointerdown' | 'pointermove' | 'pointerup' | 'pointercancel',
  coords: { clientX?: number; clientY?: number } = {}
) {
  const event = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    button: 0,
    clientX: coords.clientX ?? 0,
    clientY: coords.clientY ?? 0,
  });
  Object.defineProperty(event, 'pointerType', { value: 'mouse' });
  Object.defineProperty(event, 'pointerId', { value: 1 });
  fireEvent(target, event);
}

function dragHandle(
  handle: HTMLElement,
  start: { clientX?: number; clientY?: number },
  end: { clientX?: number; clientY?: number },
  endEvent: 'pointerup' | 'pointercancel' = 'pointerup'
) {
  dispatchPointerEvent(handle, 'pointerdown', start);
  dispatchPointerEvent(window, 'pointermove', {
    clientX: end.clientX ?? start.clientX ?? 0,
    clientY: end.clientY ?? start.clientY ?? 0,
  });
  dispatchPointerEvent(window, endEvent, {
    clientX: end.clientX ?? start.clientX ?? 0,
    clientY: end.clientY ?? start.clientY ?? 0,
  });
}

describe('Workspace Panel Resizing (Sidebar, Terminal, AI Agent)', () => {
  beforeEach(() => {
    setViewportSize(1440, 900);
    useTerminalStore.getState().resetSessions();
    useDiagnosticsStore.getState().clearDiagnostics();
    document.body.style.userSelect = '';
    document.body.style.cursor = '';
    vi.restoreAllMocks();
  });

  afterEach(() => {
    document.body.style.userSelect = '';
    document.body.style.cursor = '';
  });

  it('resizes the File Explorer Sidebar horizontally in both directions and enforces min/max bounds', () => {
    render(<AppLayout />);

    const sidebar = screen.getByTestId('sidebar-panel');
    const handle = screen.getByTestId('sidebar-resize-handle');

    expect(sidebar.style.width).toBe('260px');

    // Drag right by +80px -> 340px
    dragHandle(handle, { clientX: 260 }, { clientX: 340 });
    expect(sidebar.style.width).toBe('340px');

    // Drag left by -120px -> 220px
    dragHandle(handle, { clientX: 340 }, { clientX: 220 });
    expect(sidebar.style.width).toBe('220px');

    // Drag past minimum -> clamped at 180px (never collapses unintentionally)
    dragHandle(handle, { clientX: 220 }, { clientX: 20 });
    expect(sidebar.style.width).toBe('180px');

    // Drag past maximum -> clamped at 480px
    dragHandle(handle, { clientX: 180 }, { clientX: 900 });
    expect(sidebar.style.width).toBe('480px');
  });

  it('resizes the Terminal Panel vertically in both directions and enforces min/max bounds', () => {
    render(<AppLayout />);

    const terminal = screen.getByTestId('terminal-panel');
    const handle = screen.getByTestId('terminal-resize-handle');

    expect(terminal.style.height).toBe('220px');

    // Drag up by 100px -> height increases to 320px
    dragHandle(handle, { clientY: 680 }, { clientY: 580 });
    expect(terminal.style.height).toBe('320px');

    // Drag down by 140px -> height decreases to 180px
    dragHandle(handle, { clientY: 580 }, { clientY: 720 });
    expect(terminal.style.height).toBe('180px');

    // Drag down past minimum -> clamped at 140px
    dragHandle(handle, { clientY: 720 }, { clientY: 880 });
    expect(terminal.style.height).toBe('140px');

    // Drag up past maximum -> clamped at 520px
    dragHandle(handle, { clientY: 760 }, { clientY: 50 });
    expect(terminal.style.height).toBe('520px');
  });

  it('resizes the AI Agent Panel horizontally in both directions and enforces min/max bounds', () => {
    render(<AppLayout />);

    const agent = screen.getByTestId('agent-panel');
    const handle = screen.getByTestId('agent-resize-handle');

    expect(agent.style.width).toBe('320px');

    // Drag left edge left by 100px -> width increases to 420px
    dragHandle(handle, { clientX: 1120 }, { clientX: 1020 });
    expect(agent.style.width).toBe('420px');

    // Drag left edge right by 130px -> width decreases to 290px
    dragHandle(handle, { clientX: 1020 }, { clientX: 1150 });
    expect(agent.style.width).toBe('290px');

    // Drag past minimum -> clamped at 260px
    dragHandle(handle, { clientX: 1150 }, { clientX: 1420 });
    expect(agent.style.width).toBe('260px');

    // Drag past maximum -> clamped at 520px
    dragHandle(handle, { clientX: 1180 }, { clientX: 400 });
    expect(agent.style.width).toBe('520px');
  });

  it('keeps editor flex adaptation and overflow protection intact across panels', () => {
    useEditorStore.setState({
      activeFilePath: 'index.html',
      openFiles: ['index.html'],
      getActiveContent: () => '<p>Preview</p>',
    });

    render(<AppLayout />);

    const appLayout = screen.getByTestId('app-layout');
    const mainRow = screen.getByTestId('workspace-main-row');
    const editorPane = screen.getByTestId('editor-pane');

    expect(appLayout.style.overflow).toBe('hidden');
    expect(mainRow.style.minHeight).toMatch(/^0(px)?$/);
    expect(mainRow.style.minWidth).toMatch(/^0(px)?$/);
    expect(mainRow.style.overflow).toBe('hidden');
    expect(editorPane.style.flex).toContain('1');
    expect(editorPane.style.minWidth).toMatch(/^0(px)?$/);
    expect(editorPane.style.minHeight).toMatch(/^0(px)?$/);

    // Open HTML Preview and ensure it also shrinks cleanly without fixed minWidth overflow
    fireEvent.click(screen.getByRole('button', { name: /Preview/i }));
    const previewPane = screen.getByTestId('html-preview-pane');
    expect(previewPane.style.minWidth).toMatch(/^0(px)?$/);
  });

  it('prevents text selection, mounts drag shield overlay, and cleans up after pointerup/pointercancel', () => {
    render(<AppLayout />);

    const handle = screen.getByTestId('sidebar-resize-handle');

    dispatchPointerEvent(handle, 'pointerdown', { clientX: 260 });

    // During drag: body userSelect disabled, col-resize cursor set, drag overlay active
    expect(document.body.style.userSelect).toBe('none');
    expect(document.body.style.cursor).toBe('col-resize');
    expect(screen.getByTestId('sidebar-resize-handle-overlay')).toBeDefined();
    expect(handle.getAttribute('data-dragging')).toBe('true');

    // Release via pointercancel -> everything restores cleanly
    dispatchPointerEvent(window, 'pointercancel');

    expect(document.body.style.userSelect).toBe('');
    expect(document.body.style.cursor).toBe('');
    expect(screen.queryByTestId('sidebar-resize-handle-overlay')).toBeNull();
    expect(handle.getAttribute('data-dragging')).toBe('false');

    // Repeated drags work without getting stuck
    dragHandle(handle, { clientX: 260 }, { clientX: 310 });
    expect(screen.getByTestId('sidebar-panel').style.width).toBe('310px');
    dragHandle(handle, { clientX: 310 }, { clientX: 275 });
    expect(screen.getByTestId('sidebar-panel').style.width).toBe('275px');
  });

  it('preserves resized dimensions across panel toggle open/close cycles', () => {
    render(<AppLayout />);

    dragHandle(screen.getByTestId('sidebar-resize-handle'), { clientX: 260 }, { clientX: 330 });
    dragHandle(screen.getByTestId('terminal-resize-handle'), { clientY: 680 }, { clientY: 580 });
    dragHandle(screen.getByTestId('agent-resize-handle'), { clientX: 1120 }, { clientX: 1020 });

    // Toggle all three closed
    fireEvent.click(screen.getByRole('button', { name: /Toggle Sidebar/i }));
    fireEvent.click(screen.getByRole('button', { name: /Toggle Terminal/i }));
    fireEvent.click(screen.getByRole('button', { name: /Toggle Agent Panel/i }));

    expect(screen.queryByTestId('sidebar-panel')).toBeNull();
    expect(screen.queryByTestId('terminal-panel')).toBeNull();
    expect(screen.queryByTestId('agent-panel')).toBeNull();

    // Toggle all three open again -> custom sizes are preserved
    fireEvent.click(screen.getByRole('button', { name: /Toggle Sidebar/i }));
    fireEvent.click(screen.getByRole('button', { name: /Toggle Terminal/i }));
    fireEvent.click(screen.getByRole('button', { name: /Toggle Agent Panel/i }));

    expect(screen.getByTestId('sidebar-panel').style.width).toBe('330px');
    expect(screen.getByTestId('terminal-panel').style.height).toBe('320px');
    expect(screen.getByTestId('agent-panel').style.width).toBe('420px');
  });

  it('adapts panel sizes cleanly at smaller viewports without horizontal or vertical overflow', () => {
    setViewportSize(700, 500);
    render(<AppLayout />);

    const sidebarWidth = parseInt(screen.getByTestId('sidebar-panel').style.width, 10);
    const agentWidth = parseInt(screen.getByTestId('agent-panel').style.width, 10);
    const terminalHeight = parseInt(screen.getByTestId('terminal-panel').style.height, 10);

    // Side panels must leave room for the editor (>= 220px) within 700px
    expect(sidebarWidth + agentWidth).toBeLessThanOrEqual(700 - 220);
    // Terminal must leave room for TopBar (48px) and workspace body (>= 160px) within 500px
    expect(terminalHeight).toBeLessThanOrEqual(500 - 48 - 160);

    // Expand viewport back to desktop -> default/saved sizes are restored
    act(() => {
      setViewportSize(1440, 900);
      window.dispatchEvent(new Event('resize'));
    });

    expect(screen.getByTestId('sidebar-panel').style.width).toBe('260px');
    expect(screen.getByTestId('agent-panel').style.width).toBe('320px');
    expect(screen.getByTestId('terminal-panel').style.height).toBe('220px');
  });

  it('supports keyboard resizing and double-click reset on resize handles', () => {
    render(<AppLayout />);

    const sidebarHandle = screen.getByTestId('sidebar-resize-handle');
    const sidebar = screen.getByTestId('sidebar-panel');

    fireEvent.keyDown(sidebarHandle, { key: 'ArrowRight' });
    expect(sidebar.style.width).toBe('276px');

    fireEvent.keyDown(sidebarHandle, { key: 'ArrowLeft', shiftKey: true });
    expect(sidebar.style.width).toBe('228px');

    fireEvent.doubleClick(sidebarHandle);
    expect(sidebar.style.width).toBe('260px');

    const terminalHandle = screen.getByTestId('terminal-resize-handle');
    const terminal = screen.getByTestId('terminal-panel');

    fireEvent.keyDown(terminalHandle, { key: 'ArrowUp' });
    expect(terminal.style.height).toBe('236px');

    fireEvent.doubleClick(terminalHandle);
    expect(terminal.style.height).toBe('220px');
  });
});
