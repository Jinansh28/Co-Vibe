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
  const { activeFilePath, openFile, closeFile, openFiles } = useEditorStore();
  const { fileTree, fetchTree, createFileOrFolder, deleteFileOrFolder } = useFiles(workspaceId);
  const [expandedFolders, setExpandedFolders] = useState<Record<string, boolean>>({});
  const [hoveredItemId, setHoveredItemId] = useState<string | null>(null);

  useEffect(() => {
    fetchTree();
  }, [fetchTree]);

  const handleCreate = async (type: 'file' | 'folder', basePath: string = '') => {
    const name = prompt(`Enter ${type} name${basePath ? ` (in ${basePath})` : ' (include path if needed)'}:`);
    if (name) {
      const fullPath = basePath ? `${basePath}/${name}` : name;
      await createFileOrFolder(fullPath, type);
      if (basePath) {
        setExpandedFolders(prev => ({ ...prev, [basePath]: true }));
      }
    }
  };

  const handleDelete = async (id: string, type: 'file' | 'folder') => {
    if (confirm(`Are you sure you want to delete ${id}?`)) {
      try {
        await deleteFileOrFolder(id);
        if (type === 'file') {
          closeFile(id);
        } else {
          openFiles.forEach(f => {
            if (f.startsWith(id + '/')) {
              closeFile(f);
            }
          });
        }
      } catch (err: any) {
        alert(err.message || 'Failed to delete');
      }
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
    const isHovered = hoveredItemId === item.id;

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
            setHoveredItemId(item.id);
            if (!isSelected) e.currentTarget.style.backgroundColor = 'var(--bg-hover)';
          }}
          onMouseLeave={(e) => {
            setHoveredItemId(null);
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
              flex: 1,
            }}
          >
            {item.name}
          </span>
          {(isSelected || isHovered) && (
            <div style={{ display: 'flex', alignItems: 'center', marginLeft: 'auto', gap: '2px' }}>
              {isFolder && (
                <>
                  <span
                    onClick={(e) => {
                      e.stopPropagation();
                      handleCreate('file', item.id);
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      color: 'var(--text-muted)',
                      padding: '2px',
                      borderRadius: '4px',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.color = 'var(--text-primary)';
                      e.currentTarget.style.backgroundColor = 'var(--bg-hover)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.color = 'var(--text-muted)';
                      e.currentTarget.style.backgroundColor = 'transparent';
                    }}
                    title="New File"
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" />
                      <polyline points="13 2 13 9 20 9" />
                      <line x1="12" y1="11" x2="12" y2="17" />
                      <line x1="9" y1="14" x2="15" y2="14" />
                    </svg>
                  </span>
                  <span
                    onClick={(e) => {
                      e.stopPropagation();
                      handleCreate('folder', item.id);
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      color: 'var(--text-muted)',
                      padding: '2px',
                      borderRadius: '4px',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.color = 'var(--text-primary)';
                      e.currentTarget.style.backgroundColor = 'var(--bg-hover)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.color = 'var(--text-muted)';
                      e.currentTarget.style.backgroundColor = 'transparent';
                    }}
                    title="New Folder"
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                      <line x1="12" y1="11" x2="12" y2="17" />
                      <line x1="9" y1="14" x2="15" y2="14" />
                    </svg>
                  </span>
                </>
              )}
              <span
                onClick={(e) => {
                  e.stopPropagation();
                  handleDelete(item.id, item.type);
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  color: 'var(--text-muted)',
                  padding: '2px',
                  borderRadius: '4px',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.color = 'var(--text-danger, #ef4444)';
                  e.currentTarget.style.backgroundColor = 'var(--bg-hover)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.color = 'var(--text-muted)';
                  e.currentTarget.style.backgroundColor = 'transparent';
                }}
                title={`Delete ${item.type}`}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M3 6h18" />
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                </svg>
              </span>
            </div>
          )}
        </div>

        {isFolder && isExpanded && item.children && (
          <div>{item.children.map((child) => renderItem(child, depth + 1))}</div>
        )}
      </div>
    );
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
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
            onClick={() => handleCreate('file')}
            title="New File"
            aria-label="New File"
            style={{
              padding: '2px 4px',
              color: 'var(--text-muted)',
              borderRadius: 'var(--radius-xs)',
              cursor: 'pointer',
              background: 'transparent',
              border: 'none',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--text-primary)'; e.currentTarget.style.background = 'var(--bg-hover)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-muted)'; e.currentTarget.style.background = 'transparent'; }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="12" y1="18" x2="12" y2="12" />
              <line x1="9" y1="15" x2="15" y2="15" />
            </svg>
          </button>
          <button
            onClick={() => handleCreate('folder')}
            title="New Folder"
            aria-label="New Folder"
            style={{
              padding: '2px 4px',
              color: 'var(--text-muted)',
              borderRadius: 'var(--radius-xs)',
              cursor: 'pointer',
              background: 'transparent',
              border: 'none',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--text-primary)'; e.currentTarget.style.background = 'var(--bg-hover)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-muted)'; e.currentTarget.style.background = 'transparent'; }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
              <line x1="12" y1="11" x2="12" y2="17" />
              <line x1="9" y1="14" x2="15" y2="14" />
            </svg>
          </button>
          <button
            onClick={() => fetchTree()}
            title="Refresh Explorer"
            aria-label="Refresh Explorer"
            style={{
              padding: '2px 4px',
              color: 'var(--text-muted)',
              borderRadius: 'var(--radius-xs)',
              cursor: 'pointer',
              background: 'transparent',
              border: 'none',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--text-primary)'; e.currentTarget.style.background = 'var(--bg-hover)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-muted)'; e.currentTarget.style.background = 'transparent'; }}
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
