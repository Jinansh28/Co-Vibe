import React, { useState } from 'react';
import { useEditorStore } from './useEditorStore.js';

export interface FileItem {
  id: string;
  name: string;
  type: 'file' | 'folder';
  children?: FileItem[];
}

const mockFiles: FileItem[] = [
  {
    id: 'src',
    name: 'src',
    type: 'folder',
    children: [
      { id: 'src/App.tsx', name: 'App.tsx', type: 'file' },
      { id: 'src/main.tsx', name: 'main.tsx', type: 'file' },
      { id: 'src/index.css', name: 'index.css', type: 'file' },
    ],
  },
  {
    id: 'packages',
    name: 'packages',
    type: 'folder',
    children: [
      { id: 'packages/protocol', name: 'protocol', type: 'folder', children: [{ id: 'packages/protocol/envelope.ts', name: 'envelope.ts', type: 'file' }] },
      { id: 'packages/shared', name: 'shared', type: 'folder', children: [{ id: 'packages/shared/types.ts', name: 'types.ts', type: 'file' }] },
    ],
  },
  { id: 'package.json', name: 'package.json', type: 'file' },
  { id: 'tsconfig.json', name: 'tsconfig.json', type: 'file' },
  { id: 'README.md', name: 'README.md', type: 'file' },
];

export const FileTree: React.FC = () => {
  const { activeFilePath, openFile } = useEditorStore();
  const [expandedFolders, setExpandedFolders] = useState<Record<string, boolean>>({
    src: true,
    packages: false,
  });

  const toggleFolder = (folderId: string) => {
    setExpandedFolders((prev) => ({
      ...prev,
      [folderId]: !prev[folderId],
    }));
  };

  const renderItem = (item: FileItem, depth = 0) => {
    const isFolder = item.type === 'folder';
    const isExpanded = expandedFolders[item.id];
    const isSelected = activeFilePath === item.id;

    return (
      <div key={item.id}>
        <div
          onClick={() => {
            if (isFolder) {
              toggleFolder(item.id);
            } else {
              openFile(item.id);
            }
          }}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            paddingLeft: `${12 + depth * 14}px`,
            paddingRight: '12px',
            height: '24px',
            cursor: 'pointer',
            backgroundColor: isSelected ? 'var(--bg-selected)' : 'transparent',
            color: isSelected ? 'var(--text-primary)' : 'var(--text-secondary)',
            fontSize: '12px',
            userSelect: 'none',
            borderRadius: 'var(--radius-xs)',
            transition: 'background-color 0.1s ease',
          }}
          onMouseEnter={(e) => {
            if (!isSelected) e.currentTarget.style.backgroundColor = 'var(--bg-hover)';
          }}
          onMouseLeave={(e) => {
            if (!isSelected) e.currentTarget.style.backgroundColor = 'transparent';
          }}
        >
          {isFolder ? (
            <span style={{ display: 'flex', alignItems: 'center', color: 'var(--text-muted)' }}>
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                style={{
                  transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
                  transition: 'transform 0.15s ease',
                }}
              >
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </span>
          ) : (
            <span style={{ width: '12px' }} />
          )}

          <span style={{ color: isFolder ? 'var(--accent)' : 'var(--text-muted)', display: 'flex' }}>
            {isFolder ? (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
              </svg>
            ) : (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" />
                <polyline points="13 2 13 9 20 9" />
              </svg>
            )}
          </span>

          <span
            style={{
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              fontFamily: isFolder ? 'inherit' : 'var(--font-code)',
              fontSize: isFolder ? '12px' : '11.5px',
            }}
          >
            {item.name}
          </span>
        </div>

        {isFolder && isExpanded && item.children && (
          <div>{item.children.map((child) => renderItem(child, depth + 1))}</div>
        )}
      </div>
    );
  };

  return (
    <div style={{ paddingTop: '4px', overflowY: 'auto', flex: 1 }}>
      {mockFiles.map((item) => renderItem(item))}
    </div>
  );
};
