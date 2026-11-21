import React from 'react';
import { AgentTaskProgressPayload } from '@co-vibe/protocol';

interface ToolTimelineProps {
  events: AgentTaskProgressPayload[];
  onReviewDiff?: (diffData: NonNullable<AgentTaskProgressPayload['diffData']>) => void;
}

export const ToolTimeline: React.FC<ToolTimelineProps> = ({ events, onReviewDiff }) => {
  if (!events || events.length === 0) {
    return (
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
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      {events.map((event, index) => (
        <div
          key={`${event.taskId}-${event.runId}-${index}`}
          style={{
            fontSize: '11px',
            padding: '8px 10px',
            borderRadius: 'var(--radius-sm)',
            backgroundColor: 'var(--bg-panel-raised)',
            border: '1px solid var(--border-subtle)',
            color: 'var(--text-secondary)',
          }}
        >
          <span style={{ color: 'var(--accent)', fontWeight: 600 }}>[{event.state}] </span> 
          <span style={{ fontWeight: 600 }}>{event.stepName}: </span>
          {event.message}
          {event.diffData && (
            <div style={{ marginTop: '8px' }}>
              <button
                type="button"
                data-testid="review-diff-button"
                onClick={() => onReviewDiff?.(event.diffData!)}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '4px 10px',
                  borderRadius: 'var(--radius-xs, 4px)',
                  backgroundColor: 'rgba(56, 189, 248, 0.15)',
                  color: 'var(--accent)',
                  border: '1px solid rgba(56, 189, 248, 0.35)',
                  fontSize: '11px',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                <span>🔍 Review Diff</span>
                <span style={{ opacity: 0.8, fontFamily: 'var(--font-code)' }}>({event.diffData.filePath})</span>
              </button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
};
