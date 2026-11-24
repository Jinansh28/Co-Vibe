import React, { useState, useMemo } from 'react';
import { useDiagnosticsStore, DiagnosticItem } from './useDiagnosticsStore.js';
import { useEditorStore } from './useEditorStore.js';

export interface ProblemsViewProps {
  onNavigateToFile?: (filePath: string, line: number, column: number) => void;
  onFixWithAI?: (item: DiagnosticItem) => void;
  onFixAllWithAI?: (items: DiagnosticItem[]) => void;
}

export const ProblemsView: React.FC<ProblemsViewProps> = ({
  onNavigateToFile,
  onFixWithAI,
  onFixAllWithAI,
}) => {
  const diagnostics = useDiagnosticsStore((s) => s.diagnostics);
  const [filterSeverity, setFilterSeverity] = useState<'all' | 'error' | 'warning' | 'info'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});

  const totalCount = diagnostics.length;
  const errorCount = useMemo(() => diagnostics.filter((d) => d.severity === 'error').length, [diagnostics]);
  const warningCount = useMemo(() => diagnostics.filter((d) => d.severity === 'warning').length, [diagnostics]);
  const infoCount = useMemo(() => diagnostics.filter((d) => d.severity === 'info').length, [diagnostics]);

  // Filter diagnostics based on severity and search query
  const filteredDiagnostics = useMemo(() => {
    return diagnostics.filter((item) => {
      if (filterSeverity !== 'all' && item.severity !== filterSeverity) {
        return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesMsg = item.message.toLowerCase().includes(q);
        const matchesFile = item.filePath.toLowerCase().includes(q);
        const matchesCode = item.code ? item.code.toLowerCase().includes(q) : false;
        return matchesMsg || matchesFile || matchesCode;
      }
      return true;
    });
  }, [diagnostics, filterSeverity, searchQuery]);

  // Group filtered diagnostics by filePath
  const groupedDiagnostics = useMemo(() => {
    const groups: Record<string, DiagnosticItem[]> = {};
    for (const item of filteredDiagnostics) {
      if (!groups[item.filePath]) {
        groups[item.filePath] = [];
      }
      groups[item.filePath].push(item);
    }
    return groups;
  }, [filteredDiagnostics]);

  const toggleGroupCollapse = (filePath: string) => {
    setCollapsedGroups((prev) => ({
      ...prev,
      [filePath]: !prev[filePath],
    }));
  };

  const handleRowClick = (item: DiagnosticItem) => {
    if (onNavigateToFile) {
      onNavigateToFile(item.filePath, item.startLineNumber, item.startColumn);
    } else {
      useEditorStore.getState().navigateToPosition(item.filePath, item.startLineNumber, item.startColumn);
    }
  };

  const handleFixAll = () => {
    const errorItems = diagnostics.filter((d) => d.severity === 'error');
    if (onFixAllWithAI) {
      onFixAllWithAI(errorItems);
    } else if (onFixWithAI && errorItems.length > 0) {
      onFixWithAI(errorItems[0]);
    }
  };

  // If no diagnostics exist at all across the workspace
  if (totalCount === 0) {
    return (
      <div
        data-testid="problems-empty-state"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100%',
          minHeight: '120px',
          color: 'var(--success, #3fb950)',
          fontSize: '12px',
          fontFamily: 'var(--font-code, monospace)',
          gap: '8px',
        }}
      >
        <span style={{ fontSize: '14px', fontWeight: 'bold' }}>✓</span>
        <span>No diagnostics or errors detected.</span>
      </div>
    );
  }

  const renderSeverityIcon = (severity: DiagnosticItem['severity']) => {
    switch (severity) {
      case 'error':
        return (
          <span
            data-testid="severity-icon-error"
            title="Error"
            style={{
              color: 'var(--error, #f85149)',
              fontWeight: 'bold',
              fontSize: '13px',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '16px',
            }}
          >
            ✕
          </span>
        );
      case 'warning':
        return (
          <span
            data-testid="severity-icon-warning"
            title="Warning"
            style={{
              color: 'var(--warning, #d29922)',
              fontWeight: 'bold',
              fontSize: '13px',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '16px',
            }}
          >
            ⚠
          </span>
        );
      case 'info':
      default:
        return (
          <span
            data-testid="severity-icon-info"
            title="Info"
            style={{
              color: 'var(--info, #58a6ff)',
              fontWeight: 'bold',
              fontSize: '13px',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '16px',
            }}
          >
            ℹ
          </span>
        );
    }
  };

  return (
    <div
      data-testid="problems-view"
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        color: 'var(--text-primary, #c9d1d9)',
        fontFamily: 'var(--font-code, monospace)',
        fontSize: '12px',
      }}
    >
      {/* Filter and Action Toolbar */}
      <div
        data-testid="problems-toolbar"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '6px 10px',
          borderBottom: '1px solid var(--border-subtle, #30363d)',
          backgroundColor: 'var(--bg-panel-raised, #161b22)',
          gap: '8px',
          flexWrap: 'wrap',
        }}
      >
        {/* Severity Filter Toggles */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <button
            data-testid="filter-all-btn"
            onClick={() => setFilterSeverity('all')}
            style={{
              padding: '2px 8px',
              borderRadius: 'var(--radius-xs, 3px)',
              fontSize: '11px',
              border: 'none',
              cursor: 'pointer',
              backgroundColor: filterSeverity === 'all' ? 'var(--bg-panel-solid, #21262d)' : 'transparent',
              color: filterSeverity === 'all' ? 'var(--text-primary, #ffffff)' : 'var(--text-muted, #8b949e)',
              fontWeight: filterSeverity === 'all' ? 600 : 400,
            }}
          >
            All ({totalCount})
          </button>
          <button
            data-testid="filter-errors-btn"
            onClick={() => setFilterSeverity('error')}
            style={{
              padding: '2px 8px',
              borderRadius: 'var(--radius-xs, 3px)',
              fontSize: '11px',
              border: 'none',
              cursor: 'pointer',
              backgroundColor: filterSeverity === 'error' ? 'rgba(248, 81, 73, 0.15)' : 'transparent',
              color: filterSeverity === 'error' ? 'var(--error, #f85149)' : 'var(--text-muted, #8b949e)',
              fontWeight: filterSeverity === 'error' ? 600 : 400,
            }}
          >
            Errors ({errorCount})
          </button>
          <button
            data-testid="filter-warnings-btn"
            onClick={() => setFilterSeverity('warning')}
            style={{
              padding: '2px 8px',
              borderRadius: 'var(--radius-xs, 3px)',
              fontSize: '11px',
              border: 'none',
              cursor: 'pointer',
              backgroundColor: filterSeverity === 'warning' ? 'rgba(210, 153, 34, 0.15)' : 'transparent',
              color: filterSeverity === 'warning' ? 'var(--warning, #d29922)' : 'var(--text-muted, #8b949e)',
              fontWeight: filterSeverity === 'warning' ? 600 : 400,
            }}
          >
            Warnings ({warningCount})
          </button>
          {infoCount > 0 && (
            <button
              data-testid="filter-info-btn"
              onClick={() => setFilterSeverity('info')}
              style={{
                padding: '2px 8px',
                borderRadius: 'var(--radius-xs, 3px)',
                fontSize: '11px',
                border: 'none',
                cursor: 'pointer',
                backgroundColor: filterSeverity === 'info' ? 'rgba(88, 166, 255, 0.15)' : 'transparent',
                color: filterSeverity === 'info' ? 'var(--info, #58a6ff)' : 'var(--text-muted, #8b949e)',
                fontWeight: filterSeverity === 'info' ? 600 : 400,
              }}
            >
              Info ({infoCount})
            </button>
          )}
        </div>

        {/* Search input & Fix All Action */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <input
            data-testid="problems-search-input"
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Filter problems..."
            style={{
              background: '#0a0f14',
              border: '1px solid var(--border-subtle, #30363d)',
              borderRadius: 'var(--radius-xs, 3px)',
              color: 'var(--text-primary, #c9d1d9)',
              padding: '2px 8px',
              fontSize: '11px',
              outline: 'none',
              width: '160px',
            }}
          />
          {errorCount > 1 && (
            <button
              data-testid="fix-all-with-ai-btn"
              onClick={handleFixAll}
              title="Fix all errors with AI Agent"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                padding: '3px 10px',
                fontSize: '11px',
                fontWeight: 600,
                color: '#ffffff',
                backgroundColor: 'var(--accent, #6366f1)',
                border: 'none',
                borderRadius: 'var(--radius-xs, 3px)',
                cursor: 'pointer',
                transition: 'opacity 0.15s ease',
              }}
            >
              <span>⚡ Fix All with AI ({errorCount})</span>
            </button>
          )}
        </div>
      </div>

      {/* Grouped Problem List */}
      <div
        data-testid="problems-list"
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '4px 0',
        }}
      >
        {Object.keys(groupedDiagnostics).length === 0 ? (
          <div
            data-testid="problems-no-results"
            style={{
              padding: '16px',
              color: 'var(--text-muted, #8b949e)',
              textAlign: 'center',
            }}
          >
            No diagnostics match current filter.
          </div>
        ) : (
          Object.entries(groupedDiagnostics).map(([filePath, items]) => {
            const isCollapsed = collapsedGroups[filePath] ?? false;
            const fileErrors = items.filter((i) => i.severity === 'error').length;
            const fileWarnings = items.filter((i) => i.severity === 'warning').length;

            return (
              <div key={filePath} style={{ marginBottom: '6px' }}>
                {/* File Group Header */}
                <div
                  data-testid={`file-group-${filePath}`}
                  onClick={() => toggleGroupCollapse(filePath)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    padding: '4px 10px',
                    backgroundColor: 'rgba(255, 255, 255, 0.03)',
                    cursor: 'pointer',
                    userSelect: 'none',
                    gap: '6px',
                    fontWeight: 600,
                  }}
                >
                  <span style={{ fontSize: '10px', color: 'var(--text-muted, #8b949e)', width: '12px' }}>
                    {isCollapsed ? '▶' : '▼'}
                  </span>
                  <span style={{ color: 'var(--text-primary, #c9d1d9)' }}>{filePath}</span>
                  <span
                    style={{
                      fontSize: '10px',
                      color: 'var(--text-muted, #8b949e)',
                      marginLeft: 'auto',
                    }}
                  >
                    ({[
                      fileErrors > 0 ? `${fileErrors} error${fileErrors > 1 ? 's' : ''}` : null,
                      fileWarnings > 0 ? `${fileWarnings} warning${fileWarnings > 1 ? 's' : ''}` : null,
                    ]
                      .filter(Boolean)
                      .join(', ') || `${items.length} items`}
                    )
                  </span>
                </div>

                {/* Items in File */}
                {!isCollapsed && (
                  <div>
                    {items.map((item) => (
                      <div
                        key={item.id}
                        data-testid={`problem-row-${item.id}`}
                        onClick={() => handleRowClick(item)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          padding: '5px 12px 5px 28px',
                          borderBottom: '1px solid rgba(255, 255, 255, 0.02)',
                          cursor: 'pointer',
                          gap: '8px',
                          transition: 'background-color 0.15s ease',
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.05)';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.backgroundColor = 'transparent';
                        }}
                      >
                        {/* Severity Icon */}
                        {renderSeverityIcon(item.severity)}

                        {/* Error Message */}
                        <span
                          style={{
                            flex: 1,
                            color: 'var(--text-primary, #c9d1d9)',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                          }}
                          title={item.message}
                        >
                          {item.message}
                        </span>

                        {/* Coordinates Badge */}
                        <span
                          data-testid="problem-coordinates"
                          style={{
                            fontSize: '10px',
                            color: 'var(--text-muted, #8b949e)',
                            backgroundColor: 'rgba(255, 255, 255, 0.05)',
                            padding: '1px 5px',
                            borderRadius: '3px',
                            flexShrink: 0,
                          }}
                        >
                          [L{item.startLineNumber}, C{item.startColumn}]
                        </span>

                        {/* Code / Rule Badge */}
                        {item.code && (
                          <span
                            data-testid="problem-code"
                            style={{
                              fontSize: '10px',
                              color: 'var(--text-muted, #8b949e)',
                              flexShrink: 0,
                            }}
                          >
                            {item.code}
                          </span>
                        )}

                        {/* 1-Click Fix with AI Action Button */}
                        <button
                          data-testid={`fix-ai-btn-${item.id}`}
                          title="Fix with AI"
                          onClick={(e) => {
                            e.stopPropagation();
                            onFixWithAI?.(item);
                          }}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '3px',
                            padding: '2px 8px',
                            fontSize: '11px',
                            color: '#a5b4fc',
                            backgroundColor: 'rgba(99, 102, 241, 0.12)',
                            border: '1px solid rgba(99, 102, 241, 0.3)',
                            borderRadius: '3px',
                            cursor: 'pointer',
                            flexShrink: 0,
                            transition: 'all 0.15s ease',
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.backgroundColor = 'rgba(99, 102, 241, 0.25)';
                            e.currentTarget.style.color = '#ffffff';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.backgroundColor = 'rgba(99, 102, 241, 0.12)';
                            e.currentTarget.style.color = '#a5b4fc';
                          }}
                        >
                          ⚡ Fix with AI
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

export default ProblemsView;

