// @vitest-environment jsdom
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { HtmlPreview } from './HtmlPreview.js';

describe('HtmlPreview Component', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('renders sandboxed iframe with srcDoc and file path badge', () => {
    const htmlContent = '<h1>Hello Live Preview</h1>';
    render(
      <HtmlPreview
        filePath="src/index.html"
        content={htmlContent}
        onClose={vi.fn()}
      />
    );

    const iframe = screen.getByTestId('html-preview-iframe') as HTMLIFrameElement;
    expect(iframe).toBeTruthy();
    expect(iframe.getAttribute('srcdoc')).toBe(htmlContent);
    expect(iframe.getAttribute('sandbox')).toBe('allow-scripts allow-modals');
    expect(screen.getByTestId('html-preview-badge').textContent).toBe('src/index.html');
  });

  it('invokes onRefresh and updates content when Refresh button is clicked', async () => {
    const onRefresh = vi.fn();
    let currentHtml = '<h1>Initial Content</h1>';
    const getContent = vi.fn(() => {
      currentHtml = '<h1>Refreshed Content</h1>';
      return currentHtml;
    });

    render(
      <HtmlPreview
        filePath="test.html"
        content="<h1>Initial Content</h1>"
        getContent={getContent}
        onRefresh={onRefresh}
        onClose={vi.fn()}
      />
    );

    const refreshButton = screen.getByRole('button', { name: /Refresh/i });
    fireEvent.click(refreshButton);

    await waitFor(() => {
      expect(onRefresh).toHaveBeenCalledTimes(1);
      expect(getContent).toHaveBeenCalledTimes(1);
    });

    const iframe = screen.getByTestId('html-preview-iframe') as HTMLIFrameElement;
    expect(iframe.getAttribute('srcdoc')).toBe('<h1>Refreshed Content</h1>');
  });

  it('triggers onClose callback when Close button is clicked', () => {
    const onClose = vi.fn();
    render(
      <HtmlPreview
        filePath="index.html"
        content="<p>Test</p>"
        onClose={onClose}
      />
    );

    const closeButton = screen.getByRole('button', { name: /Close/i });
    fireEvent.click(closeButton);

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('opens HTML content in a new browser tab via Blob URL', () => {
    const originalCreateObjectURL = URL.createObjectURL;
    const originalOpen = window.open;

    const mockCreateObjectURL = vi.fn(() => 'blob:http://localhost/test-uuid');
    const mockOpen = vi.fn();

    URL.createObjectURL = mockCreateObjectURL;
    window.open = mockOpen;

    try {
      render(
        <HtmlPreview
          filePath="index.html"
          content="<!DOCTYPE html><html><body><h1>Tab Test</h1></body></html>"
          onClose={vi.fn()}
        />
      );

      const newTabButton = screen.getByRole('button', { name: /Open in New Tab/i });
      fireEvent.click(newTabButton);

      expect(mockCreateObjectURL).toHaveBeenCalledTimes(1);
      expect(mockOpen).toHaveBeenCalledWith('blob:http://localhost/test-uuid', '_blank');
    } finally {
      URL.createObjectURL = originalCreateObjectURL;
      window.open = originalOpen;
    }
  });

  it('triggers onCaptureSnapshot when Snapshot to AI button is clicked', async () => {
    const onCaptureSnapshot = vi.fn();
    render(
      <HtmlPreview
        filePath="src/component.html"
        content="<button class='btn'>Click Me</button>"
        onClose={vi.fn()}
        onCaptureSnapshot={onCaptureSnapshot}
      />
    );

    const snapshotButton = screen.getByRole('button', { name: /Snapshot to AI/i });
    expect(snapshotButton).toBeDefined();

    fireEvent.click(snapshotButton);

    await waitFor(() => {
      expect(onCaptureSnapshot).toHaveBeenCalledTimes(1);
    });

    const snapshotArg = onCaptureSnapshot.mock.calls[0][0];
    expect(snapshotArg.filePath).toBe('src/component.html');
    expect(typeof snapshotArg.base64).toBe('string');
    expect(snapshotArg.base64.length).toBeGreaterThan(0);
  });
});
