import React from 'react';
import { FileTree } from '../../features/editor/FileTree.js';

interface SidebarProps {
  isOpen: boolean;
  workspaceId?: string | null;
}

export const Sidebar: React.FC<SidebarProps> = ({
  isOpen,
  workspaceId,
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
      {/* File Tree List */}

      {/* File Tree List */}
      <FileTree workspaceId={workspaceId} />
    </aside>
  );
};
