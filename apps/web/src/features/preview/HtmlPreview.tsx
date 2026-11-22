import React, { useState, useEffect, useCallback } from 'react';

export interface HtmlPreviewProps {
  filePath?: string | null;
  content?: string;
  getContent?: () => string | Promise<string>;
  onRefresh?: () => void | Promise<void>;
  onClose: () => void;
}

export const HtmlPreview: React.FC<HtmlPreviewProps> = ({
  filePath,
  content = '',
  getContent,
  onRefresh,
  onClose,
}) => {
  const [localContent, setLocalContent] = useState<string>(content);
  const [refreshKey, setRefreshKey] = useState<number>(0);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);

  useEffect(() => {
    if (content !== undefined) {
      setLocalContent(content);
    }
  }, [content]);

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      if (getContent) {
        const updated = await getContent();
        setLocalContent(updated);
      }
      if (onRefresh) {
        await onRefresh();
      }
      setRefreshKey((k) => k + 1);
    } finally {
      setIsRefreshing(false);
    }
  }, [getContent, onRefresh]);

  const handleOpenInNewTab = useCallback(() => {
    const htmlToOpen = localContent || content || '';
    const blob = new Blob([htmlToOpen], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank');
    // Clean up blob URL after a delay
    setTimeout(() => {
      URL.revokeObjectURL(url);
    }, 60000);
  }, [localContent, content]);

  const displayPath = filePath ? filePath.trim() : 'index.html';

  return (
    <div
      data-testid="html-preview-pane"
      style={{
        flex: 1,
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: 'var(--bg-app)',
        borderLeft: '1px solid var(--border-subtle)',
        overflow: 'hidden',
        position: 'relative',
        minWidth: '320px',
      }}
    >
      {/* Top Toolbar */}
      <div
        data-testid="html-preview-toolbar"
        style={{
          height: '34px',
          backgroundColor: 'var(--bg-panel-solid)',
          borderBottom: '1px solid var(--border-subtle)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 12px',
          userSelect: 'none',
        }}
      >
        {/* Left: File path badge & Preview label */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '12px',
              fontWeight: 600,
              color: 'var(--text-primary)',
            }}
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="var(--accent, #58a6ff)"
              strokeWidth="2"
            >
              <circle cx="12" cy="12" r="10" />
              <line x1="2" y1="12" x2="22" y2="12" />
              <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
            </svg>
            <span>Live Preview</span>
          </div>

          <span
            data-testid="html-preview-badge"
            style={{
              fontFamily: 'var(--font-code)',
              fontSize: '11px',
              padding: '1px 8px',
              backgroundColor: 'var(--bg-input)',
              color: 'var(--text-secondary)',
              borderRadius: 'var(--radius-xs)',
              border: '1px solid var(--border-subtle)',
            }}
          >
            {displayPath}
          </span>
        </div>

        {/* Right: Actions (Refresh, Open New Tab, Close) */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          {/* Refresh Button */}
          <button
            onClick={handleRefresh}
            title="Refresh Preview"
            aria-label="Refresh"
            disabled={isRefreshing}
            style={{
              padding: '3px 8px',
              borderRadius: 'var(--radius-sm)',
              backgroundColor: 'var(--bg-panel-raised)',
              border: '1px solid var(--border-subtle)',
              color: 'var(--text-secondary)',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              fontSize: '11px',
              cursor: isRefreshing ? 'default' : 'pointer',
              opacity: isRefreshing ? 0.6 : 1,
            }}
          >
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              style={{
                animation: isRefreshing ? 'spin 1s linear infinite' : 'none',
              }}
            >
              <polyline points="23 4 23 10 17 10" />
              <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
            </svg>
            <span>Refresh</span>
          </button>

          {/* Open in New Tab Button */}
          <button
            onClick={handleOpenInNewTab}
            title="Open preview in new browser tab"
            aria-label="Open in New Tab"
            style={{
              padding: '3px 8px',
              borderRadius: 'var(--radius-sm)',
              backgroundColor: 'var(--bg-panel-raised)',
              border: '1px solid var(--border-subtle)',
              color: 'var(--text-secondary)',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              fontSize: '11px',
              cursor: 'pointer',
            }}
          >
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
              <polyline points="15 3 21 3 21 9" />
              <line x1="10" y1="14" x2="21" y2="3" />
            </svg>
            <span>Open in New Tab</span>
          </button>

          {/* Close Button */}
          <button
            onClick={onClose}
            title="Close Preview Pane"
            aria-label="Close"
            style={{
              padding: '3px 6px',
              borderRadius: 'var(--radius-sm)',
              backgroundColor: 'transparent',
              border: 'none',
              color: 'var(--text-muted)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
            }}
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
      </div>

      {/* Sandboxed iframe container */}
      <div
        style={{
          flex: 1,
          width: '100%',
          height: 'calc(100% - 34px)',
          overflow: 'hidden',
          backgroundColor: '#ffffff',
          position: 'relative',
        }}
      >
        <iframe
          key={refreshKey}
          data-testid="html-preview-iframe"
          title="HTML Preview"
          srcDoc={localContent}
          sandbox="allow-scripts allow-modals"
          style={{
            width: '100%',
            height: '100%',
            border: 'none',
            background: '#ffffff',
          }}
        />
      </div>
    </div>
  );
};

export default HtmlPreview;
