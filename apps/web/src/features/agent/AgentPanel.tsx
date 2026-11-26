import React, { useState, useEffect, useCallback, useRef, useContext } from 'react';
import { ToolTimeline } from './ToolTimeline.js';
import { AgentTaskProgressPayload } from '@co-vibe/protocol';
import { AuthContext } from '../auth/AuthProvider.js';
import { ResizeHandle, clampSize } from '../../components/layout/ResizeHandle.js';
import { RUNTIME_URL, fetchRuntime } from '../../lib/runtimeConfig.js';

const DEFAULT_AGENT_WIDTH = 320;
const DEFAULT_AGENT_MIN_WIDTH = 260;
const DEFAULT_AGENT_MAX_WIDTH = 520;

const AGENT_HISTORY_STORAGE_KEY_PREFIX = 'co_vibe_agent_tasks_';

interface AgentConversationEntry {
  role: string;
  content: string;
}

interface AgentRunSummary {
  id: string;
  status?: string;
}

interface AgentToolCallRecord {
  runId: string;
  toolName: string;
  result?: string;
}

interface AgentChangeSetRecord {
  id: string;
  runId?: string;
  patch: string;
  changedFiles?: string[];
  status?: string;
  diffData?: NonNullable<AgentTaskProgressPayload['diffData']>;
}

interface SavedAgentTask {
  id: string;
  workspaceId?: string;
  prompt: string;
  status: string;
  createdAt?: string;
  runCount?: number;
  hasDiff?: boolean;
  changedFiles?: string[];
}

interface AgentTaskDetailsRecord extends SavedAgentTask {
  runs?: AgentRunSummary[];
  toolCalls?: AgentToolCallRecord[];
  conversations?: AgentConversationEntry[];
  timelineEvents?: AgentTaskProgressPayload[];
  changeSet?: AgentChangeSetRecord | null;
}

interface AgentRunRequestPayload {
  prompt: string;
  taskId?: string;
  runId?: string;
  snippet?: CodeSnippetAttachment;
  image?: {
    mimeType: string;
    base64: string;
  };
}

function getLocalTaskHistory(wsId: string): AgentTaskDetailsRecord[] {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const raw = localStorage.getItem(`${AGENT_HISTORY_STORAGE_KEY_PREFIX}${wsId}`);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed as AgentTaskDetailsRecord[];
      }
    }
  } catch {
    // Ignore storage errors
  }
  return [];
}

