import React from 'react';

interface EditorPaneProps {
  activeFilePath?: string;
  onCloseTab?: () => void;
}

export const EditorPane: React.FC<EditorPaneProps> = ({
  activeFilePath = 'src/App.tsx',
  onCloseTab,
}) => {
  const fileName = activeFilePath.split('/').pop() || activeFilePath;

  return (
    <main
      style={{
        flex: 1,
        height: '100%',
        backgroundColor: 'var(--bg-app)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        position: 'relative',
      }}
    >
      {/* Editor Tab Bar */}
      <div
        style={{
          height: '34px',
          backgroundColor: 'var(--bg-panel-solid)',
          borderBottom: '1px solid var(--border-subtle)',
          display: 'flex',
          alignItems: 'center',
          paddingLeft: '4px',
          overflowX: 'auto',
          userSelect: 'none',
        }}
      >
        {/* Active Tab */}
        <div
          style={{
            height: '34px',
            padding: '0 12px',
            backgroundColor: 'var(--bg-app)',
            borderRight: '1px solid var(--border-subtle)',
            borderTop: '2px solid var(--accent)',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            fontSize: '12px',
            color: 'var(--text-primary)',
            fontFamily: 'var(--font-code)',
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2">
            <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" />
            <polyline points="13 2 13 9 20 9" />
          </svg>
          <span>{fileName}</span>
          <button
            onClick={onCloseTab}
            title="Close Tab"
            aria-label="Close Tab"
            style={{
              padding: '2px',
              borderRadius: 'var(--radius-xs)',
              color: 'var(--text-muted)',
              display: 'flex',
              alignItems: 'center',
            }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
      </div>

      {/* Main Code Editor Canvas Placeholder */}
      <div
        style={{
          flex: 1,
          display: 'flex',
          backgroundColor: '#0d1117',
          fontFamily: 'var(--font-code)',
          fontSize: '13px',
          lineHeight: '1.55',
          overflow: 'hidden',
          position: 'relative',
        }}
      >
        {/* Line Numbers Gutter */}
        <div
          style={{
            width: '48px',
            backgroundColor: '#0d1117',
            borderRight: '1px solid var(--border-subtle)',
            color: 'var(--text-disabled)',
            padding: '12px 0',
            textAlign: 'right',
            paddingRight: '12px',
            userSelect: 'none',
          }}
        >
          {Array.from({ length: 25 }, (_, i) => (
            <div key={i + 1}>{i + 1}</div>
          ))}
        </div>

        {/* Code Content Area */}
        <div
          style={{
            flex: 1,
            padding: '12px 16px',
            color: 'var(--text-primary)',
            overflowY: 'auto',
          }}
        >
          <div>
            <span style={{ color: '#ff7b72' }}>import </span>
            <span style={{ color: '#79c0ff' }}>React</span>
            <span style={{ color: '#c9d1d9' }}>, &#123; </span>
            <span style={{ color: '#79c0ff' }}>useState</span>
            <span style={{ color: '#c9d1d9' }}> &#125; </span>
            <span style={{ color: '#ff7b72' }}>from </span>
            <span style={{ color: '#a5d6ff' }}>'react'</span>
            <span style={{ color: '#c9d1d9' }}>;</span>
          </div>
          <div>
            <span style={{ color: '#ff7b72' }}>import </span>
            <span style={{ color: '#c9d1d9' }}>&#123; </span>
            <span style={{ color: '#79c0ff' }}>AppLayout</span>
            <span style={{ color: '#c9d1d9' }}> &#125; </span>
            <span style={{ color: '#ff7b72' }}>from </span>
            <span style={{ color: '#a5d6ff' }}>'./components/layout/AppLayout'</span>
            <span style={{ color: '#c9d1d9' }}>;</span>
          </div>
          <br />
          <div>
            <span style={{ color: '#8b949e' }}>// Co-Vibe IDE — Collaborative Editor Placeholder</span>
          </div>
          <div>
            <span style={{ color: '#ff7b72' }}>export default function </span>
            <span style={{ color: '#d2a8ff' }}>App</span>
            <span style={{ color: '#c9d1d9' }}>() &#123;</span>
          </div>
          <div style={{ paddingLeft: '20px' }}>
            <span style={{ color: '#ff7b72' }}>return </span>
            <span style={{ color: '#79c0ff' }}>&lt;AppLayout /&gt;</span>
            <span style={{ color: '#c9d1d9' }}>;</span>
          </div>
          <div>
            <span style={{ color: '#c9d1d9' }}>&#125;</span>
          </div>
        </div>

        {/* Remote Cursor Indicator Badge (Yjs Realtime Collaboration UX) */}
        <div
          style={{
            position: 'absolute',
            top: '84px',
            left: '280px',
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            padding: '2px 6px',
            backgroundColor: '#3fb950',
            color: '#0d1117',
            fontSize: '10px',
            fontWeight: 700,
            borderRadius: 'var(--radius-xs)',
            boxShadow: '0 2px 8px rgba(0,0,0,0.4)',
            pointerEvents: 'none',
          }}
        >
          <span>Alex (Editing)</span>
        </div>
      </div>

      {/* Bottom Status Bar */}
      <footer
        style={{
          height: 'var(--statusbar-height)',
          backgroundColor: 'var(--bg-panel-solid)',
          borderTop: '1px solid var(--border-subtle)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 12px',
          fontSize: '11px',
          color: 'var(--text-muted)',
          userSelect: 'none',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--text-secondary)' }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="6" y1="3" x2="6" y2="15" />
              <circle cx="18" cy="6" r="3" />
              <circle cx="6" cy="18" r="3" />
              <path d="M18 9a9 9 0 0 1-9 9" />
            </svg>
            main*
          </span>
          <span>Ln 14, Col 28</span>
          <span>Spaces: 2</span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span>UTF-8</span>
          <span>TypeScript React</span>
          <span style={{ color: 'var(--success)', fontWeight: 600 }}>● Yjs Synced</span>
        </div>
      </footer>
    </main>
  );
};
