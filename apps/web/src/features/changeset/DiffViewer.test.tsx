import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DiffViewer } from './DiffViewer.js';

// Mock monaco-editor diff editor
vi.mock('@monaco-editor/react', () => ({
  DiffEditor: () => <div data-testid="mock-diff-editor">Diff Editor</div>,
}));

describe('DiffViewer', () => {
  let originalFetch: typeof global.fetch;

  beforeEach(() => {
    vi.resetAllMocks();
    originalFetch = global.fetch;
    global.fetch = vi.fn();
  });
  
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('renders diff viewer with correct layout', () => {
    render(
      <DiffViewer
        changeSetId="123"
        originalContent="old"
        modifiedContent="new"
        filePath="src/test.ts"
        onAccept={vi.fn()}
        onReject={vi.fn()}
      />
    );

    expect(screen.getByTestId('diff-viewer')).toBeTruthy();
    expect(screen.getByText('src/test.ts')).toBeTruthy();
    expect(screen.getByTestId('mock-diff-editor')).toBeTruthy();
    expect(screen.getByText('Changed Hunks')).toBeTruthy();
  });

  it('calls onAccept and API when accept is clicked', async () => {
    const onAccept = vi.fn();
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ ok: true });

    render(
      <DiffViewer
        changeSetId="123"
        originalContent="old"
        modifiedContent="new"
        filePath="src/test.ts"
        onAccept={onAccept}
        onReject={vi.fn()}
      />
    );

    fireEvent.click(screen.getByTestId('accept-button'));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith('/api/v1/changesets/123/accept', expect.objectContaining({
        method: 'POST'
      }));
      expect(onAccept).toHaveBeenCalledWith('123', ['Hunk 1', 'Hunk 2']);
    });
  });

  it('calls onReject and API when reject is clicked', async () => {
    const onReject = vi.fn();
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ ok: true });

    render(
      <DiffViewer
        changeSetId="123"
        originalContent="old"
        modifiedContent="new"
        filePath="src/test.ts"
        onAccept={vi.fn()}
        onReject={onReject}
      />
    );

    fireEvent.click(screen.getByTestId('reject-button'));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith('/api/v1/changesets/123/reject', expect.objectContaining({
        method: 'POST'
      }));
      expect(onReject).toHaveBeenCalledWith('123');
    });
  });
});
