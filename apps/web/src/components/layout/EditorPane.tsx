import React, { useState, useCallback, useEffect, useRef } from 'react';
import type { editor } from 'monaco-editor';
import type { Monaco } from '@monaco-editor/react';
import * as monaco from 'monaco-editor';
import { MonacoEditor } from '../../features/editor/MonacoEditor.js';
import { getLanguageFromPath } from '../../features/editor/editorConfig.js';
import { useEditorStore } from '../../features/editor/useEditorStore.js';
import { TabManager } from '../../features/editor/TabManager.js';
import { useAuth } from '../../features/auth/useAuth.js';
import { useCollaboration } from '../../features/collaboration/useCollaboration.js';
import { useFiles } from '../../features/editor/useFiles.js';
import { InlineActionBubble } from '../../features/editor/InlineActionBubble.js';
import { useOptionalNotification } from '../../context/NotificationContext.js';
import type { CodeSnippetAttachment } from '../../features/agent/AgentPanel.js';

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

export interface CodeActionTriggerPayload {
  snippet: CodeSnippetAttachment;
  prompt: string;
  actionType?: 'explain' | 'refactor' | 'test' | 'custom';
}

export interface EditorPaneProps {
  workspaceId?: string | null;
  value?: string;
  defaultValue?: string;
  onChange?: (value: string | undefined, ev: editor.IModelContentChangedEvent) => void;
  onMount?: (editor: editor.IStandaloneCodeEditor, monaco: Monaco) => void;
  readOnly?: boolean;
  onTriggerCodeAction?: (payload: CodeActionTriggerPayload) => void;
}

