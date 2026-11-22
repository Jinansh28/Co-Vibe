import React, { useState, useEffect, useRef } from 'react';

export interface InlineActionBubbleProps {
  filePath: string;
  selectedText: string;
  startLine: number;
  endLine: number;
  position: { top: number; left: number };
  onSubmit: (prompt: string, actionType?: 'explain' | 'refactor' | 'test' | 'custom') => void;
  onClose: () => void;
}

export const InlineActionBubble: React.FC<InlineActionBubbleProps> = ({
  filePath,
  selectedText,
  startLine,
  endLine,
  position,
  onSubmit,
  onClose,
}) => {
  const [prompt, setPrompt] = useState('');
  const bubbleRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Dismiss on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);

  // Dismiss on click outside bubble
  useEffect(() => {
    const handleMouseDown = (e: MouseEvent) => {
      if (bubbleRef.current && !bubbleRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleMouseDown);
    return () => {
      document.removeEventListener('mousedown', handleMouseDown);
    };
  }, [onClose]);

  const handleSubmitCustom = () => {
    const trimmed = prompt.trim();
    if (!trimmed) return;
    onSubmit(trimmed, 'custom');
  };

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSubmitCustom();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  };

  return (
    <div
      ref={bubbleRef}
      data-testid="inline-action-bubble"
      role="dialog"
      aria-label="AI Code Action"
      style={{
        position: 'absolute',
        top: Math.max(10, position.top),
        left: Math.max(16, position.left),
        width: '380px',
        maxWidth: 'calc(100% - 32px)',
        backgroundColor: 'var(--bg-panel-solid, #18181b)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        border: '1px solid var(--border-subtle, rgba(255, 255, 255, 0.15))',
        borderRadius: 'var(--radius-md, 8px)',
        boxShadow: '0 12px 32px rgba(0, 0, 0, 0.55), 0 0 0 1px rgba(255, 255, 255, 0.05)',
        padding: '12px',
        zIndex: 100,
        boxSizing: 'border-box',
        userSelect: 'none',
      }}
    >
      {/* Header with target file & line range badge + close button */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '10px',
        }}
      >
        <div
          data-testid="inline-action-badge"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            backgroundColor: 'var(--bg-panel-raised, rgba(255, 255, 255, 0.06))',
            padding: '2px 8px',
            borderRadius: 'var(--radius-xs, 4px)',
            border: '1px solid var(--border-subtle, rgba(255, 255, 255, 0.1))',
            fontSize: '11px',
            fontFamily: 'var(--font-code, monospace)',
            color: 'var(--accent, #58a6ff)',
            fontWeight: 600,
          }}
        >
          <span>
            [File: {filePath} (Lines {startLine}-{endLine})]
          </span>
        </div>

        <button
          onClick={onClose}
          aria-label="Close"
          title="Close (Esc)"
          data-testid="inline-action-close-btn"
          style={{
            background: 'none',
            border: 'none',
            color: 'var(--text-muted, #8b949e)',
            cursor: 'pointer',
            padding: '2px 4px',
            fontSize: '16px',
            lineHeight: 1,
            borderRadius: 'var(--radius-xs, 4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          ×
        </button>
      </div>

      {/* Input box */}
      <div style={{ position: 'relative', marginBottom: '10px' }}>
        <input
          ref={inputRef}
          data-testid="inline-action-input"
          type="text"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={handleInputKeyDown}
          placeholder="Ask AI about this code or choose an action below..."
          style={{
            width: '100%',
            backgroundColor: 'var(--bg-input, rgba(0, 0, 0, 0.35))',
            border: '1px solid var(--border-subtle, rgba(255, 255, 255, 0.15))',
            borderRadius: 'var(--radius-sm, 6px)',
            color: 'var(--text-primary, #ffffff)',
            padding: '8px 10px',
            fontSize: '12px',
            fontFamily: 'inherit',
            outline: 'none',
            boxSizing: 'border-box',
          }}
        />
      </div>

      {/* Quick Action Pills */}
      <div
        data-testid="inline-action-pills"
        style={{
          display: 'flex',
          gap: '6px',
          flexWrap: 'wrap',
          marginBottom: '8px',
        }}
      >
        <button
          type="button"
          data-testid="quick-action-explain"
          onClick={() =>
            onSubmit(
              'Explain what this code does and highlight edge cases.',
              'explain'
            )
          }
          title="Explain what this code does and highlight edge cases."
          style={{
            backgroundColor: 'var(--bg-panel-raised, rgba(255, 255, 255, 0.08))',
            border: '1px solid var(--border-subtle, rgba(255, 255, 255, 0.15))',
            borderRadius: '12px',
            padding: '4px 10px',
            fontSize: '11px',
            fontWeight: 500,
            color: 'var(--text-primary, #ffffff)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            transition: 'background-color 0.15s ease',
          }}
        >
          <span>⚡ Explain</span>
        </button>

        <button
          type="button"
          data-testid="quick-action-refactor"
          onClick={() =>
            onSubmit(
              'Refactor this code to clean, idiomatic TypeScript with strict types and error handling.',
              'refactor'
            )
          }
          title="Refactor this code to clean, idiomatic TypeScript with strict types and error handling."
          style={{
            backgroundColor: 'var(--bg-panel-raised, rgba(255, 255, 255, 0.08))',
            border: '1px solid var(--border-subtle, rgba(255, 255, 255, 0.15))',
            borderRadius: '12px',
            padding: '4px 10px',
            fontSize: '11px',
            fontWeight: 500,
            color: 'var(--text-primary, #ffffff)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            transition: 'background-color 0.15s ease',
          }}
        >
          <span>🛠️ Refactor</span>
        </button>

        <button
          type="button"
          data-testid="quick-action-test"
          onClick={() =>
            onSubmit(
              'Generate comprehensive unit tests using vitest for this selected code.',
              'test'
            )
          }
          title="Generate comprehensive unit tests using vitest for this selected code."
          style={{
            backgroundColor: 'var(--bg-panel-raised, rgba(255, 255, 255, 0.08))',
            border: '1px solid var(--border-subtle, rgba(255, 255, 255, 0.15))',
            borderRadius: '12px',
            padding: '4px 10px',
            fontSize: '11px',
            fontWeight: 500,
            color: 'var(--text-primary, #ffffff)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            transition: 'background-color 0.15s ease',
          }}
        >
          <span>🧪 Unit Tests</span>
        </button>
      </div>

      {/* Key Hints Footer */}
      <div
        data-testid="inline-action-hints"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          fontSize: '10px',
          color: 'var(--text-muted, #8b949e)',
          borderTop: '1px solid var(--border-subtle, rgba(255, 255, 255, 0.08))',
          paddingTop: '6px',
        }}
      >
        <span>
          <kbd style={{ fontFamily: 'var(--font-code, monospace)' }}>Esc</kbd> to close ·{' '}
          <kbd style={{ fontFamily: 'var(--font-code, monospace)' }}>↵</kbd> to submit
        </span>

        {prompt.trim() && (
          <button
            type="button"
            data-testid="inline-action-submit-btn"
            onClick={handleSubmitCustom}
            style={{
              backgroundColor: 'var(--accent, #58a6ff)',
              color: '#ffffff',
              border: 'none',
              borderRadius: 'var(--radius-xs, 4px)',
              padding: '2px 8px',
              fontSize: '10px',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Submit
          </button>
        )}
      </div>
    </div>
  );
};

export default InlineActionBubble;
