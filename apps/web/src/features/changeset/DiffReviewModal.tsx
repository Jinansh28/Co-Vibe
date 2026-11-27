import React, { useEffect } from 'react';
import { DiffViewer } from './DiffViewer.js';

export interface DiffData {
  changeSetId: string;
  filePath: string;
  originalContent: string;
  modifiedContent: string;
  patch?: string;
  baseRevision?: string;
  changedFiles?: string[];
  hunks?: string[];
}

export interface DiffReviewModalProps {
  diffData: DiffData;
  runtimeUrl?: string;
  onClose: () => void;
  onAccept?: (changeSetId: string, acceptedHunks?: string[]) => void | Promise<void>;
  onReject?: (changeSetId: string) => void | Promise<void>;
}

export const DiffReviewModal: React.FC<DiffReviewModalProps> = ({
  diffData,
  runtimeUrl,
  onClose,
  onAccept,
  onReject,
}) => {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const handleAccept = async (changeSetId: string, acceptedHunks?: string[]) => {
    if (onAccept) {
      await onAccept(changeSetId, acceptedHunks);
    }
    onClose();
  };

  const handleReject = async (changeSetId: string) => {
    if (onReject) {
      await onReject(changeSetId);
    }
    onClose();
  };

  return (
    <div
      data-testid="diff-review-modal-backdrop"
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.75)',
        backdropFilter: 'blur(4px)',
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        data-testid="diff-review-modal"
        style={{
          width: '92vw',
          maxWidth: '1200px',
          height: '85vh',
          backgroundColor: 'var(--bg-app)',
          border: '1px solid var(--border-subtle)',
          borderRadius: 'var(--radius-lg, 8px)',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.7)',
          overflow: 'hidden',
        }}
      >
        {/* Modal Top Header */}
        <div
          style={{
            height: '44px',
            padding: '0 16px',
            backgroundColor: 'var(--bg-panel-solid)',
            borderBottom: '1px solid var(--border-subtle)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            userSelect: 'none',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '12px', fontWeight: 700, letterSpacing: '0.5px', textTransform: 'uppercase', color: 'var(--accent)' }}>
              AI Diff Review
            </span>
            <span
              style={{
                fontSize: '11px',
                padding: '2px 8px',
                borderRadius: 'var(--radius-xs, 4px)',
                backgroundColor: 'rgba(234, 179, 8, 0.15)',
                color: 'rgb(234, 179, 8)',
                border: '1px solid rgba(234, 179, 8, 0.3)',
                fontWeight: 600,
              }}
            >
              Pending Approval
            </span>
            <span style={{ fontSize: '12px', color: 'var(--text-secondary)', fontFamily: 'var(--font-code)' }}>
              {diffData.filePath}
            </span>
          </div>

          <button
            onClick={onClose}
            data-testid="close-modal-button"
            aria-label="Close diff review"
            title="Close (Esc)"
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--text-muted)',
              cursor: 'pointer',
              padding: '4px',
              borderRadius: 'var(--radius-xs, 4px)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Modal Diff Viewer Body */}
        <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
          <DiffViewer
            changeSetId={diffData.changeSetId}
            filePath={diffData.filePath}
            originalContent={diffData.originalContent}
            modifiedContent={diffData.modifiedContent}
            patch={diffData.patch}
            hunks={diffData.hunks}
            runtimeUrl={runtimeUrl}
            onAccept={handleAccept}
            onReject={handleReject}
          />
        </div>
      </div>
    </div>
  );
};
