import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { TopBar } from './TopBar.js';
import { Sidebar } from './Sidebar.js';
import { EditorPane, type CodeActionTriggerPayload } from './EditorPane.js';
import { AgentPanel, type VisualAttachment, type CodeSnippetAttachment } from '../../features/agent/AgentPanel.js';
import { TerminalPane } from './TerminalPane.js';
import { clampSize } from './ResizeHandle.js';
import { useTerminalStore, type TerminalLine } from '../../features/terminal/useTerminalStore.js';
import { HtmlPreview } from '../../features/preview/HtmlPreview.js';
import { useEditorStore } from '../../features/editor/useEditorStore.js';
import { useFiles, flattenFileTree } from '../../features/editor/useFiles.js';
import { DiffReviewModal, type DiffData } from '../../features/changeset/DiffReviewModal.js';
import { QuickOpenModal } from '../../features/editor/QuickOpenModal.js';
import { useOptionalNotification } from '../../context/NotificationContext.js';
import type { DiagnosticItem } from '../../features/editor/useDiagnosticsStore.js';
import { RUNTIME_URL, fetchRuntime } from '../../lib/runtimeConfig.js';
import * as monaco from 'monaco-editor';

const DEFAULT_SIDEBAR_WIDTH = 260;
const SIDEBAR_MIN_WIDTH = 180;
const SIDEBAR_MAX_WIDTH = 480;

const DEFAULT_AGENT_WIDTH = 320;
const AGENT_MIN_WIDTH = 260;
const AGENT_MAX_WIDTH = 520;

const DEFAULT_TERMINAL_HEIGHT = 220;
const TERMINAL_MIN_HEIGHT = 140;
const TERMINAL_MAX_HEIGHT = 520;

const TOPBAR_HEIGHT = 48;
const MIN_WORKSPACE_BODY_HEIGHT = 160;
const MIN_EDITOR_WIDTH = 220;

interface AppLayoutProps {
  workspaceId?: string | null;
  initialSidebarOpen?: boolean;
  initialTerminalOpen?: boolean;
  initialAgentOpen?: boolean;
  onBackToDashboard?: () => void;
}

