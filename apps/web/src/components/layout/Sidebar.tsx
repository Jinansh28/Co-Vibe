import React from 'react';
import { FileTree } from '../../features/editor/FileTree.js';

interface SidebarProps {
  isOpen: boolean;
}

export const Sidebar: React.FC<SidebarProps> = ({
  isOpen,
}) => {
  if (!isOpen) return null;

  return (
    <aside
      style={{
        width: '260px',
        minWidth: '200px',
        maxWidth: '400px',
        height: '100%',
        backgroundColor: 'var(--bg-panel-solid)',
        borderRight: '1px solid var(--border-subtle)',
        display: 'flex',
        flexDirection: 'column',
        userSelect: 'none',
        zIndex: 10,
      }}
    >
      {/* Sidebar Header */}
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
        <span
          style={{
            fontSize: '11px',
            fontWeight: 700,
            letterSpacing: '0.5px',
            color: 'var(--text-muted)',
            textTransform: 'uppercase',
          }}
        >
          Explorer
        </span>

        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <button
            title="New File"
            aria-label="New File"
            style={{
              padding: '2px 4px',
              color: 'var(--text-muted)',
              borderRadius: 'var(--radius-xs)',
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="12" y1="18" x2="12" y2="12" />
              <line x1="9" y1="15" x2="15" y2="15" />
            </svg>
          </button>
          <button
            title="Refresh Explorer"
            aria-label="Refresh Explorer"
            style={{
              padding: '2px 4px',
              color: 'var(--text-muted)',
              borderRadius: 'var(--radius-xs)',
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="23 4 23 10 17 10" />
              <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
            </svg>
          </button>
        </div>
      </div>

      {/* Workspace Directory Header */}
      <div
        style={{
          padding: '6px 12px',
          fontSize: '11px',
          fontWeight: 600,
          color: 'var(--text-secondary)',
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
        }}
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <polyline points="6 9 12 15 18 9" />
        </svg>
        <span style={{ textTransform: 'uppercase', letterSpacing: '0.3px' }}>Co-Vibe Monorepo</span>
      </div>

      {/* File Tree List */}
      <FileTree />
    </aside>
  );
};
