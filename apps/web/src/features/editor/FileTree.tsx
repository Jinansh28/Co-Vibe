import React, { useState, useEffect } from 'react';
import { useEditorStore } from './useEditorStore.js';
import { useFiles } from './useFiles.js';

export interface FileItem {
  id: string;
  name: string;
  type: 'file' | 'folder';
  children?: FileItem[];
}

interface FileTreeProps {
  workspaceId?: string | null;
}

export const FileTree: React.FC<FileTreeProps> = ({ workspaceId }) => {
  const { activeFilePath, openFile } = useEditorStore();
  const { fileTree, fetchTree, createFileOrFolder } = useFiles(workspaceId);
  const [expandedFolders, setExpandedFolders] = useState<Record<string, boolean>>({});

  useEffect(() => {
    fetchTree();
  }, [fetchTree]);

  const handleCreate = async (type: 'file' | 'folder') => {
    const name = prompt(`Enter ${type} name (include path if needed):`);
    if (name) {
      await createFileOrFolder(name, type);
    }
  };

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
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ display: 'flex', gap: '8px', padding: '8px 12px', borderBottom: '1px solid var(--border-subtle)' }}>
        <button
          onClick={() => handleCreate('file')}
          style={{ fontSize: '11px', background: 'var(--bg-hover)', border: '1px solid var(--border-subtle)', borderRadius: '4px', padding: '4px 8px', cursor: 'pointer', color: 'var(--text-primary)' }}
        >
          + File
        </button>
        <button
          onClick={() => handleCreate('folder')}
          style={{ fontSize: '11px', background: 'var(--bg-hover)', border: '1px solid var(--border-subtle)', borderRadius: '4px', padding: '4px 8px', cursor: 'pointer', color: 'var(--text-primary)' }}
        >
          + Folder
        </button>
        <button
          onClick={() => fetchTree()}
          style={{ fontSize: '11px', background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', marginLeft: 'auto' }}
          title="Refresh"
        >
          ↻
        </button>
      </div>
      <div style={{ paddingTop: '4px', overflowY: 'auto', flex: 1 }}>
        {fileTree.length === 0 ? (
          <div style={{ padding: '12px', color: 'var(--text-muted)', fontSize: '12px' }}>Loading or empty...</div>
        ) : (
          fileTree.map((item) => renderItem(item))
        )}
      </div>
    </div>
  );
};
