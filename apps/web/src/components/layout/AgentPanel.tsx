import React, { useState } from 'react';

interface AgentPanelProps {
  isOpen: boolean;
  onClose?: () => void;
}

export const AgentPanel: React.FC<AgentPanelProps> = ({ isOpen, onClose }) => {
  const [prompt, setPrompt] = useState('');

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
              backgroundColor: 'var(--success-subtle)',
              color: 'var(--success)',
              border: '1px solid rgba(63, 185, 80, 0.3)',
            }}
          >
            Ready
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
        <span style={{ color: 'var(--text-muted)' }}>Model:</span>
        <span
          style={{
            fontFamily: 'var(--font-code)',
            fontSize: '11px',
            color: 'var(--accent)',
            fontWeight: 600,
          }}
        >
          qwen2.5-coder:7b
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
            TASK-004 — IDE Shell Layout
          </div>
          <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '4px' }}>
            Building responsive grid layout with collapsible panels.
          </div>
        </div>

        {/* Agent Activity Stream */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div
            style={{
              fontSize: '11px',
              padding: '8px 10px',
              borderRadius: 'var(--radius-sm)',
              backgroundColor: 'var(--bg-panel-raised)',
              border: '1px solid var(--border-subtle)',
              color: 'var(--text-secondary)',
            }}
          >
            <span style={{ color: 'var(--accent)', fontWeight: 600 }}>[System]</span> Workspace loaded and ready for task commands.
          </div>
        </div>
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
            placeholder="Ask agent to generate, modify, or run tests..."
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
            }}
          />
          <button
            title="Send prompt to agent"
            aria-label="Send prompt"
            disabled={!prompt.trim()}
            style={{
              position: 'absolute',
              bottom: '8px',
              right: '8px',
              padding: '4px 8px',
              borderRadius: 'var(--radius-xs)',
              backgroundColor: prompt.trim() ? 'var(--accent)' : 'var(--border-subtle)',
              color: prompt.trim() ? '#ffffff' : 'var(--text-disabled)',
              fontSize: '11px',
              fontWeight: 600,
            }}
          >
            Send
          </button>
        </div>
      </div>
    </aside>
  );
};
