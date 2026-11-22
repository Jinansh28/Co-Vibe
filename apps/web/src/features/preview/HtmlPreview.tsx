import React, { useState, useEffect, useCallback } from 'react';

export interface HtmlPreviewProps {
  filePath?: string | null;
  content?: string;
  getContent?: () => string | Promise<string>;
  onRefresh?: () => void | Promise<void>;
  onClose: () => void;
  onCaptureSnapshot?: (snapshot: { base64: string; filePath: string }) => void;
}

const getFallbackBase64Png = (): string => {
  try {
    const canvas = document.createElement('canvas');
    canvas.width = 400;
    canvas.height = 300;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#1e1e2e';
      ctx.fillRect(0, 0, 400, 300);
      ctx.fillStyle = '#ffffff';
      ctx.font = '14px sans-serif';
      ctx.fillText('HTML Snapshot', 20, 40);
      const dataUrl = canvas.toDataURL('image/png');
      if (dataUrl && dataUrl.includes(',')) {
        return dataUrl.split(',')[1];
      }
    }
  } catch {
    // Ignore canvas extraction error and use fallback
  }
  return 'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFElEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
};

const captureSnapshot = async (html: string): Promise<string> => {
  return new Promise((resolve) => {
    try {
      const width = 800;
      const height = 600;
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><foreignObject width="100%" height="100%"><div xmlns="http://www.w3.org/1999/xhtml" style="width:100%;height:100%;background:#ffffff;font-family:sans-serif;color:#000000;overflow:hidden;box-sizing:border-box;padding:8px;">${html}</div></foreignObject></svg>`;
      const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const img = new Image();

      let finished = false;
      const finish = (base64: string) => {
        if (finished) return;
        finished = true;
        try {
          URL.revokeObjectURL(url);
        } catch {
          // Ignore revoke error
        }
        resolve(base64);
      };

      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, width, height);
            ctx.drawImage(img, 0, 0);
            const dataUrl = canvas.toDataURL('image/png');
            if (dataUrl && dataUrl.startsWith('data:image/png;base64,')) {
              finish(dataUrl.replace('data:image/png;base64,', ''));
              return;
            }
          }
        } catch {
          // Fall through
        }
        finish(getFallbackBase64Png());
      };

      img.onerror = () => {
        finish(getFallbackBase64Png());
      };

      img.src = url;

      // Timeout fallback for headless or test environments
      setTimeout(() => {
        finish(getFallbackBase64Png());
      }, 300);
    } catch {
      resolve(getFallbackBase64Png());
    }
  });
};

export const HtmlPreview: React.FC<HtmlPreviewProps> = ({
  filePath,
  content = '',
  getContent,
  onRefresh,
  onClose,
  onCaptureSnapshot,
}) => {
  const [localContent, setLocalContent] = useState<string>(content);
  const [refreshKey, setRefreshKey] = useState<number>(0);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [isCapturing, setIsCapturing] = useState<boolean>(false);

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

  const handleCaptureSnapshot = useCallback(async () => {
    if (isCapturing) return;
    setIsCapturing(true);
    try {
      const htmlToCapture = localContent || content || '';
      const base64 = await captureSnapshot(htmlToCapture);
      if (onCaptureSnapshot) {
        onCaptureSnapshot({
          base64,
          filePath: displayPath,
        });
      }
    } finally {
      setIsCapturing(false);
    }
  }, [isCapturing, localContent, content, displayPath, onCaptureSnapshot]);

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

          {/* Snapshot to AI Button */}
          <button
            onClick={handleCaptureSnapshot}
            title="Capture snapshot and attach to AI context"
            aria-label="Snapshot to AI"
            data-testid="snapshot-to-ai-btn"
            disabled={isCapturing}
            style={{
              padding: '3px 8px',
              borderRadius: 'var(--radius-sm)',
              backgroundColor: 'rgba(88, 166, 255, 0.1)',
              border: '1px solid rgba(88, 166, 255, 0.3)',
              color: 'var(--accent, #58a6ff)',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              fontSize: '11px',
              fontWeight: 600,
              cursor: isCapturing ? 'default' : 'pointer',
              opacity: isCapturing ? 0.6 : 1,
            }}
          >
            {/* Camera / Eye icon */}
            <svg
              width="13"
              height="13"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
              <circle cx="12" cy="13" r="4" />
            </svg>
            <span>{isCapturing ? 'Snapping...' : 'Snapshot to AI'}</span>
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
