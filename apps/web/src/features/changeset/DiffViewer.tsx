import React, { useState } from 'react';
import { DiffEditor } from '@monaco-editor/react';
import { DEFAULT_EDITOR_OPTIONS, getLanguageFromPath } from '../editor/editorConfig.js';
import { HunkSelector } from './HunkSelector.js';

export interface DiffViewerProps {
  changeSetId: string;
  originalContent: string;
  modifiedContent: string;
  filePath: string;
  onAccept: (changeSetId: string, acceptedHunks?: string[]) => void;
  onReject: (changeSetId: string) => void;
}

export const DiffViewer: React.FC<DiffViewerProps> = ({
  changeSetId,
  originalContent,
  modifiedContent,
  filePath,
  onAccept,
  onReject,
}) => {
  // Placeholder hunks logic for MVP
  const hunks = ['Hunk 1', 'Hunk 2'];
  const [selectedHunks, setSelectedHunks] = useState<string[]>(hunks);

  const language = getLanguageFromPath(filePath);

  const handleAccept = async () => {
    try {
      const res = await fetch(`/api/v1/changesets/${changeSetId}/accept`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ acceptedHunks: selectedHunks }),
      });
      if (res.ok) {
        onAccept(changeSetId, selectedHunks);
      } else {
        console.error('Failed to accept changeset');
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleReject = async () => {
    try {
      const res = await fetch(`/api/v1/changesets/${changeSetId}/reject`, {
        method: 'POST',
      });
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
