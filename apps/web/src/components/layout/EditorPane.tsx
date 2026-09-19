import React, { useState, useCallback } from 'react';
import type { editor } from 'monaco-editor';
import type { Monaco } from '@monaco-editor/react';
import { MonacoEditor } from '../../features/editor/MonacoEditor.js';
import { getLanguageFromPath } from '../../features/editor/editorConfig.js';
import { useEditorStore } from '../../features/editor/useEditorStore.js';
import { TabManager } from '../../features/editor/TabManager.js';
import { useAuth } from '../../features/auth/useAuth.js';
import { useCollaboration } from '../../features/collaboration/useCollaboration.js';

function stringToColor(str: string) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  let color = '#';
  for (let i = 0; i < 3; i++) {
    const value = (hash >> (i * 8)) & 0xFF;
    color += ('00' + value.toString(16)).slice(-2);
  }
  return color;
}

interface EditorPaneProps {
  workspaceId?: string | null;
  value?: string;
  defaultValue?: string;
  onChange?: (value: string | undefined, ev: editor.IModelContentChangedEvent) => void;
  onMount?: (editor: editor.IStandaloneCodeEditor, monaco: Monaco) => void;
  readOnly?: boolean;
}

const DEFAULT_SAMPLE_CONTENT = `import React from 'react';
import { AppLayout } from './components/layout/AppLayout';

// Co-Vibe IDE — Collaborative AI Vibe-Coding Workspace
export default function App() {
  return <AppLayout />;
}
`;

export const EditorPane: React.FC<EditorPaneProps> = ({
  workspaceId,
  value,
  defaultValue,
  onChange,
  onMount,
  readOnly = false,
}) => {
  const { activeFilePath } = useEditorStore();
  const fileName = activeFilePath ? activeFilePath.split('/').pop() || activeFilePath : '';
  const language = activeFilePath ? getLanguageFromPath(activeFilePath) : 'plaintext';

  const displayLanguage = activeFilePath
    ? (activeFilePath.endsWith('.tsx') || activeFilePath.endsWith('.jsx')
        ? 'TypeScript React'
        : language.charAt(0).toUpperCase() + language.slice(1))
    : '';

  const { user } = useAuth();
  const userState = {
    name: user?.email || 'Anonymous',
    color: stringToColor(user?.email || 'anon'),
  };

  const [editorInstance, setEditorInstance] = useState<editor.IStandaloneCodeEditor | null>(null);

  const { connected } = useCollaboration(
    workspaceId || '',
    activeFilePath,
    editorInstance,
    userState
  );

  const handleMount = useCallback((editor: editor.IStandaloneCodeEditor, monaco: Monaco) => {
    setEditorInstance(editor);
    if (onMount) {
      onMount(editor, monaco);
    }
  }, [onMount]);

  return (
    <main
      data-testid="editor-pane"
      style={{
        flex: 1,
        height: '100%',
        backgroundColor: 'var(--bg-app)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        position: 'relative',
      }}
    >
      {/* Editor Tab Bar */}
      <TabManager />

      {/* Main Code Editor Surface */}
      <div
        style={{
          flex: 1,
          display: 'flex',
          backgroundColor: '#1e1e1e',
          overflow: 'hidden',
          position: 'relative',
        }}
      >
        {activeFilePath ? (
          <MonacoEditor
            filePath={activeFilePath}
            value={value}
            defaultValue={defaultValue ?? (value === undefined ? DEFAULT_SAMPLE_CONTENT : undefined)}
            language={language}
            theme="vs-dark"
            onChange={onChange}
            onMount={handleMount}
            readOnly={readOnly}
          />
        ) : (
          <div
            data-testid="empty-editor-state"
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--text-muted)',
              fontSize: '13px',
              gap: '8px',
            }}
          >
            <span>No file open</span>
            <span style={{ fontSize: '11px', color: 'var(--text-disabled)' }}>
              Select a file from the explorer sidebar to begin editing
            </span>
          </div>
        )}
      </div>

      {/* Bottom Status Bar */}
      <footer
        style={{
          height: 'var(--statusbar-height)',
          backgroundColor: 'var(--bg-panel-solid)',
          borderTop: '1px solid var(--border-subtle)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 12px',
          fontSize: '11px',
          color: 'var(--text-muted)',
          userSelect: 'none',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--text-secondary)' }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="6" y1="3" x2="6" y2="15" />
              <circle cx="18" cy="6" r="3" />
              <circle cx="6" cy="18" r="3" />
              <path d="M18 9a9 9 0 0 1-9 9" />
            </svg>
            main*
          </span>
          <span>Ln 1, Col 1</span>
          <span>Spaces: 2</span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span>UTF-8</span>
          <span>{displayLanguage}</span>
          <span style={{ color: connected ? 'var(--success)' : 'var(--text-muted)', fontWeight: 600 }}>
            {connected ? '● Yjs Synced' : '○ Offline'}
          </span>
        </div>
      </footer>
    </main>
  );
};
