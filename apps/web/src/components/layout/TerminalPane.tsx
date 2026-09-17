import React, { useState } from 'react';

interface TerminalPaneProps {
  isOpen: boolean;
  onClose?: () => void;
}

export const TerminalPane: React.FC<TerminalPaneProps> = ({ isOpen, onClose }) => {
  const [activeTab, setActiveTab] = useState<'terminal' | 'output' | 'problems' | 'tests'>('terminal');

  if (!isOpen) return null;

  return (
    <section
      style={{
        height: '200px',
        minHeight: '120px',
        maxHeight: '400px',
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
              }}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* Action Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <button
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

      {/* Terminal Stream Output */}
      <div
        style={{
          flex: 1,
          padding: '8px 12px',
          fontFamily: 'var(--font-code)',
          fontSize: '12px',
          color: 'var(--text-primary)',
          backgroundColor: '#0a0f14',
          overflowY: 'auto',
          lineHeight: '1.5',
        }}
      >
        {activeTab === 'terminal' && (
          <div>
            <div style={{ color: 'var(--text-muted)' }}>$ pnpm --filter web dev</div>
            <div style={{ color: 'var(--accent)' }}>VITE v5.4.10 ready in 240 ms</div>
            <div style={{ color: 'var(--text-secondary)' }}>
              ➜ Local: <span style={{ color: 'var(--info)' }}>http://localhost:5173/</span>
            </div>
            <div style={{ color: 'var(--success)' }}>✓ Local daemon connected on ws://127.0.0.1:7890/ws/runtime</div>
          </div>
        )}
        {activeTab === 'output' && <div style={{ color: 'var(--text-muted)' }}>[System Log] Container sandbox ready.</div>}
        {activeTab === 'problems' && <div style={{ color: 'var(--success)' }}>No diagnostics or errors detected.</div>}
        {activeTab === 'tests' && <div style={{ color: 'var(--success)' }}>✓ 6 test suites passed (21 tests)</div>}
      </div>
    </section>
  );
};
