import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useEditorStore } from './useEditorStore.js';
import { fuzzyFilterFiles, type FuzzyMatchResult } from './fuzzySearch.js';
import { useFiles, flattenFileTree } from './useFiles.js';

export interface QuickOpenModalProps {
  isOpen: boolean;
  onClose: () => void;
  files?: string[];
  workspaceId?: string | null;
}

/**
 * Helper to render highlighted text given matched character index set
 */
function renderHighlightedParts(text: string, matchedSet: Set<number>, isBold = false): React.ReactNode {
  if (matchedSet.size === 0) {
    return text;
  }

  const nodes: React.ReactNode[] = [];
  let currentRun = '';
  let currentIsMatched = false;

  for (let i = 0; i < text.length; i++) {
    const isMatched = matchedSet.has(i);
    if (i === 0) {
      currentIsMatched = isMatched;
      currentRun = text[i];
    } else if (isMatched === currentIsMatched) {
      currentRun += text[i];
    } else {
      nodes.push(
        currentIsMatched ? (
          <span
            key={i}
            style={{
              color: 'var(--accent)',
              fontWeight: 700,
              textDecoration: isBold ? 'underline' : 'none',
              textUnderlineOffset: '2px',
            }}
          >
            {currentRun}
          </span>
        ) : (
          <span key={i}>{currentRun}</span>
        )
      );
      currentIsMatched = isMatched;
      currentRun = text[i];
    }
  }

  if (currentRun) {
    nodes.push(
      currentIsMatched ? (
        <span
          key="tail"
          style={{
            color: 'var(--accent)',
            fontWeight: 700,
            textDecoration: isBold ? 'underline' : 'none',
            textUnderlineOffset: '2px',
          }}
        >
          {currentRun}
        </span>
      ) : (
        <span key="tail">{currentRun}</span>
      )
    );
  }

  return nodes;
}

/**
 * File extension badge/icon helper
 */
const FileTypeBadge: React.FC<{ fileName: string }> = ({ fileName }) => {
  const ext = fileName.includes('.') ? fileName.split('.').pop()?.toLowerCase() || '' : '';

  let color = 'var(--text-muted)';
  let bg = 'rgba(255, 255, 255, 0.05)';
  let label = ext.toUpperCase() || 'FILE';

  switch (ext) {
    case 'tsx':
    case 'ts':
      color = '#3178c6';
      bg = 'rgba(49, 120, 198, 0.15)';
      break;
    case 'jsx':
    case 'js':
      color = '#f7df1e';
      bg = 'rgba(247, 223, 30, 0.15)';
      break;
    case 'html':
    case 'htm':
      color = '#e34f26';
      bg = 'rgba(227, 79, 38, 0.15)';
      break;
    case 'css':
    case 'scss':
      color = '#264de4';
      bg = 'rgba(38, 77, 228, 0.15)';
      break;
    case 'json':
      color = '#cbba27';
      bg = 'rgba(203, 186, 39, 0.15)';
      break;
    case 'md':
      color = '#b07219';
      bg = 'rgba(176, 114, 25, 0.15)';
      break;
    case 'py':
      color = '#3572a5';
      bg = 'rgba(53, 114, 165, 0.15)';
      break;
    default:
      label = ext ? ext.slice(0, 3).toUpperCase() : 'FILE';
      break;
  }

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        minWidth: '28px',
        height: '16px',
        padding: '0 4px',
        fontSize: '9px',
        fontWeight: 700,
        fontFamily: 'var(--font-code)',
        color,
        backgroundColor: bg,
        borderRadius: 'var(--radius-xs)',
        border: `1px solid ${color}33`,
        letterSpacing: '0.2px',
        flexShrink: 0,
      }}
    >
      {label}
    </span>
  );
};

