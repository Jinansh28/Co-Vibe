import React, { useState } from 'react';
import { FileTree } from '../../features/editor/FileTree.js';
import { ResizeHandle, clampSize } from './ResizeHandle.js';

const DEFAULT_SIDEBAR_WIDTH = 260;
const DEFAULT_SIDEBAR_MIN_WIDTH = 180;
const DEFAULT_SIDEBAR_MAX_WIDTH = 480;

interface SidebarProps {
  isOpen: boolean;
  workspaceId?: string | null;
  width?: number;
  minWidth?: number;
  maxWidth?: number;
  onResize?: (width: number) => void;
  onResetWidth?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  isOpen,
  workspaceId,
  width,
  minWidth = DEFAULT_SIDEBAR_MIN_WIDTH,
  maxWidth = DEFAULT_SIDEBAR_MAX_WIDTH,
  onResize,
  onResetWidth,
}) => {
  const [internalWidth, setInternalWidth] = useState(DEFAULT_SIDEBAR_WIDTH);

  if (!isOpen) return null;

  const effectiveWidth = clampSize(width ?? internalWidth, minWidth, maxWidth);
  const handleResize = onResize ?? setInternalWidth;
  const handleReset = onResetWidth ?? (() => setInternalWidth(DEFAULT_SIDEBAR_WIDTH));

  return (
    <aside
      data-testid="sidebar-panel"
      style={{
        position: 'relative',
        width: `${effectiveWidth}px`,
        flexShrink: 0,
        height: '100%',
        backgroundColor: 'var(--bg-panel-solid)',
        borderRight: '1px solid var(--border-subtle)',
        display: 'flex',
        flexDirection: 'column',
        userSelect: 'none',
        zIndex: 10,
      }}
    >
      <div
        style={{
          flex: 1,
          minWidth: 0,
          minHeight: 0,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        <FileTree workspaceId={workspaceId} />
      </div>

      <ResizeHandle
        edge="right"
        currentSize={effectiveWidth}
        minSize={minWidth}
        maxSize={maxWidth}
        onResize={handleResize}
        onReset={handleReset}
        label="Resize File Explorer Sidebar"
        testId="sidebar-resize-handle"
      />
    </aside>
  );
};
