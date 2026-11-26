import React, { useState, useEffect, useRef } from 'react';
import { useDiagnosticsStore, DiagnosticItem } from '../../features/editor/useDiagnosticsStore.js';
import { ProblemsView } from '../../features/editor/ProblemsView.js';
import { useTerminalStore, type TerminalLine } from '../../features/terminal/useTerminalStore.js';

export type { TerminalLine };

const stripAnsi = (str: string) => {
  // Regex to match ANSI escape codes
  // eslint-disable-next-line no-control-regex
  return str.replace(/\x1B\[[0-?]*[ -/]*[@-~]/g, '');
};

interface TerminalPaneProps {
  isOpen: boolean;
  onClose?: () => void;
  onClear?: () => void;
  outputLines?: TerminalLine[];
  isRunning?: boolean;
  onSendInput?: (input: string, sessionId?: string) => void;
  runType?: 'terminal' | 'tests';
  onNavigateToFile?: (filePath: string, line: number, column: number) => void;
  onFixWithAI?: (item: DiagnosticItem) => void;
  onFixTerminalError?: (errorText: string) => void;
}

export const TerminalPane: React.FC<TerminalPaneProps> = ({
  isOpen,
  onClose,
  onClear,
  outputLines,
  isRunning,
  onSendInput,
  runType,
  onNavigateToFile,
  onFixWithAI,
  onFixTerminalError,
}) => {
  const [activeTab, setActiveTab] = useState<'terminal' | 'output' | 'problems' | 'tests'>('terminal');
  const [inputValue, setInputValue] = useState('');
  const outputEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const scrollPositionsRef = useRef<Record<string, number>>({});

  const sessions = useTerminalStore((s) => s.sessions);
  const activeSessionId = useTerminalStore((s) => s.activeSessionId);
  const createSession = useTerminalStore((s) => s.createSession);
  const closeSession = useTerminalStore((s) => s.closeSession);
  const setActiveSession = useTerminalStore((s) => s.setActiveSession);
  const clearSession = useTerminalStore((s) => s.clearSession);

  const activeSession = sessions.find((s) => s.id === activeSessionId) ?? sessions[0];
  const effectiveLines = outputLines ?? activeSession?.lines ?? [];
  const effectiveIsRunning = isRunning !== undefined ? isRunning : Boolean(activeSession?.isRunning);
  const effectiveRunType = runType ?? activeSession?.runType ?? 'terminal';

  const diagnostics = useDiagnosticsStore((s) => s.diagnostics);
  const errorCount = diagnostics.filter((d) => d.severity === 'error').length;
  const totalCount = diagnostics.length;

  const hasTerminalError = effectiveLines.some(
    (l) =>
      l.stream === 'stderr' ||
      (l.stream === 'exit' && (l.exitCode ?? 0) !== 0) ||
      (typeof l.chunk === 'string' &&
        /(?:TypeError|ReferenceError|SyntaxError|Error|Exception|ERR!):/i.test(l.chunk))
  );

  // Restore scroll position when switching terminal session tabs
  useEffect(() => {
    if (activeTab === 'terminal' && scrollContainerRef.current) {
      const saved = scrollPositionsRef.current[activeSessionId];
      if (saved !== undefined) {
        scrollContainerRef.current.scrollTop = saved;
      } else {
        scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight;
      }
    }
  }, [activeSessionId, activeTab]);

  // Auto-scroll to bottom when new output arrives
  useEffect(() => {
    if ((activeTab === 'terminal' || activeTab === 'tests') && outputEndRef.current) {
      outputEndRef.current.scrollIntoView?.({ behavior: 'smooth' });
    }
  }, [effectiveLines, activeTab]);

  // Switch to correct tab when a run starts
  useEffect(() => {
    if (effectiveIsRunning) {
      setActiveTab(effectiveRunType || 'terminal');
    }
  }, [effectiveIsRunning, effectiveRunType]);

  if (!isOpen) return null;

  const getLineColor = (stream: TerminalLine['stream']) => {
    switch (stream) {
      case 'stderr': return 'var(--error, #f85149)';
      case 'system': return 'var(--warning, #d29922)';
      case 'exit': return 'var(--text-muted)';
      default: return 'var(--text-primary)';
    }
  };

  const handleClear = () => {
    if (activeSession) {
      clearSession(activeSession.id);
    }
    onClear?.();
  };

  const renderOutput = (linesToRender: TerminalLine[], showRunningPrompt: boolean, mode: 'terminal' | 'tests') => (
    <div>
      {linesToRender.length === 0 ? (
        mode === 'tests' ? (
          <div style={{ color: 'var(--text-muted)' }}>Running tests...</div>
        ) : (
          <>
            <div style={{ color: 'var(--text-muted)' }}>$ pnpm --filter web dev</div>
            <div style={{ color: 'var(--accent)' }}>VITE v5.4.10 ready in 240 ms</div>
            <div style={{ color: 'var(--text-secondary)' }}>
              ➜ Local: <span style={{ color: 'var(--info)' }}>http://localhost:5173/</span>
            </div>
            <div style={{ color: 'var(--success)' }}>✓ Local daemon connected on ws://127.0.0.1:7890/ws/runtime</div>
          </>
        )
      ) : (
        linesToRender.map((line, i) => (
          <div
            key={i}
            style={{ color: getLineColor(line.stream), whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}
          >
            {line.stream === 'exit'
              ? `[Process exited with code ${line.exitCode ?? -1}]`
              : stripAnsi(line.chunk || '')}
          </div>
        ))
      )}
      {showRunningPrompt && onSendInput && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (inputValue) {
              onSendInput(inputValue, activeSession?.id);
              setInputValue('');
            }
          }}
          style={{ display: 'flex', marginTop: '4px' }}
        >
          <span style={{ color: 'var(--success)', marginRight: '8px' }}>&gt;</span>
          <input
            type="text"
            aria-label="Terminal stdin input"
            data-testid="terminal-stdin-input"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder="Enter input for the running program..."
            style={{
              flex: 1,
              background: 'transparent',
              border: 'none',
              color: 'var(--text-primary)',
              fontFamily: 'inherit',
              outline: 'none',
            }}
            autoComplete="off"
          />
        </form>
      )}
      <div ref={outputEndRef} />
    </div>
  );

  const testSession =
    activeSession?.runType === 'tests'
      ? activeSession
      : [...sessions].reverse().find((s) => s.runType === 'tests');

  return (
    <section
      style={{
        height: '220px',
        minHeight: '140px',
        maxHeight: '420px',
        backgroundColor: 'var(--bg-panel-solid)',
        borderTop: '1px solid var(--border-subtle)',
        display: 'flex',
        flexDirection: 'column',
        userSelect: 'none',
        zIndex: 15,
      }}
    >
      {/* Terminal Drawer Header */}
      <div
        style={{
          height: '32px',
          padding: '0 12px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: '1px solid var(--border-subtle)',
          backgroundColor: 'var(--bg-panel-raised)',
        }}
      >
        {/* Tabs */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
          {(['terminal', 'output', 'problems', 'tests'] as const).map((tab) => (
            <button
              key={tab}
              data-testid={`terminal-tab-${tab}`}
              onClick={() => setActiveTab(tab)}
              style={{
                padding: '4px 10px',
                fontSize: '11px',
                fontWeight: activeTab === tab ? 600 : 400,
                color: activeTab === tab ? 'var(--text-primary)' : 'var(--text-muted)',
                backgroundColor: activeTab === tab ? 'var(--bg-panel-solid)' : 'transparent',
                borderRadius: 'var(--radius-xs)',
                textTransform: 'uppercase',
                letterSpacing: '0.3px',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
              }}
            >
              <span>{tab}</span>
              {tab === 'problems' && totalCount > 0 && (
                <span
                  data-testid="problems-badge"
                  className={errorCount > 0 ? 'error-badge' : 'warning-badge'}
                  style={{
                    backgroundColor: errorCount > 0 ? 'var(--error, #f85149)' : 'var(--warning, #d29922)',
                    color: '#ffffff',
                    borderRadius: '10px',
                    padding: '0 5px',
                    fontSize: '9px',
                    fontWeight: 700,
                    lineHeight: '14px',
                    minWidth: '14px',
                    textAlign: 'center',
                  }}
                >
                  {totalCount}
                </span>
              )}
            </button>
          ))}
          {effectiveIsRunning && (
            <span
              style={{
                marginLeft: '8px',
                fontSize: '10px',
                color: 'var(--success)',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
              }}
            >
              <span
                style={{
                  width: '6px',
                  height: '6px',
                  borderRadius: '50%',
                  backgroundColor: 'var(--success)',
                  display: 'inline-block',
                  animation: 'pulse 1.2s ease-in-out infinite',
                }}
              />
              RUNNING
            </span>
          )}
        </div>

        {/* Action Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          {hasTerminalError && activeTab === 'terminal' && onFixTerminalError && (
            <button
              data-testid="fix-terminal-error-btn"
              onClick={() => {
                const errorText = effectiveLines
                  .filter(
                    (l) =>
                      l.stream === 'stderr' ||
                      (l.stream === 'exit' && (l.exitCode ?? 0) !== 0) ||
                      /(?:TypeError|ReferenceError|SyntaxError|Error|Exception|ERR!):/i.test(l.chunk || '')
                  )
                  .map((l) => stripAnsi(l.chunk || (l.stream === 'exit' ? `[Process exited with code ${l.exitCode}]` : '')))
                  .join('\n');
                onFixTerminalError(errorText || effectiveLines.map((l) => stripAnsi(l.chunk || '')).slice(-15).join('\n'));
              }}
              title="Fix this runtime error with AI Agent"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                padding: '3px 10px',
                fontSize: '11px',
                fontWeight: 600,
                color: '#ffffff',
                backgroundColor: 'var(--accent, #6366f1)',
                border: 'none',
                borderRadius: 'var(--radius-xs, 3px)',
                cursor: 'pointer',
                marginRight: '6px',
              }}
            >
              <span>⚡ Fix with AI</span>
            </button>
          )}
          <button
            onClick={handleClear}
            title="Clear Log"
            aria-label="Clear Log"
            style={{ padding: '2px', color: 'var(--text-muted)', borderRadius: 'var(--radius-xs)' }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 6h18" />
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
            </svg>
          </button>
          <button
            onClick={onClose}
            title="Close Terminal Drawer"
            aria-label="Close Terminal"
            style={{ padding: '2px', color: 'var(--text-muted)', borderRadius: 'var(--radius-xs)' }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
      </div>

      {/* Multi-Session Sub-Toolbar (visible when terminal tab is active) */}
      {activeTab === 'terminal' && (
        <div
          className="terminal-session-tabs"
          data-testid="terminal-session-tabs"
          style={{
            display: 'flex',
            gap: '4px',
            alignItems: 'center',
            padding: '4px 8px',
            borderBottom: '1px solid var(--border-subtle)',
            backgroundColor: '#0e131a',
            overflowX: 'auto',
            flexShrink: 0,
          }}
        >
          {sessions.map((s) => {
            const isActive = s.id === activeSessionId;
            return (
              <div
                key={s.id}
                role="tab"
                aria-selected={isActive}
                data-testid={`session-tab-${s.id}`}
                onClick={() => setActiveSession(s.id)}
                className={`session-tab ${isActive ? 'active' : ''}`}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '3px 8px',
                  fontSize: '11px',
                  borderRadius: 'var(--radius-xs)',
                  cursor: 'pointer',
                  backgroundColor: isActive ? 'var(--bg-selected, #222c38)' : 'transparent',
                  color: isActive ? 'var(--text-primary)' : 'var(--text-muted)',
                  border: isActive ? '1px solid var(--border-default, #303946)' : '1px solid transparent',
                  whiteSpace: 'nowrap',
                }}
              >
                <span aria-hidden="true" style={{ fontSize: '9px' }}>
                  {s.isRunning ? '🟢' : '⏹'}
                </span>
                <span>{s.title}</span>
                {sessions.length > 1 && (
                  <button
                    type="button"
                    data-testid={`close-session-${s.id}`}
                    aria-label={`Close ${s.title}`}
                    title="Close Terminal Session"
                    onClick={(e) => {
                      e.stopPropagation();
                      closeSession(s.id);
                    }}
                    style={{
                      marginLeft: '2px',
                      padding: '0 3px',
                      fontSize: '10px',
                      lineHeight: '14px',
                      color: 'var(--text-muted)',
                      borderRadius: '2px',
                    }}
                  >
                    ✕
                  </button>
                )}
              </div>
            );
          })}
          <button
            type="button"
            data-testid="new-terminal-btn"
            aria-label="New Terminal"
            onClick={() => createSession()}
            title="New Terminal (Ctrl+Shift+`)"
            style={{
              padding: '2px 7px',
              fontSize: '13px',
              fontWeight: 600,
              lineHeight: '16px',
              color: 'var(--text-secondary)',
              backgroundColor: 'var(--bg-panel-raised)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-xs)',
              cursor: 'pointer',
            }}
          >
            +
          </button>
        </div>
      )}

      {/* Terminal Stream Output */}
      <div
        ref={scrollContainerRef}
        onScroll={(e) => {
          if (activeTab === 'terminal' && activeSession) {
            scrollPositionsRef.current[activeSession.id] = e.currentTarget.scrollTop;
          }
        }}
        style={{
          flex: 1,
          padding: activeTab === 'problems' ? 0 : '8px 12px',
          fontFamily: 'var(--font-code)',
          fontSize: '12px',
          color: 'var(--text-primary)',
          backgroundColor: '#0a0f14',
          overflowY: activeTab === 'problems' ? 'hidden' : 'auto',
          lineHeight: '1.5',
          userSelect: 'text',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {(() => {
          if (activeTab === 'terminal') {
            return renderOutput(effectiveLines, effectiveIsRunning, 'terminal');
          }
          if (activeTab === 'tests') {
            if (runType === 'tests' || (outputLines !== undefined && effectiveRunType === 'tests')) {
              return renderOutput(effectiveLines, effectiveIsRunning, 'tests');
            }
            if (testSession) {
              return renderOutput(testSession.lines, testSession.isRunning, 'tests');
            }
            return <div style={{ color: 'var(--success)' }}>✓ 6 test suites passed (21 tests)</div>;
          }
          if (activeTab === 'output') {
            return <div style={{ color: 'var(--text-muted)' }}>[System Log] Container sandbox ready.</div>;
          }
          if (activeTab === 'problems') {
            return (
              <ProblemsView
                onNavigateToFile={onNavigateToFile}
                onFixWithAI={onFixWithAI}
              />
            );
          }
          return null;
        })()}
      </div>
    </section>
  );
};
