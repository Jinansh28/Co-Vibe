import React, { useEffect } from 'react';
import { useEditorStore } from './useEditorStore.js';
import { useMonaco } from '@monaco-editor/react';

export const TabManager: React.FC = () => {
  const { openFiles, activeFilePath, setActiveFile, closeFile } = useEditorStore();
  const monaco = useMonaco();

  // Manage Monaco ITextModel lifecycle: dispose models when tabs are closed
  useEffect(() => {
    if (!monaco) return;
    const models = monaco.editor.getModels();
    models.forEach((model) => {
      // @monaco-editor/react creates URIs like file:///src/App.tsx when path="src/App.tsx"
      // or file://username/project/src/App.tsx
      // We extract the path to compare with openFiles.
      const path = model.uri.path;
      // path is usually /src/App.tsx, so we remove the leading slash if needed
      const normalizedPath = path.startsWith('/') ? path.substring(1) : path;
      
      if (!openFiles.includes(normalizedPath) && !openFiles.includes(path)) {
        // Only dispose if it's not the active file (just in case of race conditions)
        if (normalizedPath !== activeFilePath && path !== activeFilePath) {
          model.dispose();
        }
      }
    });
  }, [monaco, openFiles, activeFilePath]);

  if (openFiles.length === 0) return null;

  return (
    <div
      data-testid="editor-tab-bar"
      style={{
        height: '34px',
        backgroundColor: 'var(--bg-panel-solid)',
        borderBottom: '1px solid var(--border-subtle)',
        display: 'flex',
        alignItems: 'center',
        paddingLeft: '4px',
        overflowX: 'auto',
        userSelect: 'none',
      }}
    >
      {openFiles.map((filePath) => {
        const isActive = filePath === activeFilePath;
        const fileName = filePath.split('/').pop() || filePath;

        return (
          <div
            key={filePath}
            data-testid={isActive ? "active-editor-tab" : "editor-tab"}
            onClick={() => setActiveFile(filePath)}
            style={{
              height: '34px',
              padding: '0 12px',
              backgroundColor: isActive ? 'var(--bg-app)' : 'transparent',
              borderRight: '1px solid var(--border-subtle)',
              borderTop: isActive ? '2px solid var(--accent)' : '2px solid transparent',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              fontSize: '12px',
              color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)',
              fontFamily: 'var(--font-code)',
              cursor: 'pointer',
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={isActive ? 'var(--accent)' : 'currentColor'} strokeWidth="2">
              <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" />
              <polyline points="13 2 13 9 20 9" />
            </svg>
            <span>{fileName}</span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                closeFile(filePath);
              }}
              title="Close Tab"
              aria-label="Close Tab"
              style={{
                padding: '2px',
                borderRadius: 'var(--radius-xs)',
                color: 'var(--text-muted)',
                display: 'flex',
                alignItems: 'center',
                cursor: 'pointer',
                background: 'none',
                border: 'none',
              }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        );
      })}
    </div>
  );
};
