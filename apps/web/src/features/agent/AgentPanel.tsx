import React, { useState, useEffect } from 'react';
import { ToolTimeline } from './ToolTimeline.js';
import { AgentTaskProgressPayload } from '@co-vibe/protocol';

const RUNTIME_URL = 'http://127.0.0.1:7890';

interface AgentPanelProps {
  isOpen: boolean;
  workspaceId?: string | null;
  onClose?: () => void;
}

export const AgentPanel: React.FC<AgentPanelProps> = ({ isOpen, workspaceId, onClose }) => {
  const [prompt, setPrompt] = useState('');
  const [isExecuting, setIsExecuting] = useState(false);
  const [activeGoal, setActiveGoal] = useState<string | null>(null);
  const [timelineEvents, setTimelineEvents] = useState<AgentTaskProgressPayload[]>([]);
  const [modelInfo, setModelInfo] = useState<{ provider: string; model: string }>({
    provider: 'Gemini',
    model: 'gemini-3.5-flash-lite',
  });

  useEffect(() => {
    if (!isOpen) return;
    fetch(`${RUNTIME_URL}/api/v1/agent/info`)
      .then((res) => res.json())
      .then((data) => {
        if (data.ok) {
          setModelInfo({ provider: data.provider, model: data.model });
        }
      })
      .catch(() => {
        // Fallback default
      });
  }, [isOpen]);

  const handleSend = async () => {
    const text = prompt.trim();
    if (!text || isExecuting) return;

    setIsExecuting(true);
    setActiveGoal(text);
    setPrompt('');

    // Add optimistic start event
    const startEvent: AgentTaskProgressPayload = {
      taskId: 'client-task',
      runId: 'client-run',
      state: 'PENDING',
      stepName: 'User Request',
      message: text,
      percentage: 5,
    };
    setTimelineEvents((prev) => [...prev, startEvent]);

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (workspaceId) {
        headers['X-Workspace-Id'] = workspaceId;
      }

      const res = await fetch(`${RUNTIME_URL}/api/v1/agent/run`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ prompt: text }),
      });

      if (!res.ok || !res.body) {
        const errorText = await res.text().catch(() => res.statusText);
        setTimelineEvents((prev) => [
          ...prev,
          {
            taskId: 'err',
            runId: 'err',
            state: 'FAILED',
            stepName: 'Connection Error',
            message: `Runtime error (${res.status}): ${errorText || 'Failed to start agent task'}`,
            percentage: 100,
          },
        ]);
        setIsExecuting(false);
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          try {
            const event = JSON.parse(trimmed) as AgentTaskProgressPayload;
            setTimelineEvents((prev) => [...prev, event]);
          } catch {
            // Ignore non-json chunk
          }
        }
      }
    } catch (err: any) {
      setTimelineEvents((prev) => [
        ...prev,
        {
          taskId: 'err',
          runId: 'err',
          state: 'FAILED',
          stepName: 'Network Error',
          message:
            err?.message?.includes('Failed to fetch') || err?.name === 'TypeError'
              ? 'Could not connect to the local runtime daemon on http://127.0.0.1:7890. Ensure "pnpm dev:all" or the runtime daemon is running.'
              : `Agent execution failed: ${err?.message || String(err)}`,
          percentage: 100,
        },
      ]);
    } finally {
      setIsExecuting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <aside
      style={{
        width: '320px',
        minWidth: '260px',
        maxWidth: '450px',
        height: '100%',
        backgroundColor: 'var(--bg-panel-solid)',
        borderLeft: '1px solid var(--border-subtle)',
        display: 'flex',
        flexDirection: 'column',
        userSelect: 'none',
        zIndex: 10,
      }}
    >
      {/* Header */}
      <div
        style={{
          height: '36px',
          padding: '0 12px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: '1px solid var(--border-subtle)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span
            style={{
              fontSize: '11px',
              fontWeight: 700,
              letterSpacing: '0.5px',
              color: 'var(--text-muted)',
              textTransform: 'uppercase',
            }}
          >
            AI Agent
          </span>
          <span
            style={{
              fontSize: '10px',
              fontWeight: 600,
              padding: '1px 6px',
              borderRadius: 'var(--radius-xs)',
              backgroundColor: isExecuting ? 'rgba(234, 179, 8, 0.15)' : 'var(--success-subtle)',
              color: isExecuting ? 'rgb(234, 179, 8)' : 'var(--success)',
              border: isExecuting
                ? '1px solid rgba(234, 179, 8, 0.3)'
                : '1px solid rgba(63, 185, 80, 0.3)',
            }}
          >
            {isExecuting ? 'Running...' : 'Ready'}
          </span>
        </div>

        <button
          onClick={onClose}
          title="Close Agent Panel"
          aria-label="Close Agent Panel"
          style={{
            padding: '2px',
            color: 'var(--text-muted)',
            borderRadius: 'var(--radius-xs)',
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      {/* Model Selection Badge */}
      <div
        style={{
          padding: '8px 12px',
          borderBottom: '1px solid var(--border-subtle)',
          backgroundColor: 'var(--bg-panel-raised)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          fontSize: '11px',
        }}
      >
        <span style={{ color: 'var(--text-muted)' }}>Provider / Model:</span>
        <span
          style={{
            fontFamily: 'var(--font-code)',
            fontSize: '11px',
            color: 'var(--accent)',
            fontWeight: 600,
          }}
        >
          {modelInfo.provider} ({modelInfo.model})
        </span>
      </div>

      {/* Active Task / Plan Status Card */}
      <div style={{ padding: '12px', flex: 1, overflowY: 'auto' }}>
        <div
          style={{
            padding: '10px',
            borderRadius: 'var(--radius-md)',
            backgroundColor: 'var(--bg-input)',
            border: '1px solid var(--border-subtle)',
            marginBottom: '12px',
          }}
        >
          <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '4px' }}>
            ACTIVE GOAL
          </div>
          <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)' }}>
            {activeGoal ? 'Current Task' : 'Idle — Ready for prompt'}
          </div>
          <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '4px' }}>
            {activeGoal || 'Enter instructions below to have the agent analyze files, write code, or execute tests.'}
          </div>
        </div>

        {/* Agent Activity Stream */}
        <ToolTimeline events={timelineEvents} />
      </div>

      {/* Prompt Input Footer */}
      <div
        style={{
          padding: '12px',
          borderTop: '1px solid var(--border-subtle)',
          backgroundColor: 'var(--bg-panel-solid)',
        }}
      >
        <div style={{ position: 'relative' }}>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            disabled={isExecuting}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder={isExecuting ? 'Agent is working on current task...' : 'Ask agent to generate, modify, or run tests...'}
            rows={3}
            style={{
              width: '100%',
              backgroundColor: 'var(--bg-input)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-md)',
              color: 'var(--text-primary)',
              padding: '8px 10px',
              fontSize: '12px',
              fontFamily: 'inherit',
              resize: 'none',
              outline: 'none',
              opacity: isExecuting ? 0.6 : 1,
            }}
          />
          <button
            onClick={handleSend}
            title="Send prompt to agent"
            aria-label="Send prompt"
            disabled={!prompt.trim() || isExecuting}
            style={{
              position: 'absolute',
              bottom: '8px',
              right: '8px',
              padding: '4px 8px',
              borderRadius: 'var(--radius-xs)',
              backgroundColor: prompt.trim() && !isExecuting ? 'var(--accent)' : 'var(--border-subtle)',
              color: prompt.trim() && !isExecuting ? '#ffffff' : 'var(--text-disabled)',
              fontSize: '11px',
              fontWeight: 600,
              cursor: prompt.trim() && !isExecuting ? 'pointer' : 'default',
            }}
          >
            {isExecuting ? 'Running...' : 'Send'}
          </button>
        </div>
      </div>
    </aside>
  );
};
