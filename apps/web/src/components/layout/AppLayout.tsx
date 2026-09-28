import React, { useState, useCallback } from 'react';
import { TopBar } from './TopBar.js';
import { Sidebar } from './Sidebar.js';
import { EditorPane } from './EditorPane.js';
import { AgentPanel } from '../../features/agent/AgentPanel.js';
import { TerminalPane, type TerminalLine } from './TerminalPane.js';
import { useEditorStore } from '../../features/editor/useEditorStore.js';

const RUNTIME_URL = 'http://127.0.0.1:7890';

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

  const { activeFilePath, saveActiveFile } = useEditorStore();

  const [outputLines, setOutputLines] = useState<TerminalLine[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [executionId, setExecutionId] = useState<string | null>(null);

  /**
   * Stream output from POST /api/v1/exec on the local runtime daemon.
   * The daemon returns NDJSON: one JSON object per line.
   */
  const runCommand = useCallback(
    (cmd: string, args: string[], label: string): Promise<number | null> => {
      return new Promise(async (resolve) => {
        if (isRunning) return resolve(null);

        // Open terminal drawer and clear previous output
        setIsTerminalOpen(true);
        setOutputLines([{ stream: 'system', chunk: `$ ${[cmd, ...args].join(' ')}\n` }]);
        setIsRunning(true);
        setExecutionId(null);

        try {
          const headers: Record<string, string> = { 'Content-Type': 'application/json' };
          if (workspaceId) headers['X-Workspace-Id'] = workspaceId;

          const res = await fetch(`${RUNTIME_URL}/api/v1/exec`, {
            method: 'POST',
            headers,
            body: JSON.stringify({ cmd, args, cwd: '.' }),
          });

          if (!res.ok || !res.body) {
            const text = await res.text().catch(() => res.statusText);
            setOutputLines((prev) => [
              ...prev,
              { stream: 'system', chunk: `[Error] Runtime returned ${res.status}: ${text}\n` },
            ]);
            setIsRunning(false);
            return resolve(-1);
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
                setExecutionId(parsed.executionId);
              }
              setOutputLines((prev) => [...prev, parsed]);
              if (parsed.stream === 'exit') {
                setIsRunning(false);
                setExecutionId(null);
                return resolve(parsed.exitCode ?? 0);
              }
            } catch {
              // non-JSON chunk — display as-is
              setOutputLines((prev) => [...prev, { stream: 'stdout', chunk: line + '\n' }]);
            }
          }
        }
      } catch (err: any) {
        setOutputLines((prev) => [
          ...prev,
          {
            stream: 'system',
            chunk: `[Error] Could not reach local runtime daemon at ${RUNTIME_URL}.\nMake sure "pnpm --filter runtime dev" is running.\nDetails: ${err.message}\n`,
          },
        ]);
        setIsRunning(false);
        return resolve(-1);
      }
      
      // If we exit loop without returning
      setIsRunning(false);
      setExecutionId(null);
      return resolve(0);
    });
  },
  [isRunning, workspaceId]
);

  const handleSendInput = useCallback(async (input: string) => {
    if (!executionId) return;
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (workspaceId) headers['X-Workspace-Id'] = workspaceId;

      await fetch(`${RUNTIME_URL}/api/v1/exec/${executionId}/stdin`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ input }),
      });
      // Optionally echo the input in the terminal output
      setOutputLines((prev) => [...prev, { stream: 'stdout', chunk: input + '\n' }]);
    } catch (err) {
      console.error('Failed to send input', err);
    }
  }, [executionId, workspaceId]);

  const handleRunProject = useCallback(async () => {
    // Auto-save the active file before running so we execute the latest code
    if (saveActiveFile) {
      await saveActiveFile();
    }

    if (activeFilePath) {
      if (activeFilePath.endsWith('.ts') || activeFilePath.endsWith('.tsx')) {
        runCommand('npx', ['tsx', activeFilePath], `Run ${activeFilePath}`);
      } else if (activeFilePath.endsWith('.js') || activeFilePath.endsWith('.jsx')) {
        runCommand('node', [activeFilePath], `Run ${activeFilePath}`);
      } else if (activeFilePath.endsWith('.py')) {
        runCommand('python', [activeFilePath], `Run ${activeFilePath}`);
      } else if (activeFilePath.endsWith('.sh')) {
        runCommand('bash', [activeFilePath], `Run ${activeFilePath}`);
      } else if (activeFilePath.endsWith('.go')) {
        runCommand('go', ['run', activeFilePath], `Run ${activeFilePath}`);
      } else if (activeFilePath.endsWith('.rs')) {
        runCommand('cargo', ['run'], `Run Cargo project`);
      } else if (activeFilePath.endsWith('.c')) {
        const exitCode = await runCommand('gcc', [activeFilePath, '-o', 'main.exe'], `Compile ${activeFilePath}`);
        if (exitCode === 0) {
          runCommand('./main.exe', [], `Run main.exe`);
        }
      } else if (activeFilePath.endsWith('.cpp')) {
        const exitCode = await runCommand('g++', [activeFilePath, '-o', 'main.exe'], `Compile ${activeFilePath}`);
        if (exitCode === 0) {
          runCommand('./main.exe', [], `Run main.exe`);
        }
      } else {
        runCommand('npm', ['run', 'dev'], 'Run Project');
      }
    } else {
      runCommand('npm', ['run', 'dev'], 'Run Project');
    }
  }, [runCommand, activeFilePath, saveActiveFile]);

  const handleRunTests = useCallback(() => {
    runCommand('npm', ['test'], 'Run Tests');
  }, [runCommand]);

  return (
    <div
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
        onBackToDashboard={onBackToDashboard}
        onRunProject={handleRunProject}
        onRunTests={handleRunTests}
      />

      {/* Main Content Area (Sidebar + Editor + Agent Panel) */}
      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'row',
          overflow: 'hidden',
          position: 'relative',
        }}
      >
        {/* Left Explorer Sidebar */}
        <Sidebar isOpen={isSidebarOpen} workspaceId={workspaceId} />

        {/* Central Editor Surface */}
        <EditorPane workspaceId={workspaceId} />

        {/* Right AI Agent Drawer */}
        <AgentPanel
          isOpen={isAgentOpen}
          onClose={() => setIsAgentOpen(false)}
        />
      </div>

      {/* Bottom Terminal Drawer */}
      <TerminalPane
        isOpen={isTerminalOpen}
        onClose={() => setIsTerminalOpen(false)}
        onClear={() => setOutputLines([])}
        outputLines={outputLines}
        isRunning={isRunning}
        onSendInput={handleSendInput}
      />
    </div>
  );
};

export default AppLayout;
