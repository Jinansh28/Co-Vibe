import React, { useState, useRef, useEffect } from 'react';
import { DiffEditor } from '@monaco-editor/react';
import type { editor } from 'monaco-editor';
import { DEFAULT_EDITOR_OPTIONS, getLanguageFromPath } from '../editor/editorConfig.js';
import { HunkSelector } from './HunkSelector.js';
import { fetchRuntime } from '../../lib/runtimeConfig.js';

export interface DiffViewerProps {
  changeSetId: string;
  originalContent: string;
  modifiedContent: string;
  filePath: string;
  patch?: string;
  hunks?: string[];
  runtimeUrl?: string;
  onAccept: (changeSetId: string, acceptedHunks?: string[]) => void;
  onReject: (changeSetId: string) => void;
}

const HUNK_HEADER_REGEX = /^@@ -\d+(?:,\d+)? \+\d+(?:,\d+)? @@.*$/;

export function extractHunkLabelsFromPatch(patch?: string): string[] {
  if (!patch || !patch.trim()) return [];
  const normalized = patch.replace(/\r\n/g, '\n');
  const fileBlocks = normalized.split(/^diff --git /m).filter((b) => b.trim().length > 0);
  const labels: string[] = [];

  for (const block of fileBlocks) {
    const lines = block.split('\n');
    let fileName = '';
    let hunkIdx = 0;
    for (const line of lines) {
      if (line.startsWith('+++ b/')) fileName = line.substring(6);
      else if (line.startsWith('--- a/') && !fileName) fileName = line.substring(6);
      else if (HUNK_HEADER_REGEX.test(line)) {
        hunkIdx++;
        labels.push(fileName ? `${fileName} #${hunkIdx} ${line}` : `#${hunkIdx} ${line}`);
      }
    }
  }
  return labels;
}

export const DiffViewer: React.FC<DiffViewerProps> = ({
  changeSetId,
  originalContent,
  modifiedContent,
  filePath,
  patch,
  hunks: propHunks,
  runtimeUrl,
  onAccept,
  onReject,
}) => {
  const parsedPatchHunks = React.useMemo(() => extractHunkLabelsFromPatch(patch), [patch]);
  const hunks = React.useMemo(() => {
    if (propHunks && propHunks.length > 0) return propHunks;
    if (parsedPatchHunks.length > 0) return parsedPatchHunks;
    return ['Hunk 1', 'Hunk 2'];
  }, [propHunks, parsedPatchHunks]);

  const [selectedHunks, setSelectedHunks] = useState<string[]>(hunks);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    setSelectedHunks(hunks);
    setErrorMsg(null);
  }, [changeSetId, hunks]);

  const language = getLanguageFromPath(filePath);
  const diffEditorRef = useRef<editor.IStandaloneDiffEditor | null>(null);

  // Cleanly detach DiffEditor models before unmount to prevent TextModel disposed error
  useEffect(() => {
    return () => {
      if (diffEditorRef.current) {
        try {
          const model = diffEditorRef.current.getModel();
          diffEditorRef.current.setModel(null as any);
          if (model?.original && !model.original.isDisposed()) {
            model.original.dispose();
          }
          if (model?.modified && !model.modified.isDisposed()) {
            model.modified.dispose();
          }
        } catch {
          // ignore
        }
      }
    };
  }, []);

  const postChangeSetAction = async (action: 'accept' | 'reject', init: RequestInit) => {
    const url = runtimeUrl
      ? `${runtimeUrl}/api/v1/changesets/${changeSetId}/${action}`
      : `/api/v1/changesets/${changeSetId}/${action}`;
    return runtimeUrl ? fetchRuntime(url, init) : fetch(url, init);
  };

  const handleAccept = async () => {
    setErrorMsg(null);
    try {
      const res = await postChangeSetAction('accept', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ acceptedHunks: selectedHunks }),
      });
      if (res.ok) {
        onAccept(changeSetId, selectedHunks);
      } else {
        const errData = typeof res.json === 'function' ? await res.json().catch(() => ({})) : {};
        setErrorMsg(
          errData?.message ||
            errData?.error ||
            (res.status === 409 ? 'Merge conflict detected. Refresh and resolve manually.' : 'Failed to accept changeset')
        );
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to accept changeset');
    }
  };

  const handleReject = async () => {
    try {
      const res = await postChangeSetAction('reject', { method: 'POST' });
      if (res.ok) {
        onReject(changeSetId);
      } else {
        console.error('Failed to reject changeset');
      }
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div
      data-testid="diff-viewer"
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        width: '100%',
        backgroundColor: 'var(--bg-app)',
        color: 'var(--text-primary)'
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 16px',
          borderBottom: '1px solid var(--border-subtle)',
          backgroundColor: 'var(--bg-panel-solid)'
        }}
      >
        <h2 style={{ margin: 0, fontSize: '14px', fontWeight: 600 }}>{filePath}</h2>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={handleReject}
            data-testid="reject-button"
            style={{
              padding: '6px 12px',
              backgroundColor: 'transparent',
              color: 'var(--error)',
              border: '1px solid var(--error-subtle)',
              borderRadius: 'var(--radius-sm)',
              fontSize: '12px',
              fontWeight: 500,
              cursor: 'pointer'
            }}
          >
            Reject ChangeSet
          </button>
          <button
            onClick={handleAccept}
            data-testid="accept-button"
            style={{
              padding: '6px 12px',
              backgroundColor: 'var(--success-subtle)',
              color: 'var(--success)',
              border: '1px solid rgba(63, 185, 80, 0.3)',
              borderRadius: 'var(--radius-sm)',
              fontSize: '12px',
              fontWeight: 500,
              cursor: 'pointer'
            }}
          >
            Accept ChangeSet
          </button>
        </div>
      </div>
      
      {errorMsg && (
        <div
          role="alert"
          data-testid="diff-viewer-error"
          style={{
            padding: '8px 16px',
            backgroundColor: 'rgba(239, 68, 68, 0.15)',
            borderBottom: '1px solid rgba(239, 68, 68, 0.3)',
            color: '#fca5a5',
            fontSize: '12px',
          }}
        >
          {errorMsg}
        </div>
      )}

      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        <div
          style={{
            width: '250px',
            minWidth: '200px',
            borderRight: '1px solid var(--border-subtle)',
            backgroundColor: 'var(--bg-panel)',
            overflowY: 'auto'
          }}
        >
          <HunkSelector
            hunks={hunks}
            selectedHunks={selectedHunks}
            onChange={setSelectedHunks}
          />
        </div>
        
        <div style={{ flex: 1, position: 'relative' }}>
          <DiffEditor
            original={originalContent}
            modified={modifiedContent}
            language={language}
            theme="vs-dark"
            keepCurrentOriginalModel={true}
            keepCurrentModifiedModel={true}
            onMount={(ed) => {
              diffEditorRef.current = ed;
            }}
            options={{
              ...DEFAULT_EDITOR_OPTIONS,
              readOnly: true,
              renderSideBySide: true,
            }}
          />
        </div>
      </div>
    </div>
  );
};