export const QuickOpenModal: React.FC<QuickOpenModalProps> = ({
  isOpen,
  onClose,
  files: propFiles,
  workspaceId,
}) => {
  const { openFiles, openFile } = useEditorStore();
  const { fileTree } = useFiles(workspaceId);

  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);

  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Derive file paths list from prop or hook
  const allFiles = useMemo(() => {
    if (propFiles && propFiles.length > 0) return propFiles;
    if (fileTree && fileTree.length > 0) return flattenFileTree(fileTree);
    return [];
  }, [propFiles, fileTree]);

  // Compute fuzzy search results
  const results: FuzzyMatchResult[] = useMemo(() => {
    return fuzzyFilterFiles(allFiles, query, openFiles);
  }, [allFiles, query, openFiles]);

  // Focus search input and reset query on modal opening
  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
      const timer = setTimeout(() => {
        inputRef.current?.focus();
      }, 20);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  // Reset selected index when query or results change
  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  // Keep active item scrolled into view
  useEffect(() => {
    if (listRef.current) {
      const activeEl = listRef.current.querySelector<HTMLElement>(`[data-index="${selectedIndex}"]`);
      activeEl?.scrollIntoView?.({ block: 'nearest' });
    }
  }, [selectedIndex]);

  const handleSelect = useCallback(
    (filePath: string) => {
      openFile(filePath);
      onClose();
    },
    [openFile, onClose]
  );

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (results.length > 0 ? (prev + 1) % results.length : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) =>
        results.length > 0 ? (prev - 1 + results.length) % results.length : 0
      );
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (results.length > 0 && results[selectedIndex]) {
        handleSelect(results[selectedIndex].path);
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div
      data-testid="quick-open-overlay"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'flex-start',
        paddingTop: '60px',
      }}
    >
      {/* Backdrop */}
      <div
        data-testid="quick-open-backdrop"
        onClick={onClose}
        style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.55)',
          backdropFilter: 'blur(3px)',
          WebkitBackdropFilter: 'blur(3px)',
        }}
      />

      {/* Floating Modal Card */}
      <div
        data-testid="quick-open-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Quick Open Files"
        onClick={(e) => e.stopPropagation()}
        style={{
          position: 'relative',
          width: 'min(620px, 92vw)',
          backgroundColor: 'var(--bg-panel-solid)',
          border: '1px solid var(--border-default)',
          borderRadius: 'var(--radius-md)',
          boxShadow: '0 16px 40px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255, 255, 255, 0.05)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          zIndex: 10000,
        }}
      >
        {/* Search Input Bar */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            padding: '10px 14px',
            borderBottom: '1px solid var(--border-subtle)',
            backgroundColor: 'var(--bg-input)',
          }}
        >
          <span style={{ color: 'var(--text-muted)', display: 'flex', alignItems: 'center' }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
          </span>

          <input
            ref={inputRef}
            data-testid="quick-open-input"
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search files by name (e.g. applay or layout/top)..."
            style={{
              flex: 1,
              background: 'transparent',
              border: 'none',
              outline: 'none',
              color: 'var(--text-primary)',
              fontSize: '13px',
              fontFamily: 'var(--font-ui)',
            }}
          />

          <kbd
            style={{
              fontSize: '10px',
              fontFamily: 'var(--font-code)',
              padding: '1px 5px',
              backgroundColor: 'var(--bg-panel-raised)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-xs)',
              color: 'var(--text-muted)',
            }}
          >
            Esc
          </kbd>
        </div>

        {/* Results List */}
        <div
          ref={listRef}
          data-testid="quick-open-results"
          role="listbox"
          style={{
            maxHeight: '380px',
            overflowY: 'auto',
            padding: '4px 0',
          }}
        >
          {results.length === 0 ? (
            <div
              data-testid="quick-open-empty"
              style={{
                padding: '28px 16px',
                textAlign: 'center',
                color: 'var(--text-muted)',
                fontSize: '12px',
              }}
            >
              No matching files found
            </div>
          ) : (
            results.map((item, index) => {
              const isSelected = index === selectedIndex;
              const isOpenTab = openFiles.includes(item.path);

              // Prepare highlight sets
              const dirLen = item.directory.length;
              const dirMatchedSet = new Set<number>();
              const fileMatchedSet = new Set<number>();

              for (const idx of item.matchedIndices) {
                if (idx < dirLen) {
                  dirMatchedSet.add(idx);
                } else {
                  fileMatchedSet.add(idx - dirLen);
                }
              }

              return (
                <div
                  key={item.path}
                  data-testid={`quick-open-item-${index}`}
                  data-filepath={item.path}
                  data-index={index}
                  role="option"
                  aria-selected={isSelected}
                  onClick={() => handleSelect(item.path)}
                  onMouseEnter={() => setSelectedIndex(index)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '6px 12px',
                    backgroundColor: isSelected ? 'var(--bg-selected)' : 'transparent',
                    borderLeft: isSelected ? '2px solid var(--accent)' : '2px solid transparent',
                    cursor: 'pointer',
                    userSelect: 'none',
                    gap: '12px',
                    transition: 'background-color 0.1s ease',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    <FileTypeBadge fileName={item.fileName} />

                    <span
                      style={{
                        fontWeight: 600,
                        fontSize: '12.5px',
                        color: isSelected ? 'var(--text-primary)' : 'var(--text-secondary)',
                      }}
                    >
                      {renderHighlightedParts(item.fileName, fileMatchedSet, true)}
                    </span>

                    {item.directory && (
                      <span
                        style={{
                          fontSize: '11px',
                          color: 'var(--text-muted)',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}
                      >
                        {renderHighlightedParts(item.directory, dirMatchedSet, false)}
                      </span>
                    )}
                  </div>

                  {isOpenTab && (
                    <span
                      data-testid={`quick-open-open-badge-${index}`}
                      style={{
                        fontSize: '10px',
                        color: 'var(--accent)',
                        backgroundColor: 'var(--accent-subtle)',
                        padding: '1px 5px',
                        borderRadius: 'var(--radius-xs)',
                        fontWeight: 500,
                        flexShrink: 0,
                      }}
                    >
                      open
                    </span>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