export const AppLayout: React.FC<AppLayoutProps> = ({
  workspaceId,
  initialSidebarOpen = true,
  initialTerminalOpen = true,
  initialAgentOpen = true,
  onBackToDashboard,
}) => {
  const [isSidebarOpen, setIsSidebarOpen] = useState(initialSidebarOpen);
  const [isTerminalOpen, setIsTerminalOpen] = useState(initialTerminalOpen);
  const [isAgentOpen, setIsAgentOpen] = useState(initialAgentOpen);

  const [sidebarWidth, setSidebarWidth] = useState(DEFAULT_SIDEBAR_WIDTH);
  const [terminalHeight, setTerminalHeight] = useState(DEFAULT_TERMINAL_HEIGHT);
  const [agentWidth, setAgentWidth] = useState(DEFAULT_AGENT_WIDTH);

  const layoutRef = useRef<HTMLDivElement>(null);
  const [viewportSize, setViewportSize] = useState<{ width: number; height: number }>(() => ({
    width: typeof window !== 'undefined' && window.innerWidth > 0 ? window.innerWidth : 1280,
    height: typeof window !== 'undefined' && window.innerHeight > 0 ? window.innerHeight : 800,
  }));

  useEffect(() => {
    const updateSize = () => {
      const el = layoutRef.current;
      const width =
        el && el.clientWidth > 0
          ? el.clientWidth
          : window.innerWidth > 0
            ? window.innerWidth
            : 1280;
      const height =
        el && el.clientHeight > 0
          ? el.clientHeight
          : window.innerHeight > 0
            ? window.innerHeight
            : 800;
      setViewportSize((prev) =>
        prev.width === width && prev.height === height ? prev : { width, height }
      );
    };

    updateSize();
    window.addEventListener('resize', updateSize);

    let observer: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined' && layoutRef.current) {
      observer = new ResizeObserver(updateSize);
      observer.observe(layoutRef.current);
    }

    return () => {
      window.removeEventListener('resize', updateSize);
      observer?.disconnect();
    };
  }, []);

  const { activeFilePath, openFiles, openFile, saveActiveFile } = useEditorStore();
  const { fileTree, fetchTree, saveFileContent, getFileContent } = useFiles(workspaceId);
  const flattenedFiles = useMemo(() => flattenFileTree(fileTree), [fileTree]);

  useEffect(() => {
    fetchTree();
  }, [fetchTree]);
  const notificationContext = useOptionalNotification();
  const [activeDiff, setActiveDiff] = useState<DiffData | null>(null);
  const [isQuickOpen, setIsQuickOpen] = useState(false);

  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [previewContent, setPreviewContent] = useState('');
  const [attachedSnapshot, setAttachedSnapshot] = useState<VisualAttachment | null>(null);
  const [attachedSnippet, setAttachedSnippet] = useState<CodeSnippetAttachment | null>(null);
  const [agentInitialPrompt, setAgentInitialPrompt] = useState<string | undefined>(undefined);
  const [agentAutoExecute, setAgentAutoExecute] = useState(false);

  /**
   * Stream output from POST /api/v1/exec on the local runtime daemon.
   * The daemon returns NDJSON: one JSON object per line.
   * Assigns execution to the active idle session or creates a dedicated tab if busy.
   */
  const runCommand = useCallback(
    async (
      cmd: string,
      args: string[],
      label: string,
      type: 'terminal' | 'tests' = 'terminal',
      targetSessionIdOverride?: string
    ): Promise<number | null> => {
      const store = useTerminalStore.getState();
      let targetSessionId = targetSessionIdOverride;

      if (!targetSessionId || !store.sessions.some((s) => s.id === targetSessionId)) {
        const activeSession =
          store.sessions.find((s) => s.id === store.activeSessionId) ?? store.sessions[0];
        if (activeSession && !activeSession.isRunning) {
          targetSessionId = activeSession.id;
          store.clearSession(targetSessionId);
          store.setSessionTitle(targetSessionId, label);
          store.setSessionRunType(targetSessionId, type);
        } else {
          targetSessionId = store.createSession(label);
          store.setSessionRunType(targetSessionId, type);
        }
      } else {
        store.clearSession(targetSessionId);
        store.setSessionTitle(targetSessionId, label);
        store.setSessionRunType(targetSessionId, type);
      }

      const abortController = new AbortController();

      // Open terminal drawer and mark session as running
      setIsTerminalOpen(true);
      store.setSessionRunning(targetSessionId, true, null, abortController);
      store.appendLine(targetSessionId, { stream: 'system', chunk: `$ ${[cmd, ...args].join(' ')}\n` });

      try {
        const res = await fetchRuntime(
          '/api/v1/exec',
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ cmd, args, cwd: '.' }),
            signal: abortController.signal,
          },
          workspaceId || undefined
        );

        if (!res.ok || !res.body) {
          const text = await res.text().catch(() => res.statusText);
          useTerminalStore.getState().appendLine(targetSessionId, {
            stream: 'system',
            chunk: `[Error] Runtime returned ${res.status}: ${text}\n`,
          });
          useTerminalStore.getState().setSessionRunning(targetSessionId, false, null, null);
          return -1;
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          // NDJSON: process complete lines
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';

          for (const line of lines) {
            if (!line.trim()) continue;
            try {
              const parsed = JSON.parse(line) as TerminalLine;
              if (parsed.executionId) {
                useTerminalStore
                  .getState()
                  .setSessionRunning(targetSessionId, true, parsed.executionId, abortController);
              }
              useTerminalStore.getState().appendLine(targetSessionId, parsed);
              if (parsed.stream === 'exit') {
                useTerminalStore.getState().setSessionRunning(targetSessionId, false, null, null);
                return parsed.exitCode ?? 0;
              }
            } catch {
              // non-JSON chunk — display as-is
              useTerminalStore.getState().appendLine(targetSessionId, {
                stream: 'stdout',
                chunk: line + '\n',
              });
            }
          }
        }
      } catch (err: any) {
        if (err?.name === 'AbortError' || abortController.signal.aborted) {
          useTerminalStore.getState().setSessionRunning(targetSessionId, false, null, null);
          return null;
        }
        useTerminalStore.getState().appendLine(targetSessionId, {
          stream: 'system',
          chunk: `[Error] Could not reach local runtime daemon at ${RUNTIME_URL}.\nMake sure "pnpm --filter runtime dev" is running.\nDetails: ${err.message}\n`,
        });
        useTerminalStore.getState().setSessionRunning(targetSessionId, false, null, null);
        return -1;
      }

      // If we exit loop without returning
      useTerminalStore.getState().setSessionRunning(targetSessionId, false, null, null);
      return 0;
    },
    [workspaceId]
  );

  const handleSendInput = useCallback(
    async (input: string, sessionId?: string) => {
      const { sessions, activeSessionId, appendLine } = useTerminalStore.getState();
      const targetId = sessionId ?? activeSessionId;
      const session = sessions.find((s) => s.id === targetId);
      if (!session?.executionId) return;

      try {
        await fetchRuntime(
          `/api/v1/exec/${session.executionId}/stdin`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ input }),
          },
          workspaceId || undefined
        );
        // Echo the input in the target terminal session output
        appendLine(targetId, { stream: 'stdout', chunk: input + '\n' });
      } catch (err) {
        console.error('Failed to send input', err);
      }
    },
    [workspaceId]
  );

  const handleRefreshPreview = useCallback(async () => {
    if (!activeFilePath) return;
    const { getActiveContent } = useEditorStore.getState();
    const current = getActiveContent?.();
    if (current !== undefined && current !== '') {
      setPreviewContent(current);
      return;
    }
    try {
      const content = await getFileContent(activeFilePath);
      setPreviewContent(content);
    } catch (err) {
      console.error('Failed to reload preview content:', err);
    }
  }, [activeFilePath, getFileContent]);

  const handleCaptureSnapshot = useCallback((snapshot: { base64: string; filePath: string }) => {
    setAttachedSnapshot({
      base64: snapshot.base64,
      filePath: snapshot.filePath,
      mimeType: 'image/png',
    });
    setIsAgentOpen(true);
  }, []);

  const handleTogglePreview = useCallback(async () => {
    if (!isPreviewOpen && activeFilePath) {
      const { getActiveContent } = useEditorStore.getState();
      let content = getActiveContent?.() ?? '';
      if (!content) {
        try {
          content = await getFileContent(activeFilePath);
        } catch {
          content = '';
        }
      }
      setPreviewContent(content);
    }
    setIsPreviewOpen((prev) => !prev);
  }, [isPreviewOpen, activeFilePath, getFileContent]);

  const handleRunProject = useCallback(async () => {
    // Auto-save the active file before running so we execute the latest code
    if (saveActiveFile) {
      await saveActiveFile();
    }

    if (activeFilePath) {
      if (activeFilePath.endsWith('.html') || activeFilePath.endsWith('.htm')) {
        const { getActiveContent } = useEditorStore.getState();
        let content = getActiveContent?.() ?? '';
        if (!content) {
          try {
            content = await getFileContent(activeFilePath);
          } catch {
            content = '';
          }
        }
        setPreviewContent(content);
        setIsPreviewOpen((prev) => !prev);
        return;
      }
      const fileLabel = activeFilePath.split('/').pop() || activeFilePath;
      if (activeFilePath.endsWith('.ts') || activeFilePath.endsWith('.tsx')) {
        runCommand('npx', ['tsx', activeFilePath], `Run: ${fileLabel}`);
      } else if (activeFilePath.endsWith('.js') || activeFilePath.endsWith('.jsx')) {
        runCommand('node', [activeFilePath], `Run: ${fileLabel}`);
      } else if (activeFilePath.endsWith('.py')) {
        runCommand('python', [activeFilePath], `Run: ${fileLabel}`);
      } else if (activeFilePath.endsWith('.sh')) {
        runCommand('bash', [activeFilePath], `Run: ${fileLabel}`);
      } else if (activeFilePath.endsWith('.go')) {
        runCommand('go', ['run', activeFilePath], `Run: ${fileLabel}`);
      } else if (activeFilePath.endsWith('.rs')) {
        runCommand('cargo', ['run'], 'cargo run');
      } else if (activeFilePath.endsWith('.c')) {
        const exitCode = await runCommand('gcc', [activeFilePath, '-o', 'main.exe'], `Run: ${fileLabel}`);
        if (exitCode === 0) {
          const exeName = navigator.userAgent.includes('Windows') ? 'main.exe' : './main.exe';
          const sessionId = useTerminalStore.getState().activeSessionId;
          runCommand(exeName, [], `Run: ${fileLabel}`, 'terminal', sessionId);
        }
      } else if (activeFilePath.endsWith('.cpp')) {
        const exitCode = await runCommand('g++', [activeFilePath, '-o', 'main.exe'], `Run: ${fileLabel}`);
        if (exitCode === 0) {
          const exeName = navigator.userAgent.includes('Windows') ? 'main.exe' : './main.exe';
          const sessionId = useTerminalStore.getState().activeSessionId;
          runCommand(exeName, [], `Run: ${fileLabel}`, 'terminal', sessionId);
        }
      } else {
        runCommand('npm', ['run', 'dev'], 'npm run dev');
      }
    } else {
      runCommand('npm', ['run', 'dev'], 'npm run dev');
    }
  }, [runCommand, activeFilePath, saveActiveFile, getFileContent]);

  const handleRunTests = useCallback(() => {
    runCommand('npm', ['test'], 'npm test', 'tests');
  }, [runCommand]);

  // Wire Monaco Inline Action trigger to Agent Panel
  const handleTriggerCodeAction = useCallback(
    ({ snippet, prompt, actionType }: CodeActionTriggerPayload) => {
      setIsAgentOpen(true);
      setAttachedSnippet(snippet);
      setAgentInitialPrompt(prompt);
      setAgentAutoExecute(true);
    },
    []
  );

  // Navigate to file and focus Monaco on error line/column
  const handleNavigateToFile = useCallback(
    (filePath: string, line: number, column: number) => {
      useEditorStore.getState().navigateToPosition(filePath, line, column);
    },
    []
  );

  // 1-Click Fix with AI: formats prompt, attaches snippet context, and dispatches to autonomous agent
  const handleFixWithAI = useCallback(
    async (diagnostic: DiagnosticItem) => {
      setIsAgentOpen(true);

      let codeStr = '';
      if (diagnostic.code) {
        const cleanCode = diagnostic.code.replace(/^ts[:(]?/, '').replace(/\)$/, '');
        codeStr = ` (ts:${cleanCode})`;
      }

      const promptText = `Fix the following TypeScript compiler error in \`${diagnostic.filePath}\` at line ${diagnostic.startLineNumber}:\nError: ${diagnostic.message}${codeStr}`;

      // Extract code snippet around the error
      let snippetCode = '';
      try {
        const { activeFilePath, getActiveContent } = useEditorStore.getState();
        let content = '';
        if (activeFilePath === diagnostic.filePath && getActiveContent) {
          content = getActiveContent() || '';
        }
        if (!content && getFileContent) {
          content = await getFileContent(diagnostic.filePath);
        }
        if (content) {
          const lines = content.split('\n');
          const start = Math.max(0, diagnostic.startLineNumber - 1);
          const end = Math.min(lines.length, Math.max(start + 1, diagnostic.endLineNumber));
          snippetCode = lines.slice(start, end).join('\n');
        }
      } catch {
        // Fallback gracefully without snippet
      }

      const snippet: CodeSnippetAttachment = {
        filePath: diagnostic.filePath,
        startLine: diagnostic.startLineNumber,
        endLine: diagnostic.endLineNumber,
        code: snippetCode,
      };

      setAttachedSnippet(snippet);
      setAgentInitialPrompt(promptText);
      setAgentAutoExecute(true);
    },
    [getFileContent]
  );

  // 1-Click Fix for runtime errors streamed in the TerminalPane
  const handleFixTerminalError = useCallback(
    (errorOutput: string) => {
      setIsAgentOpen(true);
      const promptText = `Fix the following runtime error from the terminal execution:\n\`\`\`\n${errorOutput.trim()}\n\`\`\``;

      const { activeFilePath, getActiveContent } = useEditorStore.getState();
      let snippet: CodeSnippetAttachment | null = null;
      if (activeFilePath && getActiveContent) {
        const content = getActiveContent() || '';
        snippet = {
          filePath: activeFilePath,
          startLine: 1,
          endLine: Math.max(1, content.split('\n').length),
          code: content,
        };
      }

      setAttachedSnippet(snippet);
      setAgentInitialPrompt(promptText);
      setAgentAutoExecute(true);
    },
    []
  );

  // Global shortcut: Ctrl+P / Cmd+P or Cmd+K opens Quick Open; Ctrl+Shift+` opens a new terminal session
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      const isP = (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'p';
      const isCmdK = e.metaKey && e.key.toLowerCase() === 'k';
      if (isP || isCmdK) {
        e.preventDefault();
        e.stopPropagation();
        setIsQuickOpen((prev) => !prev);
      }
      const isNewTerminal = e.ctrlKey && e.shiftKey && (e.key === '`' || e.code === 'Backquote');
      if (isNewTerminal) {
        e.preventDefault();
        e.stopPropagation();
        setIsTerminalOpen(true);
        useTerminalStore.getState().createSession();
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown, true);
    return () => {
      window.removeEventListener('keydown', handleGlobalKeyDown, true);
    };
  }, []);

  const minEditorWidth =
    viewportSize.width >= 600
      ? MIN_EDITOR_WIDTH
      : Math.max(120, Math.floor(viewportSize.width * 0.35));
  const availableSideWidth = Math.max(0, viewportSize.width - minEditorWidth);

  const sidebarMinBound = Math.min(SIDEBAR_MIN_WIDTH, Math.max(100, Math.floor(availableSideWidth * 0.4)));
  const agentMinBound = Math.min(AGENT_MIN_WIDTH, Math.max(140, Math.floor(availableSideWidth * 0.5)));

  let effectiveSidebarWidth = isSidebarOpen
    ? clampSize(sidebarWidth, sidebarMinBound, SIDEBAR_MAX_WIDTH)
    : 0;
  let effectiveAgentWidth = isAgentOpen
    ? clampSize(agentWidth, agentMinBound, AGENT_MAX_WIDTH)
    : 0;

  if (isSidebarOpen && isAgentOpen && effectiveSidebarWidth + effectiveAgentWidth > availableSideWidth) {
    const totalRequested = effectiveSidebarWidth + effectiveAgentWidth;
    const ratio = availableSideWidth / Math.max(1, totalRequested);
    effectiveSidebarWidth = Math.max(
      Math.min(sidebarMinBound, Math.floor(availableSideWidth * 0.45)),
      Math.floor(effectiveSidebarWidth * ratio)
    );
    effectiveAgentWidth = Math.max(0, availableSideWidth - effectiveSidebarWidth);
  } else if (isSidebarOpen && effectiveSidebarWidth > availableSideWidth) {
    effectiveSidebarWidth = Math.max(0, availableSideWidth);
  } else if (isAgentOpen && effectiveAgentWidth > availableSideWidth) {
    effectiveAgentWidth = Math.max(0, availableSideWidth);
  }

  const sidebarMaxBound = Math.max(
    sidebarMinBound,
    Math.min(SIDEBAR_MAX_WIDTH, availableSideWidth - (isAgentOpen ? effectiveAgentWidth : 0))
  );
  const agentMaxBound = Math.max(
    agentMinBound,
    Math.min(AGENT_MAX_WIDTH, availableSideWidth - (isSidebarOpen ? effectiveSidebarWidth : 0))
  );

  const availableBodyHeight = Math.max(200, viewportSize.height - TOPBAR_HEIGHT);
  const terminalMaxBound = Math.max(
    100,
    Math.min(TERMINAL_MAX_HEIGHT, availableBodyHeight - MIN_WORKSPACE_BODY_HEIGHT)
  );
  const terminalMinBound = Math.min(TERMINAL_MIN_HEIGHT, terminalMaxBound);
  const effectiveTerminalHeight = clampSize(terminalHeight, terminalMinBound, terminalMaxBound);

  return (
    <div
      ref={layoutRef}
      data-testid="app-layout"
      style={{
        width: '100vw',
        height: '100vh',
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: 'var(--bg-app)',
        color: 'var(--text-primary)',
        overflow: 'hidden',
      }}
    >
      {/* Top Header Toolbar */}
      <TopBar
        isSidebarOpen={isSidebarOpen}
        onToggleSidebar={() => setIsSidebarOpen((prev) => !prev)}
        isTerminalOpen={isTerminalOpen}
        onToggleTerminal={() => setIsTerminalOpen((prev) => !prev)}
        isAgentOpen={isAgentOpen}
        onToggleAgent={() => setIsAgentOpen((prev) => !prev)}
        isPreviewOpen={isPreviewOpen}
        onTogglePreview={handleTogglePreview}
        activeFilePath={activeFilePath}
        onBackToDashboard={onBackToDashboard}
        onRunProject={handleRunProject}
        onRunTests={handleRunTests}
        onOpenQuickOpen={() => setIsQuickOpen(true)}
      />

      {/* Main Content Area (Sidebar + Editor + Preview + Agent Panel) */}
      <div
        data-testid="workspace-main-row"
        style={{
          flex: 1,
          minHeight: 0,
          minWidth: 0,
          display: 'flex',
          flexDirection: 'row',
          overflow: 'hidden',
          position: 'relative',
        }}
      >
        {/* Left Explorer Sidebar */}
        <Sidebar
          isOpen={isSidebarOpen}
          workspaceId={workspaceId}
          width={effectiveSidebarWidth}
          minWidth={sidebarMinBound}
          maxWidth={sidebarMaxBound}
          onResize={setSidebarWidth}
          onResetWidth={() => setSidebarWidth(DEFAULT_SIDEBAR_WIDTH)}
        />

        {/* Central Editor Surface */}
        <EditorPane
          workspaceId={workspaceId}
          onTriggerCodeAction={handleTriggerCodeAction}
        />

        {/* HTML Live Preview Pane */}
        {isPreviewOpen && (
          <HtmlPreview
            filePath={activeFilePath}
            content={previewContent}
            getContent={async () => {
              const { getActiveContent } = useEditorStore.getState();
              const current = getActiveContent?.();
              if (current !== undefined && current !== '') return current;
              if (activeFilePath) {
                try {
                  return await getFileContent(activeFilePath);
                } catch {
                  return '';
                }
              }
              return '';
            }}
            onRefresh={handleRefreshPreview}
            onCaptureSnapshot={handleCaptureSnapshot}
            onClose={() => setIsPreviewOpen(false)}
          />
        )}

        {/* Right AI Agent Drawer */}
        <AgentPanel
          isOpen={isAgentOpen}
          workspaceId={workspaceId}
          onClose={() => setIsAgentOpen(false)}
          onReviewDiff={(diff) => setActiveDiff(diff)}
          attachedImage={attachedSnapshot}
          onClearAttachment={() => setAttachedSnapshot(null)}
          attachedSnippet={attachedSnippet}
          onClearSnippet={() => setAttachedSnippet(null)}
          initialPrompt={agentInitialPrompt}
          autoExecute={agentAutoExecute}
          width={effectiveAgentWidth}
          minWidth={agentMinBound}
          maxWidth={agentMaxBound}
          onResize={setAgentWidth}
          onResetWidth={() => setAgentWidth(DEFAULT_AGENT_WIDTH)}
        />
      </div>

      {/* AI Agent Diff Review Modal */}
      {activeDiff && (
        <DiffReviewModal
          diffData={activeDiff}
          runtimeUrl={RUNTIME_URL}
          onClose={() => setActiveDiff(null)}
          onAccept={async () => {
            try {
              // 1. Save modified content to disk on local runtime daemon
              await saveFileContent(activeDiff.filePath, activeDiff.modifiedContent);

              // 2. Synchronize Monaco text models in memory so editor displays updated code immediately
              try {
                const target = activeDiff.filePath.replace(/^\//, '');
                const models = monaco.editor.getModels();
                for (const m of models) {
                  // Ignore temporary in-memory diff editor models
                  if (m.uri.scheme === 'inmemory') continue;
                  const p = m.uri.path.replace(/^\//, '');
                  if (p === target || p.endsWith('/' + target) || target.endsWith('/' + p)) {
                    m.setValue(activeDiff.modifiedContent);
                  }
                }
              } catch (e) {
                console.error('Failed to update in-memory Monaco model:', e);
              }

              // 3. Update currently active editor instance if open
              const { updateActiveContent, activeFilePath: currentActive } = useEditorStore.getState();
              if (updateActiveContent) {
                const target = activeDiff.filePath.replace(/^\//, '');
                const active = (currentActive || '').replace(/^\//, '');
                if (active === target || active.endsWith('/' + target) || target.endsWith('/' + active)) {
                  updateActiveContent(activeDiff.modifiedContent);
                }
              }

              // 4. Ensure file tab is open & active
              openFile(activeDiff.filePath);

              notificationContext?.showNotification(
                `Accepted and saved changes to ${activeDiff.filePath}`,
                'success'
              );
            } catch (err: any) {
              notificationContext?.showNotification(
                `Failed to save ${activeDiff.filePath}: ${err?.message || String(err)}`,
                'error'
              );
            }
            setActiveDiff(null);
          }}
          onReject={() => {
            notificationContext?.showNotification(
              `Rejected changes to ${activeDiff.filePath}`,
              'info'
            );
            setActiveDiff(null);
          }}
        />
      )}

      {/* Quick Open File Fuzzy Finder Modal */}
      <QuickOpenModal
        isOpen={isQuickOpen}
        onClose={() => setIsQuickOpen(false)}
        files={flattenedFiles}
        workspaceId={workspaceId}
      />

      {/* Bottom Terminal Drawer */}
      <TerminalPane
        isOpen={isTerminalOpen}
        onClose={() => setIsTerminalOpen(false)}
        onSendInput={handleSendInput}
        onNavigateToFile={handleNavigateToFile}
        onFixWithAI={handleFixWithAI}
        onFixTerminalError={handleFixTerminalError}
        height={effectiveTerminalHeight}
        minHeight={terminalMinBound}
        maxHeight={terminalMaxBound}
        onResize={setTerminalHeight}
        onResetHeight={() => setTerminalHeight(DEFAULT_TERMINAL_HEIGHT)}
      />
    </div>
  );
};

export default AppLayout;
