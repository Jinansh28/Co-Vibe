import React, { useState, useEffect, useCallback, useRef } from 'react';
import { ToolTimeline } from './ToolTimeline.js';
import { AgentTaskProgressPayload } from '@co-vibe/protocol';

const RUNTIME_URL = 'http://127.0.0.1:7890';

export interface VisualAttachment {
  base64: string;
  filePath: string;
  mimeType?: string;
}

export interface CodeSnippetAttachment {
  filePath: string;
  startLine: number;
  endLine: number;
  code: string;
}

export interface AgentPanelProps {
  isOpen: boolean;
  workspaceId?: string | null;
  onClose?: () => void;
  onReviewDiff?: (diffData: NonNullable<AgentTaskProgressPayload['diffData']>) => void;
  attachedImage?: VisualAttachment | null;
  onClearAttachment?: () => void;
  attachedSnippet?: CodeSnippetAttachment | null;
  onClearSnippet?: () => void;
  initialPrompt?: string;
  autoExecute?: boolean;
}

export const AgentPanel: React.FC<AgentPanelProps> = ({
  isOpen,
  workspaceId,
  onClose,
  onReviewDiff,
  attachedImage,
  onClearAttachment,
  attachedSnippet,
  onClearSnippet,
  initialPrompt,
  autoExecute = false,
}) => {
  const [prompt, setPrompt] = useState('');
  const [isExecuting, setIsExecuting] = useState(false);
  const [activeGoal, setActiveGoal] = useState<string | null>(null);
  const [timelineEvents, setTimelineEvents] = useState<AgentTaskProgressPayload[]>([]);
  const [modelInfo, setModelInfo] = useState<{ provider: string; model: string }>({
    provider: 'Gemini',
    model: 'gemini-3.5-flash-lite',
  });
  const [localAttachment, setLocalAttachment] = useState<VisualAttachment | null>(null);
  const [localSnippet, setLocalSnippet] = useState<CodeSnippetAttachment | null>(null);

  const executedPromptRef = useRef<string | null>(null);

  useEffect(() => {
    if (attachedImage !== undefined) {
      setLocalAttachment(attachedImage);
    }
  }, [attachedImage]);

  useEffect(() => {
    if (attachedSnippet !== undefined) {
      setLocalSnippet(attachedSnippet);
    }
  }, [attachedSnippet]);

  useEffect(() => {
    if (initialPrompt !== undefined) {
      setPrompt(initialPrompt);
    }
  }, [initialPrompt]);

  const handleRemoveAttachment = () => {
    setLocalAttachment(null);
    onClearAttachment?.();
  };

  const handleRemoveSnippet = () => {
    setLocalSnippet(null);
    onClearSnippet?.();
  };

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

  const executeTask = useCallback(
    async (textToSend: string, snippetToSend?: CodeSnippetAttachment | null) => {
      const text = textToSend.trim();
      if (!text || isExecuting) return;

      const attachmentToSend = localAttachment;
      const snippet = snippetToSend !== undefined ? snippetToSend : localSnippet;

      setIsExecuting(true);
      setActiveGoal(text);
      setPrompt('');
      setLocalAttachment(null);
      setLocalSnippet(null);
      onClearAttachment?.();
      onClearSnippet?.();

      // Prepend the snippet to the request payload
      const fullPrompt = snippet
        ? `[Code Snippet: ${snippet.filePath}:L${snippet.startLine}-L${snippet.endLine}]\n\`\`\`\n${snippet.code}\n\`\`\`\n\n${text}`
        : text;

      // Add optimistic start event
      const startEvent: AgentTaskProgressPayload = {
        taskId: 'client-task',
        runId: 'client-run',
        state: 'PENDING',
        stepName: 'User Request',
        message: text,
        percentage: 5,
        image: attachmentToSend
          ? {
              mimeType: attachmentToSend.mimeType || 'image/png',
              base64: attachmentToSend.base64,
            }
          : undefined,
      };
      setTimelineEvents((prev) => [...prev, startEvent]);

      try {
        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
        };
        if (workspaceId) {
          headers['X-Workspace-Id'] = workspaceId;
        }

        const requestBody: any = { prompt: fullPrompt };
        if (snippet) {
          requestBody.snippet = snippet;
        }
        if (attachmentToSend) {
          requestBody.image = {
            mimeType: attachmentToSend.mimeType || 'image/png',
            base64: attachmentToSend.base64,
          };
        }

        const res = await fetch(`${RUNTIME_URL}/api/v1/agent/run`, {
          method: 'POST',
          headers,
          body: JSON.stringify(requestBody),
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
              if (event.diffData && onReviewDiff) {
                onReviewDiff(event.diffData);
              }
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
    },
    [isExecuting, localAttachment, localSnippet, onClearAttachment, onClearSnippet, onReviewDiff, workspaceId]
  );

  // Trigger auto execution when initialPrompt and autoExecute are provided
  useEffect(() => {
    if (autoExecute && initialPrompt && executedPromptRef.current !== initialPrompt) {
      executedPromptRef.current = initialPrompt;
      executeTask(initialPrompt, attachedSnippet || localSnippet);
    }
  }, [autoExecute, initialPrompt, attachedSnippet, localSnippet, executeTask]);

  const handleSend = async () => {
    const text = prompt.trim();
    if (!text || isExecuting) return;
    await executeTask(text, localSnippet);
  };

  if (!isOpen) return null;

  return (
    <aside
      data-testid="agent-panel"
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
        <ToolTimeline events={timelineEvents} onReviewDiff={onReviewDiff} />
      </div>

      {/* Prompt Input Footer */}
      <div
        style={{
          padding: '12px',
          borderTop: '1px solid var(--border-subtle)',
          backgroundColor: 'var(--bg-panel-solid)',
        }}
      >
        {/* Attachment preview badge above prompt input */}
        {localAttachment && (
          <div
            data-testid="agent-attachment-badge"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '4px 8px',
              marginBottom: '8px',
              backgroundColor: 'var(--bg-panel-raised)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-sm)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden' }}>
              <img
                data-testid="agent-attachment-thumbnail"
                src={`data:${localAttachment.mimeType || 'image/png'};base64,${localAttachment.base64}`}
                alt="Visual snapshot"
                style={{
                  width: '28px',
                  height: '28px',
                  objectFit: 'cover',
                  borderRadius: 'var(--radius-xs)',
                  border: '1px solid var(--border-subtle)',
                  backgroundColor: '#ffffff',
                  flexShrink: 0,
                }}
              />
              <span
                data-testid="agent-attachment-text"
                style={{
                  fontFamily: 'var(--font-code)',
                  fontSize: '11px',
                  color: 'var(--text-secondary)',
                  whiteSpace: 'nowrap',
                  textOverflow: 'ellipsis',
                  overflow: 'hidden',
                }}
              >
                [Snapshot: {localAttachment.filePath}]
              </span>
            </div>

            <button
              onClick={handleRemoveAttachment}
              title="Remove snapshot attachment"
              aria-label="Remove attachment"
              data-testid="remove-attachment-btn"
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--text-muted)',
                cursor: 'pointer',
                padding: '2px 4px',
                fontSize: '14px',
                lineHeight: 1,
                borderRadius: 'var(--radius-xs)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              ×
            </button>
          </div>
        )}

        {/* Code Snippet attachment chip above prompt input */}
        {localSnippet && (
          <div
            data-testid="agent-snippet-badge"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '4px 8px',
              marginBottom: '8px',
              backgroundColor: 'var(--bg-panel-raised)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-sm)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', overflow: 'hidden' }}>
              <span
                style={{
                  fontFamily: 'var(--font-code)',
                  fontSize: '11px',
                  color: 'var(--accent)',
                  fontWeight: 600,
                }}
              >
                &lt;/&gt;
              </span>
              <span
                data-testid="agent-snippet-text"
                style={{
                  fontFamily: 'var(--font-code)',
                  fontSize: '11px',
                  color: 'var(--text-secondary)',
                  whiteSpace: 'nowrap',
                  textOverflow: 'ellipsis',
                  overflow: 'hidden',
                }}
              >
                [Code Snippet: {localSnippet.filePath}:L{localSnippet.startLine}-L{localSnippet.endLine}]
              </span>
            </div>

            <button
              onClick={handleRemoveSnippet}
              title="Remove code snippet"
              aria-label="Remove code snippet"
              data-testid="remove-snippet-btn"
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--text-muted)',
                cursor: 'pointer',
                padding: '2px 4px',
                fontSize: '14px',
                lineHeight: 1,
                borderRadius: 'var(--radius-xs)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              ×
            </button>
          </div>
        )}

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
