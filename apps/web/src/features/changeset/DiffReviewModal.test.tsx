import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DiffReviewModal, type DiffData } from './DiffReviewModal.js';

// Mock DiffEditor inside DiffViewer
vi.mock('@monaco-editor/react', () => ({
  DiffEditor: () => <div data-testid="mock-diff-editor">Diff Editor</div>,
}));

describe('DiffReviewModal', () => {
  let originalFetch: typeof global.fetch;

  const sampleDiff: DiffData = {
    changeSetId: 'cs-456',
    filePath: 'src/utils/math.ts',
    originalContent: 'export const add = (a, b) => a + b;',
    modifiedContent: 'export const add = (a: number, b: number): number => a + b;',
  };

  beforeEach(() => {
    vi.resetAllMocks();
    originalFetch = global.fetch;
    global.fetch = vi.fn();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('renders diff review modal with file path and DiffViewer controls', () => {
    render(
      <DiffReviewModal
        diffData={sampleDiff}
        onClose={vi.fn()}
      />
    );

    expect(screen.getByTestId('diff-review-modal')).toBeTruthy();
    expect(screen.getByText('AI Diff Review')).toBeTruthy();
    expect(screen.getAllByText('src/utils/math.ts').length).toBeGreaterThan(0);
    expect(screen.getByTestId('accept-button')).toBeTruthy();
    expect(screen.getByTestId('reject-button')).toBeTruthy();
  });

  it('closes modal when close button is clicked', () => {
    const onClose = vi.fn();
    render(
      <DiffReviewModal
        diffData={sampleDiff}
        onClose={onClose}
      />
    );

    fireEvent.click(screen.getByTestId('close-modal-button'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes modal when Escape key is pressed', () => {
    const onClose = vi.fn();
    render(
      <DiffReviewModal
        diffData={sampleDiff}
        onClose={onClose}
      />
    );

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onAccept and onClose when Accept button is clicked', async () => {
    const onAccept = vi.fn();
    const onClose = vi.fn();
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ ok: true });

    render(
      <DiffReviewModal
        diffData={sampleDiff}
        onClose={onClose}
        onAccept={onAccept}
      />
    );

    fireEvent.click(screen.getByTestId('accept-button'));

    await waitFor(() => {
      expect(onAccept).toHaveBeenCalledWith('cs-456', expect.any(Array));
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });

  it('calls onReject and onClose when Reject button is clicked', async () => {
    const onReject = vi.fn();
    const onClose = vi.fn();
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ ok: true });

    render(
      <DiffReviewModal
        diffData={sampleDiff}
        onClose={onClose}
        onReject={onReject}
      />
    );

    fireEvent.click(screen.getByTestId('reject-button'));

    await waitFor(() => {
      expect(onReject).toHaveBeenCalledWith('cs-456');
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });
});
