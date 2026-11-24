import React, { useRef, useCallback, useEffect } from 'react';
import Editor, { OnMount, BeforeMount, Monaco, loader } from '@monaco-editor/react';
import * as monaco from 'monaco-editor';
import type { editor } from 'monaco-editor';
import { DEFAULT_EDITOR_OPTIONS, getLanguageFromPath } from './editorConfig.js';
import { syncMonacoMarkers } from './useDiagnosticsStore.js';

// Configure @monaco-editor/react to use local bundled Monaco Editor instead of remote CDN in browser
if (typeof window !== 'undefined' && process.env.NODE_ENV !== 'test') {
  loader.config({ monaco });
}

export interface MonacoEditorProps {
  filePath?: string;
  value?: string;
  defaultValue?: string;
  language?: string;
  theme?: string;
  options?: editor.IStandaloneEditorConstructionOptions;
  onChange?: (value: string | undefined, ev: editor.IModelContentChangedEvent) => void;
  onMount?: (editor: editor.IStandaloneCodeEditor, monaco: Monaco) => void;
  beforeMount?: (monaco: Monaco) => void;
  readOnly?: boolean;
  width?: string | number;
  height?: string | number;
  loading?: React.ReactNode;
  className?: string;
  'data-testid'?: string;
}

export const MonacoEditor: React.FC<MonacoEditorProps> = ({
  filePath,
  value,
  defaultValue,
  language,
  theme = 'vs-dark',
  options,
  onChange,
  onMount,
  beforeMount,
  readOnly = false,
  width = '100%',
  height = '100%',
  loading,
  className,
  'data-testid': testId = 'monaco-editor-container',
}) => {
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<Monaco | null>(null);
  const markerDisposableRef = useRef<monaco.IDisposable | null>(null);

  const resolvedLanguage = language || getLanguageFromPath(filePath);

  const handleEditorDidMount: OnMount = useCallback(
    (editorInstance, monacoInstance) => {
      editorRef.current = editorInstance;
      monacoRef.current = monacoInstance;

      // Ensure vs-dark theme is active
      monacoInstance.editor.setTheme(theme);

      // Register Monaco marker listener for diagnostics aggregation
      if (monacoInstance.editor?.onDidChangeMarkers) {
        markerDisposableRef.current?.dispose();
        markerDisposableRef.current = monacoInstance.editor.onDidChangeMarkers(() => {
          syncMonacoMarkers(monacoInstance);
        });
        syncMonacoMarkers(monacoInstance);
      }

      if (onMount) {
        onMount(editorInstance, monacoInstance);
      }
    },
    [onMount, theme]
  );

  useEffect(() => {
    return () => {
      markerDisposableRef.current?.dispose();
    };
  }, []);

  const mergedOptions: editor.IStandaloneEditorConstructionOptions = {
    ...DEFAULT_EDITOR_OPTIONS,
    ...options,
    readOnly,
  };

  const defaultLoading = (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        color: 'var(--text-muted, #8b949e)',
        fontFamily: 'var(--font-code, monospace)',
        fontSize: '12px',
        backgroundColor: '#1e1e1e',
      }}
      data-testid="monaco-editor-loading"
    >
      <span>Loading Editor...</span>
    </div>
  );

  return (
    <div
      data-testid={testId}
      className={className}
      style={{
        width,
        height,
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      <Editor
        width="100%"
        height="100%"
        path={filePath}
        language={resolvedLanguage}
        theme={theme}
        value={value}
        defaultValue={defaultValue}
        options={mergedOptions}
        onChange={onChange}
        onMount={handleEditorDidMount}
        beforeMount={beforeMount}
        loading={loading ?? defaultLoading}
      />
    </div>
  );
};

export default MonacoEditor;
