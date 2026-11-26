// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import React from 'react';
import { AppLayout } from './AppLayout.js';
import { useEditorStore } from '../../features/editor/useEditorStore.js';
import { useDiagnosticsStore } from '../../features/editor/useDiagnosticsStore.js';
import { useTerminalStore } from '../../features/terminal/useTerminalStore.js';

vi.mock('../../features/auth/useAuth.js', () => ({
  useAuth: () => ({ user: { email: 'test@example.com' } })
}));

describe('AppLayout IDE Shell Grid', () => {
  beforeEach(() => {
    useTerminalStore.getState().resetSessions();
    useDiagnosticsStore.getState().clearDiagnostics();
    vi.restoreAllMocks();
  });
  it('renders top bar, sidebar, editor pane, agent panel, and terminal drawer', () => {
    render(<AppLayout />);

    expect(screen.getByText('Co-Vibe')).toBeDefined();
    expect(screen.getByText('Explorer')).toBeDefined();
    expect(screen.getAllByText('AI Agent').length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: /Toggle Terminal/i })).toBeDefined();
  });

  it('collapses and expands sidebar when sidebar toggle button is clicked', () => {
    render(<AppLayout />);

    const sidebarToggle = screen.getByRole('button', { name: /Toggle Sidebar/i });
    expect(screen.queryByText('Explorer')).not.toBeNull();

    // Collapse Sidebar
    fireEvent.click(sidebarToggle);
    expect(screen.queryByText('Explorer')).toBeNull();

    // Expand Sidebar
    fireEvent.click(sidebarToggle);
    expect(screen.queryByText('Explorer')).not.toBeNull();
  });

  it('collapses and expands agent panel when agent panel toggle button is clicked', () => {
    render(<AppLayout />);

    const agentToggle = screen.getByRole('button', { name: /Toggle Agent Panel/i });
    // Initially open: both TopBar button and AgentPanel header text exist (2 elements)
    expect(screen.getAllByText('AI Agent').length).toBe(2);

    // Collapse Agent Panel -> only 1 element remains (the TopBar toggle button)
    fireEvent.click(agentToggle);
    expect(screen.getAllByText('AI Agent').length).toBe(1);

    // Expand Agent Panel -> 2 elements again
    fireEvent.click(agentToggle);
    expect(screen.getAllByText('AI Agent').length).toBe(2);
  });

  it('collapses and expands terminal drawer when terminal toggle button is clicked', () => {
    render(<AppLayout />);

    const terminalToggle = screen.getByRole('button', { name: /Toggle Terminal/i });
    expect(screen.queryByText('VITE v5.4.10 ready in 240 ms')).not.toBeNull();

    // Collapse Terminal
    fireEvent.click(terminalToggle);
    expect(screen.queryByText('VITE v5.4.10 ready in 240 ms')).toBeNull();

    // Expand Terminal
    fireEvent.click(terminalToggle);
    expect(screen.queryByText('VITE v5.4.10 ready in 240 ms')).not.toBeNull();
  });

  it('renders Preview button in TopBar and opens HTML preview pane when an HTML file is active', async () => {
    useEditorStore.setState({
      activeFilePath: 'index.html',
      openFiles: ['index.html'],
      getActiveContent: () => '<h1>Hello From Active Content</h1>',
    });

    render(<AppLayout />);

    const previewBtn = screen.getByRole('button', { name: /Preview/i });
    expect(previewBtn).toBeDefined();

    // Initially preview pane is not open
    expect(screen.queryByTestId('html-preview-pane')).toBeNull();

    // Click Run Project -> opens preview pane instead of falling back to npm run dev
    const runBtn = screen.getByRole('button', { name: /Run Project/i });
    fireEvent.click(runBtn);

    await waitFor(() => {
      expect(screen.queryByTestId('html-preview-pane')).not.toBeNull();
    });
    const iframe = screen.getByTestId('html-preview-iframe') as HTMLIFrameElement;
    expect(iframe.getAttribute('srcdoc')).toBe('<h1>Hello From Active Content</h1>');

    // Click Close on the preview pane
    const previewPane = screen.getByTestId('html-preview-pane');
    const closeBtn = within(previewPane).getByRole('button', { name: /^Close$/i });
    fireEvent.click(closeBtn);
    expect(screen.queryByTestId('html-preview-pane')).toBeNull();

    // Click Preview button in TopBar -> opens preview pane
    fireEvent.click(previewBtn);
    await waitFor(() => {
      expect(screen.queryByTestId('html-preview-pane')).not.toBeNull();
    });
  });

  it('opens AgentPanel and displays attachment preview badge when Snapshot to AI is clicked in HtmlPreview', async () => {
    useEditorStore.setState({
      activeFilePath: 'navbar.html',
      openFiles: ['navbar.html'],
      getActiveContent: () => '<nav><button>Log In</button></nav>',
    });

    render(<AppLayout initialAgentOpen={false} />);

    // Agent panel is initially closed
    expect(screen.queryByTestId('agent-attachment-badge')).toBeNull();

    // Open Preview pane
    const previewBtn = screen.getByRole('button', { name: /Preview/i });
    fireEvent.click(previewBtn);

    await waitFor(() => {
      expect(screen.queryByTestId('html-preview-pane')).not.toBeNull();
    });

    // Click Snapshot to AI
    const snapshotBtn = screen.getByRole('button', { name: /Snapshot to AI/i });
    fireEvent.click(snapshotBtn);

    // Agent panel should open and display the attachment badge
    await waitFor(() => {
      expect(screen.getByTestId('agent-attachment-badge')).toBeDefined();
    });

    expect(screen.getByTestId('agent-attachment-text').textContent).toContain('navbar.html');
    expect(screen.getByTestId('agent-attachment-thumbnail')).toBeDefined();

    // Remove attachment button
    const removeBtn = screen.getByRole('button', { name: /Remove attachment/i });
    fireEvent.click(removeBtn);
    expect(screen.queryByTestId('agent-attachment-badge')).toBeNull();
  });

  it('renders AgentPanel with code snippet chip and allows removing it', async () => {
    useEditorStore.setState({
      activeFilePath: 'src/auth.ts',
      openFiles: ['src/auth.ts'],
    });

    render(<AppLayout initialAgentOpen={true} />);

    // AgentPanel is open
    expect(screen.getByTestId('agent-panel')).toBeDefined();

    // Verify initial state has no snippet chip
    expect(screen.queryByTestId('agent-snippet-badge')).toBeNull();
  });

  it('opens QuickOpenModal when clicking search files button in TopBar', () => {
    render(<AppLayout />);

    expect(screen.queryByTestId('quick-open-modal')).toBeNull();

    const searchBtn = screen.getByRole('button', { name: /Search files/i });
    fireEvent.click(searchBtn);

    expect(screen.getByTestId('quick-open-modal')).toBeDefined();
    expect(screen.getByTestId('quick-open-input')).toBeDefined();
  });

  it('opens QuickOpenModal and calls preventDefault when pressing Ctrl+P globally', () => {
    render(<AppLayout />);

    expect(screen.queryByTestId('quick-open-modal')).toBeNull();

    const notPrevented = fireEvent.keyDown(window, {
      key: 'p',
      ctrlKey: true,
    });

    expect(notPrevented).toBe(false);
    expect(screen.getByTestId('quick-open-modal')).toBeDefined();
  });

  it('opens QuickOpenModal when pressing Cmd+K globally', () => {
    render(<AppLayout />);

    expect(screen.queryByTestId('quick-open-modal')).toBeNull();

    fireEvent.keyDown(window, {
      key: 'k',
      metaKey: true,
    });

    expect(screen.getByTestId('quick-open-modal')).toBeDefined();
  });

  it('opens AgentPanel and dispatches repair task when Fix with AI is clicked in ProblemsView', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch').mockImplementation((url: any) => {
      return Promise.resolve(
        new Response(
          JSON.stringify({
            ok: true,
            provider: 'Gemini',
            model: 'gemini-3.5-flash-lite',
          })
        )
      );
    });

    useDiagnosticsStore.getState().setDiagnostics([
      {
        id: 'src/App.tsx:14:5:2304:Cannot find name foo',
        filePath: 'src/App.tsx',
        message: "Cannot find name 'foo'. Did you mean 'for'?",
        severity: 'error',
        startLineNumber: 14,
        startColumn: 5,
        endLineNumber: 14,
        endColumn: 8,
        code: 'ts(2304)',
      },
    ]);

    render(<AppLayout initialAgentOpen={false} initialTerminalOpen={true} />);

    // AgentPanel is initially closed
    expect(screen.queryByTestId('agent-panel')).toBeNull();

    // Switch to problems tab
    fireEvent.click(screen.getByTestId('terminal-tab-problems'));
    expect(screen.getByTestId('problems-view')).toBeDefined();

    // Click Fix with AI
    const fixBtn = screen.getByTestId('fix-ai-btn-src/App.tsx:14:5:2304:Cannot find name foo');
    fireEvent.click(fixBtn);

    // AgentPanel should now be open
    await waitFor(() => {
      expect(screen.getByTestId('agent-panel')).toBeDefined();
    });

    // Agent execution should be dispatched via POST /api/v1/agent/run with formatted prompt & snippet
    await waitFor(() => {
      const runCall = fetchSpy.mock.calls.find((call) =>
        String(call[0]).includes('/api/v1/agent/run')
      );
      expect(runCall).toBeDefined();
      if (runCall) {
        const body = JSON.parse(runCall[1]?.body as string);
        expect(body.prompt).toContain("Fix the following TypeScript compiler error in `src/App.tsx` at line 14:");
        expect(body.prompt).toContain("Cannot find name 'foo'. Did you mean 'for'? (ts:2304)");
        expect(body.snippet).toEqual({
          filePath: 'src/App.tsx',
          startLine: 14,
          endLine: 14,
          code: '',
        });
      }
    });

    fetchSpy.mockRestore();
  });

  it('spawns a dedicated terminal tab on Run when active tab is busy and routes stdin per tab', async () => {
    const encoder = new TextEncoder();
    let secondStreamController: ReadableStreamDefaultController<Uint8Array> | null = null;

    const fetchSpy = vi.spyOn(global, 'fetch').mockImplementation((url: any, init?: RequestInit) => {
      const urlStr = String(url);
      if (urlStr.endsWith('/api/v1/exec')) {
        const body = JSON.parse(String(init?.body || '{}'));
        if (body.cmd === 'node') {
          const stream = new ReadableStream<Uint8Array>({
            start(controller) {
              secondStreamController = controller;
              controller.enqueue(
                encoder.encode(
                  JSON.stringify({
                    stream: 'system',
                    executionId: 'exec-node-2',
                    chunk: 'started node\n',
                  }) + '\n'
                )
              );
            },
          });
          return Promise.resolve(new Response(stream, { status: 200 }));
        }
      }
      return Promise.resolve(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    });

    // Simulate Tab 1 running a long-lived dev server
    const abort1 = new AbortController();
    useTerminalStore.getState().setSessionTitle('default', 'npm run dev');
    useTerminalStore.getState().setSessionRunning('default', true, 'exec-dev-1', abort1);
    useTerminalStore.getState().appendLine('default', { stream: 'stdout', chunk: 'VITE ready' });

    useEditorStore.setState({
      activeFilePath: 'script.js',
      openFiles: ['script.js'],
      saveActiveFile: async () => {},
    });

    render(<AppLayout initialTerminalOpen={true} />);

    // Click Run in TopBar -> should create a dedicated tab instead of clobbering Tab 1
    fireEvent.click(screen.getByRole('button', { name: /Run Project/i }));

    await waitFor(() => {
      expect(useTerminalStore.getState().sessions).toHaveLength(2);
      const active = useTerminalStore
        .getState()
        .sessions.find((s) => s.id === useTerminalStore.getState().activeSessionId);
      expect(active?.executionId).toBe('exec-node-2');
    });

    // Tab 1 is still running untouched
    expect(useTerminalStore.getState().sessions[0].isRunning).toBe(true);
    expect(useTerminalStore.getState().sessions[0].executionId).toBe('exec-dev-1');

    // Submit stdin in active Tab 2 -> must hit /api/v1/exec/exec-node-2/stdin
    const stdinInput = screen.getByTestId('terminal-stdin-input') as HTMLInputElement;
    fireEvent.change(stdinInput, { target: { value: 'test-input' } });
    fireEvent.submit(stdinInput.closest('form')!);

    await waitFor(() => {
      const stdinCall = fetchSpy.mock.calls.find((c) =>
        String(c[0]).includes('/api/v1/exec/exec-node-2/stdin')
      );
      expect(stdinCall).toBeDefined();
    });

    // Cleanly close stream
    (secondStreamController as ReadableStreamDefaultController<Uint8Array> | null)?.enqueue(
      encoder.encode(JSON.stringify({ stream: 'exit', exitCode: 0 }) + '\n')
    );
    (secondStreamController as ReadableStreamDefaultController<Uint8Array> | null)?.close();
    fetchSpy.mockRestore();
  });
});
