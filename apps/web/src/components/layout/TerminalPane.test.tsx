// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import React from 'react';
import { TerminalPane } from './TerminalPane.js';
import { useDiagnosticsStore, DiagnosticItem } from '../../features/editor/useDiagnosticsStore.js';
import { useTerminalStore } from '../../features/terminal/useTerminalStore.js';

describe('TerminalPane Component with Problems Drawer & Multi-Tab Sessions', () => {
  beforeEach(() => {
    useDiagnosticsStore.getState().clearDiagnostics();
    useTerminalStore.getState().resetSessions();
    vi.restoreAllMocks();
  });

  it('renders terminal drawer with tabs when isOpen is true', () => {
    render(<TerminalPane isOpen={true} />);

    expect(screen.getByTestId('terminal-tab-terminal')).toBeDefined();
    expect(screen.getByTestId('terminal-tab-output')).toBeDefined();
    expect(screen.getByTestId('terminal-tab-problems')).toBeDefined();
    expect(screen.getByTestId('terminal-tab-tests')).toBeDefined();
    expect(screen.getByTestId('terminal-session-tabs')).toBeDefined();
    expect(screen.getByTestId('new-terminal-btn')).toBeDefined();
  });

  it('does not render anything when isOpen is false', () => {
    const { container } = render(<TerminalPane isOpen={false} />);
    expect(container.firstChild).toBeNull();
  });

  it('does not show problem count badge on Problems tab when diagnostics store is empty', () => {
    render(<TerminalPane isOpen={true} />);
    expect(screen.queryByTestId('problems-badge')).toBeNull();
  });

  it('displays updated count badge on the Problems tab header when diagnostics exist', () => {
    const items: DiagnosticItem[] = [
      {
        id: '1',
        filePath: 'src/App.tsx',
        message: 'Cannot find name "x".',
        severity: 'error',
        startLineNumber: 10,
        startColumn: 1,
        endLineNumber: 10,
        endColumn: 2,
      },
      {
        id: '2',
        filePath: 'src/App.tsx',
        message: 'Unused variable "y".',
        severity: 'warning',
        startLineNumber: 12,
        startColumn: 1,
        endLineNumber: 12,
        endColumn: 2,
      },
    ];
    useDiagnosticsStore.getState().setDiagnostics(items);

    render(<TerminalPane isOpen={true} />);

    const badge = screen.getByTestId('problems-badge');
    expect(badge).toBeDefined();
    expect(badge.textContent).toBe('2');
    expect(badge.className).toContain('error-badge');
  });

  it('switches to Problems tab and displays ProblemsView when Problems tab is clicked', () => {
    render(<TerminalPane isOpen={true} />);

    // Initially in terminal tab (shows default dev output)
    expect(screen.getByText('VITE v5.4.10 ready in 240 ms')).toBeDefined();
    expect(screen.queryByTestId('problems-empty-state')).toBeNull();

    // Click Problems tab
    fireEvent.click(screen.getByTestId('terminal-tab-problems'));

    // ProblemsView is rendered with empty state
    expect(screen.getByTestId('problems-empty-state')).toBeDefined();
    expect(screen.getByText('No diagnostics or errors detected.')).toBeDefined();
  });

  it('renders diagnostics list in Problems tab and passes onNavigateToFile and onFixWithAI', () => {
    const items: DiagnosticItem[] = [
      {
        id: 'src/App.tsx:14:5:2304:Cannot find name "foo".',
        filePath: 'src/App.tsx',
        message: 'Cannot find name "foo". Did you mean "for"?',
        severity: 'error',
        startLineNumber: 14,
        startColumn: 5,
        endLineNumber: 14,
        endColumn: 8,
        code: 'ts(2304)',
      },
    ];
    useDiagnosticsStore.getState().setDiagnostics(items);

    const mockNavigate = vi.fn();
    const mockFixWithAI = vi.fn();

    render(
      <TerminalPane
        isOpen={true}
        onNavigateToFile={mockNavigate}
        onFixWithAI={mockFixWithAI}
      />
    );

    // Switch to problems tab
    fireEvent.click(screen.getByTestId('terminal-tab-problems'));

    expect(screen.getByTestId('problems-view')).toBeDefined();
    expect(screen.getByText('Cannot find name "foo". Did you mean "for"?')).toBeDefined();

    // Click problem row -> onNavigateToFile
    const row = screen.getByTestId('problem-row-src/App.tsx:14:5:2304:Cannot find name "foo".');
    fireEvent.click(row);
    expect(mockNavigate).toHaveBeenCalledWith('src/App.tsx', 14, 5);

    // Click Fix with AI -> onFixWithAI
    const fixBtn = screen.getByTestId('fix-ai-btn-src/App.tsx:14:5:2304:Cannot find name "foo".');
    fireEvent.click(fixBtn);
    expect(mockFixWithAI).toHaveBeenCalledWith(items[0]);
  });

  it('creates new terminal tabs via + button, switches between isolated session logs, and routes stdin', () => {
    const mockSendInput = vi.fn();
    render(<TerminalPane isOpen={true} onSendInput={mockSendInput} />);

    // Only 1 session initially -> no close button shown
    expect(screen.queryByTestId('close-session-default')).toBeNull();
    expect(screen.getByText('Terminal 1')).toBeDefined();

    // Click + to create a second session
    fireEvent.click(screen.getByTestId('new-terminal-btn'));

    const sessions = useTerminalStore.getState().sessions;
    expect(sessions).toHaveLength(2);
    const secondId = sessions[1].id;

    // Close button now appears for both tabs
    expect(screen.getByTestId('close-session-default')).toBeDefined();
    expect(screen.getByTestId(`close-session-${secondId}`)).toBeDefined();

    // Append isolated outputs and mark both running
    act(() => {
      useTerminalStore.getState().appendLine('default', { stream: 'stdout', chunk: 'dev server output' });
      useTerminalStore.getState().setSessionRunning('default', true, 'exec-1', null);
      useTerminalStore.getState().appendLine(secondId, { stream: 'stdout', chunk: 'interactive cli output' });
      useTerminalStore.getState().setSessionRunning(secondId, true, 'exec-2', null);
    });

    // Tab 2 is active and displays its own output
    expect(screen.getByText('interactive cli output')).toBeDefined();
    expect(screen.queryByText('dev server output')).toBeNull();

    // Submit stdin in Tab 2
    const stdinInput = screen.getByTestId('terminal-stdin-input') as HTMLInputElement;
    fireEvent.change(stdinInput, { target: { value: 'hello tab 2' } });
    fireEvent.submit(stdinInput.closest('form')!);
    expect(mockSendInput).toHaveBeenCalledWith('hello tab 2', secondId);

    // Switch back to Tab 1
    fireEvent.click(screen.getByTestId('session-tab-default'));
    expect(screen.getByText('dev server output')).toBeDefined();
    expect(screen.queryByText('interactive cli output')).toBeNull();
  });

  it('closes a running session tab via ✕, kills its runtime process, and switches to remaining tab', () => {
    const fetchSpy = vi
      .spyOn(global, 'fetch')
      .mockResolvedValue(new Response(JSON.stringify({ ok: true })));

    const store = useTerminalStore.getState();
    const secondId = store.createSession('npm run dev');
    const abortController = new AbortController();
    const abortSpy = vi.spyOn(abortController, 'abort');
    store.setSessionRunning(secondId, true, 'exec-running-99', abortController);
    store.appendLine('default', { stream: 'stdout', chunk: 'tab 1 idle log' });

    render(<TerminalPane isOpen={true} />);

    // Verify running indicator dot on second tab
    const secondTab = screen.getByTestId(`session-tab-${secondId}`);
    expect(secondTab.textContent).toContain('🟢');

    // Click close button on second tab
    fireEvent.click(screen.getByTestId(`close-session-${secondId}`));

    expect(abortSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy).toHaveBeenCalledWith(
      'http://127.0.0.1:7890/api/v1/exec/exec-running-99/kill',
      { method: 'POST' }
    );
    expect(useTerminalStore.getState().sessions).toHaveLength(1);
    expect(useTerminalStore.getState().activeSessionId).toBe('default');
    expect(screen.getByText('tab 1 idle log')).toBeDefined();
  });
});