function saveLocalTaskHistory(wsId: string, tasks: AgentTaskDetailsRecord[]): void {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      localStorage.setItem(`${AGENT_HISTORY_STORAGE_KEY_PREFIX}${wsId}`, JSON.stringify(tasks));
    }
  } catch {
    // Ignore storage errors
  }
}

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
  width?: number;
  minWidth?: number;
  maxWidth?: number;
  onResize?: (width: number) => void;
  onResetWidth?: () => void;
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
  width,
  minWidth = DEFAULT_AGENT_MIN_WIDTH,
  maxWidth = DEFAULT_AGENT_MAX_WIDTH,
  onResize,
  onResetWidth,
}) => {
  const [internalWidth, setInternalWidth] = useState(DEFAULT_AGENT_WIDTH);
  const auth = useContext(AuthContext);
  const token = auth?.session?.access_token;

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

  const [savedTasks, setSavedTasks] = useState<AgentTaskDetailsRecord[]>([]);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [selectedTaskDetails, setSelectedTaskDetails] = useState<AgentTaskDetailsRecord | null>(null);
  const [activeTab, setActiveTab] = useState<'stream' | 'history'>('stream');

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

  const effectiveWsId = workspaceId || 'default-workspace';

  const fetchWorkspaceTasks = useCallback(async () => {
    const localTasks = getLocalTaskHistory(effectiveWsId);
    try {
      if (workspaceId) {
        const res = await fetch(`/api/v1/workspaces/${workspaceId}/agent/tasks`, {
          headers: {
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
        });
        if (res.ok) {
          const data = (await res.json()) as { tasks?: SavedAgentTask[] };
          const serverTasks = data.tasks || [];
          const serverIds = new Set(serverTasks.map((t) => t.id));
          const merged: AgentTaskDetailsRecord[] = [
            ...serverTasks,
            ...localTasks.filter((lt) => !serverIds.has(lt.id)),
          ];
          setSavedTasks(merged);
          saveLocalTaskHistory(effectiveWsId, merged);
          return;
        }
      }
    } catch {
      // Ignore if offline / mock
    }
    setSavedTasks(localTasks);
  }, [workspaceId, effectiveWsId, token]);

  useEffect(() => {
    if (isOpen) {
      fetchWorkspaceTasks();
    }
  }, [isOpen, fetchWorkspaceTasks]);

  const loadTaskDetails = async (taskId: string) => {
    setSelectedTaskId(taskId);
    let details: AgentTaskDetailsRecord | null = null;

    try {
      const res = await fetch(`/api/v1/agent/tasks/${taskId}`, {
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });
      if (res.ok) {
        const data = (await res.json()) as { task?: AgentTaskDetailsRecord };
        details = data.task ?? null;
      }
    } catch {
      // Offline fallback
    }

    if (!details) {
      const localTasks = getLocalTaskHistory(effectiveWsId);
      details = localTasks.find((t) => t.id === taskId) ?? null;
    }

    if (details) {
      setSelectedTaskDetails(details);
      setActiveGoal(details.prompt);
      setActiveTab('stream');

      if (details.timelineEvents && details.timelineEvents.length > 0) {
        setTimelineEvents(details.timelineEvents);
        return;
      }

      const events: AgentTaskProgressPayload[] = [];
      if (details.conversations && details.conversations.length > 0) {
        for (const conv of details.conversations) {
          events.push({
            taskId: details.id,
            runId: details.runs?.[0]?.id || 'run-1',
            state: conv.role === 'user' ? 'PENDING' : 'SUCCESS',
            stepName: conv.role === 'user' ? 'User Prompt' : 'Agent Response',
            message: conv.content,
            percentage: 100,
          });
        }
      }
      if (details.toolCalls && details.toolCalls.length > 0) {
        for (const tc of details.toolCalls) {
          events.push({
            taskId: details.id,
            runId: tc.runId,
            state: 'EXECUTING',
            stepName: `Tool: ${tc.toolName}`,
            message: tc.result || `Executed tool ${tc.toolName}`,
            percentage: 70,
          });
        }
      }
      if (details.changeSet) {
        events.push({
          taskId: details.id,
          runId: details.changeSet.runId || 'run-1',
          state: 'AWAITING_APPROVAL',
          stepName: 'Diff Review',
          message: `Proposed modifications to ${(details.changeSet.changedFiles || []).join(', ') || 'files'}`,
          percentage: 100,
          diffData: details.changeSet.diffData || {
            changeSetId: details.changeSet.id,
            filePath: details.changeSet.changedFiles?.[0] || 'src/modified-file',
            originalContent: '',
            modifiedContent: details.changeSet.patch,
          },
        });
      }
      setTimelineEvents(
        events.length > 0
          ? events
          : [
              {
                taskId: details.id,
                runId: 'past-run',
                state: details.status === 'completed' ? 'SUCCESS' : details.status === 'failed' ? 'FAILED' : 'PENDING',
                stepName: 'Task Run',
                message: details.prompt,
                percentage: 100,
              },
            ]
      );
    }
  };

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

      let currentTaskId = selectedTaskId;
      let currentRunId = crypto.randomUUID();

      if (workspaceId) {
        if (selectedTaskId) {
          // Record follow-up message into existing conversation
          fetch(`/api/v1/agent/tasks/${selectedTaskId}/conversations`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
            body: JSON.stringify({ role: 'user', content: text }),
          }).catch(() => {});
        } else {
          try {
            const createRes = await fetch(`/api/v1/workspaces/${workspaceId}/agent/tasks`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                ...(token ? { Authorization: `Bearer ${token}` } : {}),
              },
              body: JSON.stringify({ prompt: text }),
            });
            if (createRes.ok) {
              const created = await createRes.json();
              currentTaskId = created.taskId;
              currentRunId = created.runId;
              setSelectedTaskId(currentTaskId);
            }
          } catch {
            // Fallback to local execution without server saved history
          }
        }
      }

      if (!currentTaskId) {
        currentTaskId = crypto.randomUUID();
        setSelectedTaskId(currentTaskId);
      }

      // Prepend the snippet to the request payload
      const fullPrompt = snippet
        ? `[Code Snippet: ${snippet.filePath}:L${snippet.startLine}-L${snippet.endLine}]\n\`\`\`\n${snippet.code}\n\`\`\`\n\n${text}`
        : text;

      // Add optimistic start event
      const startEvent: AgentTaskProgressPayload = {
        taskId: currentTaskId,
        runId: currentRunId,
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

      const streamAccumulator: AgentTaskProgressPayload[] = [...timelineEvents, startEvent];
      setTimelineEvents((prev) => [...prev, startEvent]);

      try {
        const requestBody: AgentRunRequestPayload = { prompt: fullPrompt };
        if (currentTaskId) {
          requestBody.taskId = currentTaskId;
        }
        if (currentRunId) {
          requestBody.runId = currentRunId;
        }
        if (snippet) {
          requestBody.snippet = snippet;
        }
        if (attachmentToSend) {
          requestBody.image = {
            mimeType: attachmentToSend.mimeType || 'image/png',
            base64: attachmentToSend.base64,
          };
        }

        const res = await fetchRuntime(
          '/api/v1/agent/run',
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody),
          },
          workspaceId || undefined
        );

        if (!res.ok || !res.body) {
          const errorText = await res.text().catch(() => res.statusText);
          const errEvent: AgentTaskProgressPayload = {
            taskId: 'err',
            runId: 'err',
            state: 'FAILED',
            stepName: 'Connection Error',
            message: `Runtime error (${res.status}): ${errorText || 'Failed to start agent task'}`,
            percentage: 100,
          };
          streamAccumulator.push(errEvent);
          setTimelineEvents((prev) => [...prev, errEvent]);
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
              streamAccumulator.push(event);
              setTimelineEvents((prev) => [...prev, event]);
              if (event.diffData && onReviewDiff) {
                onReviewDiff(event.diffData);
              }
              if (currentTaskId && currentRunId) {
                fetch(`/api/v1/agent/tasks/${currentTaskId}/runs/${currentRunId}/progress`, {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    ...(token ? { Authorization: `Bearer ${token}` } : {}),
                  },
                  body: JSON.stringify(event),
                }).catch(() => {});
              }
            } catch {
              // Ignore non-json chunk
            }
          }
        }
      } catch (err: unknown) {
        const errMessage = err instanceof Error ? err.message : String(err);
        const errName = err instanceof Error ? err.name : '';
        const netErrEvent: AgentTaskProgressPayload = {
          taskId: 'err',
          runId: 'err',
          state: 'FAILED',
          stepName: 'Network Error',
          message:
            errMessage.includes('Failed to fetch') || errName === 'TypeError'
              ? `Could not connect to the local runtime daemon on ${RUNTIME_URL}. Ensure "pnpm dev:all" or the runtime daemon is running.`
              : `Agent execution failed: ${errMessage}`,
          percentage: 100,
        };
        streamAccumulator.push(netErrEvent);
        setTimelineEvents((prev) => [...prev, netErrEvent]);
      } finally {
        setIsExecuting(false);
        if (currentTaskId) {
          const existingLocal = getLocalTaskHistory(effectiveWsId);
          const taskIdx = existingLocal.findIndex((t) => t.id === currentTaskId);
          const lastEvent = streamAccumulator[streamAccumulator.length - 1];
          const hasDiff = streamAccumulator.some((e) => Boolean(e.diffData));
          const diffEvent = streamAccumulator.find((e) => Boolean(e.diffData));
          const status =
            lastEvent?.state === 'SUCCESS' ? 'completed' : lastEvent?.state === 'FAILED' ? 'failed' : 'completed';

          const currentConversations: AgentConversationEntry[] = [
            ...(selectedTaskDetails?.conversations || [{ role: 'user', content: text }]),
          ];
          if (selectedTaskId && !currentConversations.some((c) => c.content === text)) {
            currentConversations.push({ role: 'user', content: text });
          }
          if (
            lastEvent &&
            lastEvent.message &&
            !currentConversations.some((c) => c.content === lastEvent.message)
          ) {
            currentConversations.push({ role: 'assistant', content: lastEvent.message });
          }

          const taskRecord = {
            id: currentTaskId,
            workspaceId: effectiveWsId,
            prompt: selectedTaskDetails?.prompt || text,
            status,
            createdAt: selectedTaskDetails?.createdAt || new Date().toISOString(),
            runCount: (selectedTaskDetails?.runCount || 0) + 1,
            hasDiff,
            timelineEvents: streamAccumulator,
            conversations: currentConversations,
            changeSet: diffEvent?.diffData
              ? {
                  id: diffEvent.diffData.changeSetId,
                  patch: diffEvent.diffData.modifiedContent,
                  changedFiles: [diffEvent.diffData.filePath],
                  status: 'pending',
                  diffData: diffEvent.diffData,
                }
              : selectedTaskDetails?.changeSet,
          };

          if (taskIdx >= 0) {
            existingLocal[taskIdx] = taskRecord;
          } else {
            existingLocal.unshift(taskRecord);
          }
          saveLocalTaskHistory(effectiveWsId, existingLocal);
          setSelectedTaskDetails(taskRecord);
        }
        fetchWorkspaceTasks();
      }
    },
    [
      isExecuting,
      localAttachment,
      localSnippet,
      onClearAttachment,
      onClearSnippet,
      onReviewDiff,
      workspaceId,
      effectiveWsId,
      selectedTaskId,
      selectedTaskDetails,
      timelineEvents,
      token,
      fetchWorkspaceTasks,
    ]
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

  const effectiveWidth = clampSize(width ?? internalWidth, minWidth, maxWidth);
  const handleResize = onResize ?? setInternalWidth;
  const handleReset = onResetWidth ?? (() => setInternalWidth(DEFAULT_AGENT_WIDTH));

  return (
    <aside
      data-testid="agent-panel"
      style={{
        position: 'relative',
        width: `${effectiveWidth}px`,
        flexShrink: 0,
        height: '100%',
        backgroundColor: 'var(--bg-panel-solid)',
        borderLeft: '1px solid var(--border-subtle)',
        display: 'flex',
        flexDirection: 'column',
        userSelect: 'none',
        zIndex: 10,
      }}
    >
      <ResizeHandle
        edge="left"
        currentSize={effectiveWidth}
        minSize={minWidth}
        maxSize={maxWidth}
        onResize={handleResize}
        onReset={handleReset}
        label="Resize AI Agent Panel"
        testId="agent-resize-handle"
      />
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

      {/* Navigation Tabs: Current Stream vs Saved History */}
      <div
        style={{
          display: 'flex',
          padding: '4px 12px',
          gap: '8px',
          borderBottom: '1px solid var(--border-subtle)',
          backgroundColor: 'var(--bg-panel-raised)',
          fontSize: '11px',
        }}
      >
        <button
          data-testid="agent-stream-tab"
          onClick={() => setActiveTab('stream')}
          style={{
            padding: '3px 8px',
            border: 'none',
            borderRadius: 'var(--radius-xs)',
            backgroundColor: activeTab === 'stream' ? 'var(--accent)' : 'transparent',
            color: activeTab === 'stream' ? '#ffffff' : 'var(--text-secondary)',
            fontWeight: activeTab === 'stream' ? 600 : 400,
            cursor: 'pointer',
          }}
        >
          Task Stream
        </button>
        <button
          data-testid="agent-history-tab"
          onClick={() => {
            setActiveTab('history');
            fetchWorkspaceTasks();
          }}
          style={{
            padding: '3px 8px',
            border: 'none',
            borderRadius: 'var(--radius-xs)',
            backgroundColor: activeTab === 'history' ? 'var(--accent)' : 'transparent',
            color: activeTab === 'history' ? '#ffffff' : 'var(--text-secondary)',
            fontWeight: activeTab === 'history' ? 600 : 400,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
          }}
        >
          History
          {savedTasks.length > 0 && (
            <span
              data-testid="history-count-badge"
              style={{
                fontSize: '9px',
                padding: '0 4px',
                borderRadius: '8px',
                backgroundColor: activeTab === 'history' ? 'rgba(255,255,255,0.3)' : 'var(--bg-input)',
              }}
            >
              {savedTasks.length}
            </span>
          )}
        </button>
      </div>

      {activeTab === 'history' ? (
        <div data-testid="agent-history-list" style={{ padding: '12px', flex: 1, minHeight: 0, minWidth: 0, overflowY: 'auto' }}>
          <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '8px' }}>
            SAVED WORKSPACE RUNS
          </div>
          {savedTasks.length === 0 ? (
            <div style={{ fontSize: '12px', color: 'var(--text-secondary)', padding: '8px 0' }}>
              No past agent tasks recorded for this workspace.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {savedTasks.map((t) => (
                <div
                  key={t.id}
                  data-testid="history-task-item"
                  onClick={() => loadTaskDetails(t.id)}
                  style={{
                    padding: '8px 10px',
                    borderRadius: 'var(--radius-md)',
                    backgroundColor: t.id === selectedTaskId ? 'var(--bg-panel-raised)' : 'var(--bg-input)',
                    border: `1px solid ${t.id === selectedTaskId ? 'var(--accent)' : 'var(--border-subtle)'}`,
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '4px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span
                      style={{
                        fontSize: '9px',
                        fontWeight: 600,
                        padding: '1px 5px',
                        borderRadius: 'var(--radius-xs)',
                        backgroundColor:
                          t.status === 'completed'
                            ? 'var(--success-subtle)'
                            : t.status === 'failed'
                            ? 'rgba(239, 68, 68, 0.15)'
                            : 'rgba(234, 179, 8, 0.15)',
                        color:
                          t.status === 'completed'
                            ? 'var(--success)'
                            : t.status === 'failed'
                            ? 'rgb(239, 68, 68)'
                            : 'rgb(234, 179, 8)',
                        textTransform: 'uppercase',
                      }}
                    >
                      {t.status}
                    </span>
                    {t.hasDiff && (
                      <span
                        style={{
                          fontSize: '9px',
                          padding: '1px 5px',
                          borderRadius: 'var(--radius-xs)',
                          backgroundColor: 'var(--accent-subtle, rgba(99, 102, 241, 0.15))',
                          color: 'var(--accent)',
                          fontWeight: 600,
                        }}
                      >
                        DIFF
                      </span>
                    )}
                  </div>
                  <div
                    style={{
                      fontSize: '12px',
                      color: 'var(--text-primary)',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {t.prompt}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        /* Active Task / Plan Status Card */
        <div style={{ padding: '12px', flex: 1, minHeight: 0, minWidth: 0, overflowY: 'auto' }}>
          <div
            style={{
              padding: '10px',
              borderRadius: 'var(--radius-md)',
              backgroundColor: 'var(--bg-input)',
              border: '1px solid var(--border-subtle)',
              marginBottom: '12px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)' }}>
                ACTIVE GOAL
              </div>
              {selectedTaskId && (
                <button
                  data-testid="clear-selected-task-btn"
                  onClick={() => {
                    setSelectedTaskId(null);
                    setSelectedTaskDetails(null);
                    setActiveGoal(null);
                    setTimelineEvents([]);
                  }}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--accent)',
                    fontSize: '10px',
                    cursor: 'pointer',
                    padding: 0,
                  }}
                >
                  + New Prompt
                </button>
              )}
            </div>
            <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)', marginTop: '4px' }}>
              {activeGoal ? (selectedTaskId ? `Task: ${activeGoal}` : 'Current Task') : 'Idle — Ready for prompt'}
            </div>
            <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '4px' }}>
              {activeGoal || 'Enter instructions below to have the agent analyze files, write code, or execute tests.'}
            </div>
            {selectedTaskDetails?.changeSet && (
              <button
                data-testid="review-past-diff-btn"
                onClick={() => {
                  const cs = selectedTaskDetails.changeSet;
                  if (!cs) return;
                  onReviewDiff?.(
                    cs.diffData || {
                      changeSetId: cs.id,
                      filePath: cs.changedFiles?.[0] || 'src/modified-file',
                      originalContent: '',
                      modifiedContent: cs.patch,
                    }
                  );
                }}
                style={{
                  marginTop: '8px',
                  padding: '4px 8px',
                  backgroundColor: 'var(--accent)',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: 'var(--radius-xs)',
                  fontSize: '11px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                }}
              >
                Review Staged Diff
              </button>
            )}
          </div>

          {/* Agent Activity Stream */}
          <ToolTimeline events={timelineEvents} onReviewDiff={onReviewDiff} />
        </div>
      )}

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
