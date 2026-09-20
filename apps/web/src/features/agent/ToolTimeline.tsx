import React from 'react';
import { AgentTaskProgressPayload } from '@co-vibe/protocol';

interface ToolTimelineProps {
  events: AgentTaskProgressPayload[];
}

export const ToolTimeline: React.FC<ToolTimelineProps> = ({ events }) => {
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
        </div>
      ))}
    </div>
  );
};
