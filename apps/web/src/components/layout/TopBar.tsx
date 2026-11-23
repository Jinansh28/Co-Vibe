import React from 'react';

interface TopBarProps {
  isSidebarOpen: boolean;
  onToggleSidebar: () => void;
  isTerminalOpen: boolean;
  onToggleTerminal: () => void;
  isAgentOpen: boolean;
  onToggleAgent: () => void;
  isPreviewOpen?: boolean;
  onTogglePreview?: () => void;
  activeFilePath?: string | null;
  onRunProject?: () => void;
  onRunTests?: () => void;
  onBackToDashboard?: () => void;
  onOpenQuickOpen?: () => void;
}

export const TopBar: React.FC<TopBarProps> = ({
  isSidebarOpen,
  onToggleSidebar,
  isTerminalOpen,
  onToggleTerminal,
  isAgentOpen,
  onToggleAgent,
  isPreviewOpen = false,
  onTogglePreview,
  activeFilePath,
  onRunProject,
  onRunTests,
  onBackToDashboard,
  onOpenQuickOpen,
}) => {
  const isHtmlActive = Boolean(
    activeFilePath && (activeFilePath.endsWith('.html') || activeFilePath.endsWith('.htm'))
  );
  return (
    <header
      style={{
        height: 'var(--topbar-height)',
        backgroundColor: 'var(--bg-panel-solid)',
        borderBottom: '1px solid var(--border-subtle)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 12px',
        userSelect: 'none',
        zIndex: 20,
      }}
    >
      {/* Left section: Panel toggle + Brand logo */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        {onBackToDashboard && (
          <button
            onClick={onBackToDashboard}
            title="Return to Projects Dashboard"
            aria-label="Back to Projects"
            style={{
              padding: '4px 8px',
              borderRadius: 'var(--radius-sm)',
              backgroundColor: 'transparent',
              border: '1px solid var(--border-subtle)',
              color: 'var(--text-secondary)',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              fontSize: '12px',
              cursor: 'pointer',
            }}
          >
            ← Projects
          </button>
        )}

        <button
          onClick={onToggleSidebar}
          title={isSidebarOpen ? 'Collapse Sidebar (Ctrl+B)' : 'Expand Sidebar (Ctrl+B)'}
          aria-label="Toggle Sidebar"
          style={{
            padding: '4px 8px',
            borderRadius: 'var(--radius-sm)',
            backgroundColor: isSidebarOpen ? 'var(--bg-selected)' : 'transparent',
            border: '1px solid var(--border-subtle)',
            color: isSidebarOpen ? 'var(--accent)' : 'var(--text-secondary)',
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            fontSize: '12px',
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <path d="M9 3v18" />
          </svg>
          Sidebar
        </button>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span
            style={{
              fontWeight: 700,
              fontSize: '14px',
              letterSpacing: '-0.3px',
              color: 'var(--text-primary)',
            }}
          >
            Co-Vibe
          </span>
          <span
            style={{
              fontSize: '10px',
              fontWeight: 600,
              padding: '2px 6px',
              borderRadius: 'var(--radius-xs)',
              backgroundColor: 'var(--accent-subtle)',
              color: 'var(--accent)',
              border: '1px solid rgba(91, 141, 239, 0.3)',
            }}
          >
            IDE
          </span>
        </div>

        <div
          style={{
            height: '16px',
            width: '1px',
            backgroundColor: 'var(--border-subtle)',
            margin: '0 4px',
          }}
        />

        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: 'var(--text-secondary)' }}>
          <span style={{ fontWeight: 500, color: 'var(--text-primary)' }}>Co-Vibe Workspace</span>
          <span style={{ color: 'var(--text-muted)' }}>/</span>
          <span
            style={{
              fontFamily: 'var(--font-code)',
              fontSize: '11px',
              padding: '1px 6px',
              backgroundColor: 'var(--bg-input)',
              borderRadius: 'var(--radius-xs)',
              border: '1px solid var(--border-subtle)',
            }}
          >
            main
          </span>
        </div>
      </div>

      {/* Center section: Execution controls & Quick Open */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <button
          onClick={onOpenQuickOpen}
          className="topbar-quick-open-btn"
          title="Search files across workspace (Ctrl+P / Cmd+P)"
          aria-label="Search files (Ctrl+P)"
          data-testid="topbar-quick-open-btn"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '4px 10px',
            backgroundColor: 'var(--bg-panel-raised)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-sm)',
            color: 'var(--text-muted)',
            fontSize: '12px',
            cursor: 'pointer',
            minWidth: '170px',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <span>Search files...</span>
          </div>
          <kbd
            style={{
              fontSize: '10px',
              fontFamily: 'var(--font-code)',
              padding: '1px 5px',
              backgroundColor: 'var(--bg-input)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-xs)',
              color: 'var(--text-secondary)',
            }}
          >
            Ctrl+P
          </kbd>
        </button>

        <button
          onClick={onRunProject}
          title="Run project application"
          aria-label="Run Project"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '4px 12px',
            backgroundColor: 'var(--success-subtle)',
            color: 'var(--success)',
            border: '1px solid rgba(63, 185, 80, 0.3)',
            borderRadius: 'var(--radius-sm)',
            fontWeight: 600,
            fontSize: '12px',
          }}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
            <polygon points="5,3 19,12 5,21" />
          </svg>
          Run
        </button>

        {isHtmlActive && onTogglePreview && (
          <button
            onClick={onTogglePreview}
            title={isPreviewOpen ? 'Hide HTML Preview' : 'Show Live HTML Preview'}
            aria-label="Preview"
            data-testid="preview-button"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '4px 10px',
              backgroundColor: isPreviewOpen ? 'var(--bg-selected)' : 'var(--bg-panel-raised)',
              color: isPreviewOpen ? 'var(--accent)' : 'var(--text-secondary)',
              border: isPreviewOpen ? '1px solid var(--accent)' : '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-sm)',
              fontSize: '12px',
              cursor: 'pointer',
              fontWeight: 500,
            }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
            <span>Preview</span>
          </button>
        )}

        <button
          onClick={onRunTests}
          title="Run test suites"
          aria-label="Run Tests"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '4px 10px',
            backgroundColor: 'var(--bg-panel-raised)',
            color: 'var(--text-secondary)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-sm)',
            fontSize: '12px',
          }}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
          </svg>
          Tests
        </button>
      </div>

      {/* Right section: Presence & Panel toggles */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        {/* Presence indicator badge */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '2px 8px',
            borderRadius: 'var(--radius-sm)',
            backgroundColor: 'var(--bg-input)',
            border: '1px solid var(--border-subtle)',
            fontSize: '11px',
            color: 'var(--text-secondary)',
          }}
        >
          <span
            style={{
              width: '6px',
              height: '6px',
              borderRadius: '50%',
              backgroundColor: 'var(--success)',
            }}
          />
          <span>Runtime Ready</span>
        </div>

        {/* Terminal Toggle Button */}
        <button
          onClick={onToggleTerminal}
          title={isTerminalOpen ? 'Hide Terminal Drawer' : 'Show Terminal Drawer'}
          aria-label="Toggle Terminal"
          style={{
            padding: '4px 8px',
            borderRadius: 'var(--radius-sm)',
            backgroundColor: isTerminalOpen ? 'var(--bg-selected)' : 'transparent',
            border: '1px solid var(--border-subtle)',
            color: isTerminalOpen ? 'var(--accent)' : 'var(--text-secondary)',
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            fontSize: '12px',
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="4 17 10 11 4 5" />
            <line x1="12" y1="19" x2="20" y2="19" />
          </svg>
          Terminal
        </button>

        {/* Agent Panel Toggle Button */}
        <button
          onClick={onToggleAgent}
          title={isAgentOpen ? 'Hide AI Agent Panel' : 'Show AI Agent Panel'}
          aria-label="Toggle Agent Panel"
          style={{
            padding: '4px 8px',
            borderRadius: 'var(--radius-sm)',
            backgroundColor: isAgentOpen ? 'var(--bg-selected)' : 'transparent',
            border: '1px solid var(--border-subtle)',
            color: isAgentOpen ? 'var(--accent)' : 'var(--text-secondary)',
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            fontSize: '12px',
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="11" width="18" height="10" rx="2" />
            <circle cx="12" cy="5" r="2" />
            <path d="M12 7v4" />
            <line x1="8" y1="16" x2="8.01" y2="16" strokeWidth="3" />
            <line x1="16" y1="16" x2="16.01" y2="16" strokeWidth="3" />
          </svg>
          AI Agent
        </button>
      </div>
    </header>
  );
};