export const EditorPane: React.FC<EditorPaneProps> = ({
  workspaceId,
  value,
  defaultValue,
  onChange,
  onMount,
  readOnly = false,
  onTriggerCodeAction,
}) => {
  const rawStore = useEditorStore();
  const activeFilePath: string | null =
    typeof rawStore?.activeFilePath === 'string' ? rawStore.activeFilePath : null;
  const registerSaveHandler = rawStore?.registerSaveHandler;
  const registerGetActiveContent = rawStore?.registerGetActiveContent;
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

  const notificationContext = useOptionalNotification();
  const [editorInstance, setEditorInstance] = useState<editor.IStandaloneCodeEditor | null>(null);
  const editorContainerRef = useRef<HTMLDivElement>(null);

  const [inlineActionState, setInlineActionState] = useState<{
    visible: boolean;
    selectedText: string;
    startLine: number;
    endLine: number;
    top: number;
    left: number;
  }>({
    visible: false,
    selectedText: '',
    startLine: 1,
    endLine: 1,
    top: 0,
    left: 0,
  });

  const { connected } = useCollaboration(
    workspaceId || '',
    activeFilePath,
    editorInstance,
    userState
  );

  const { saveFileContent } = useFiles(workspaceId);
  const saveFileContentRef = useRef(saveFileContent);
  useEffect(() => {
    saveFileContentRef.current = saveFileContent;
  }, [saveFileContent]);

  const saveHandlerRef = React.useRef<(() => Promise<void>) | null>(null);

  // Dynamic save function fetching the latest active file path from store
  const performSave = useCallback(async () => {
    const currentPath = useEditorStore.getState().activeFilePath;
    if (currentPath && editorInstance) {
      try {
        await saveFileContentRef.current(currentPath, editorInstance.getValue());
      } catch (err) {
        console.error('Failed to save file:', err);
      }
    }
  }, [editorInstance]);

  // Keep save and content getter handlers in sync with latest state
  useEffect(() => {
    saveHandlerRef.current = performSave;
    registerSaveHandler?.(performSave);
    if (editorInstance) {
      registerGetActiveContent?.(() => editorInstance.getValue());
      return () => {
        registerSaveHandler?.(null);
        registerGetActiveContent?.(null);
      };
    }
    return () => {
      registerSaveHandler?.(null);
    };
  }, [performSave, registerSaveHandler, registerGetActiveContent, editorInstance]);

  // Trigger inline action bubble from Monaco selection or current line
  const triggerInlineAction = useCallback(
    (ed: editor.ICodeEditor) => {
      let selection = ed.getSelection();
      const model = ed.getModel();
      if (!model) return;

      // Gracefully select current cursor line if selection is empty
      if (!selection || selection.isEmpty()) {
        const pos = ed.getPosition();
        if (pos) {
          const lineNumber = pos.lineNumber;
          const lineMaxCol = model.getLineMaxColumn(lineNumber);
          const lineSelection = new monaco.Selection(lineNumber, 1, lineNumber, lineMaxCol);
          ed.setSelection(lineSelection);
          selection = lineSelection;
        }
      }

      if (!selection || selection.isEmpty()) {
        notificationContext?.showNotification('Please highlight code to trigger AI Code Action', 'info');
        return;
      }

      const selectedText = model.getValueInRange(selection);
      if (!selectedText.trim()) {
        notificationContext?.showNotification('Please highlight non-empty code to trigger AI Code Action', 'info');
        return;
      }

      const pos = ed.getScrolledVisiblePosition ? ed.getScrolledVisiblePosition(selection.getEndPosition()) : null;
      const top = pos ? pos.top + (pos.height ?? 20) + 6 : 80;
      const left = pos ? Math.max(16, Math.min(pos.left, 500)) : 40;

      setInlineActionState({
        visible: true,
        selectedText,
        startLine: selection.startLineNumber,
        endLine: selection.endLineNumber,
        top,
        left,
      });
    },
    [notificationContext]
  );

  const handleMount = useCallback(
    (editor: editor.IStandaloneCodeEditor, monacoInstance: Monaco) => {
      setEditorInstance(editor);

      // Add Save Command once — invoking latest save handler ref to avoid stale closures
      editor.addCommand(monacoInstance.KeyMod.CtrlCmd | monacoInstance.KeyCode.KeyS, () => {
        if (saveHandlerRef.current) {
          saveHandlerRef.current();
        }
      });

      // Register Inline AI Code Action (Ctrl+K and Context Menu)
      editor.addAction({
        id: 'inline-code-action',
        label: 'AI: Code Action / Explain / Refactor',
        keybindings: [monacoInstance.KeyMod.CtrlCmd | monacoInstance.KeyCode.KeyK],
        contextMenuGroupId: 'navigation',
        contextMenuOrder: 1.5,
        run: (ed) => {
          triggerInlineAction(ed);
        },
      });

      if (onMount) {
        onMount(editor, monacoInstance);
      }
    },
    [onMount, triggerInlineAction]
  );

  // Close inline action bubble when active file changes
  useEffect(() => {
    setInlineActionState((prev) => (prev.visible ? { ...prev, visible: false } : prev));
  }, [activeFilePath]);

  // Dismiss inline action bubble when clicking in Monaco editor
  useEffect(() => {
    if (!editorInstance) return;
    const disposable = editorInstance.onMouseDown?.(() => {
      setInlineActionState((prev) => (prev.visible ? { ...prev, visible: false } : prev));
    });
    return () => {
      disposable?.dispose?.();
    };
  }, [editorInstance]);

  const handleInlineBubbleSubmit = (
    prompt: string,
    actionType?: 'explain' | 'refactor' | 'test' | 'custom'
  ) => {
    const currentPath = useEditorStore.getState().activeFilePath || activeFilePath || 'untitled';
    const snippet: CodeSnippetAttachment = {
      filePath: currentPath,
      startLine: inlineActionState.startLine,
      endLine: inlineActionState.endLine,
      code: inlineActionState.selectedText,
    };
    setInlineActionState((prev) => ({ ...prev, visible: false }));
    onTriggerCodeAction?.({ snippet, prompt, actionType });
  };

  const handleInlineBubbleClose = () => {
    setInlineActionState((prev) => ({ ...prev, visible: false }));
  };

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
        ref={editorContainerRef}
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
            defaultValue={defaultValue ?? (value === undefined ? '' : undefined)}
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

        {/* Floating Glassmorphic Inline Action Bubble */}
        {inlineActionState.visible && activeFilePath && (
          <InlineActionBubble
            filePath={activeFilePath}
            selectedText={inlineActionState.selectedText}
            startLine={inlineActionState.startLine}
            endLine={inlineActionState.endLine}
            position={{ top: inlineActionState.top, left: inlineActionState.left }}
            onSubmit={handleInlineBubbleSubmit}
            onClose={handleInlineBubbleClose}
          />
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

export default EditorPane;
