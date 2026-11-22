// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import React from 'react';
import { AppLayout } from './AppLayout.js';
import { useEditorStore } from '../../features/editor/useEditorStore.js';

vi.mock('../../features/auth/useAuth.js', () => ({
  useAuth: () => ({ user: { email: 'test@example.com' } })
}));

describe('AppLayout IDE Shell Grid', () => {
  it('renders top bar, sidebar, editor pane, agent panel, and terminal drawer', () => {
    render(<AppLayout />);

    expect(screen.getByText('Co-Vibe')).toBeDefined();
    expect(screen.getByText('Explorer')).toBeDefined();
    expect(screen.getAllByText('AI Agent').length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: /Toggle Terminal/i })).toBeDefined();
  });

  it('collapses and expands sidebar when sidebar toggle button is clicked', () => {
    render(<AppLayout />);

    const sidebarToggle = screen.getByRole('button', { name: /Toggle Sidebar/i });
    expect(screen.queryByText('Explorer')).not.toBeNull();

    // Collapse Sidebar
    fireEvent.click(sidebarToggle);
    expect(screen.queryByText('Explorer')).toBeNull();

    // Expand Sidebar
    fireEvent.click(sidebarToggle);
    expect(screen.queryByText('Explorer')).not.toBeNull();
  });

  it('collapses and expands agent panel when agent panel toggle button is clicked', () => {
    render(<AppLayout />);

    const agentToggle = screen.getByRole('button', { name: /Toggle Agent Panel/i });
    // Initially open: both TopBar button and AgentPanel header text exist (2 elements)
    expect(screen.getAllByText('AI Agent').length).toBe(2);

    // Collapse Agent Panel -> only 1 element remains (the TopBar toggle button)
    fireEvent.click(agentToggle);
    expect(screen.getAllByText('AI Agent').length).toBe(1);

    // Expand Agent Panel -> 2 elements again
    fireEvent.click(agentToggle);
    expect(screen.getAllByText('AI Agent').length).toBe(2);
  });

  it('collapses and expands terminal drawer when terminal toggle button is clicked', () => {
    render(<AppLayout />);

    const terminalToggle = screen.getByRole('button', { name: /Toggle Terminal/i });
    expect(screen.queryByText('VITE v5.4.10 ready in 240 ms')).not.toBeNull();

    // Collapse Terminal
    fireEvent.click(terminalToggle);
    expect(screen.queryByText('VITE v5.4.10 ready in 240 ms')).toBeNull();

    // Expand Terminal
    fireEvent.click(terminalToggle);
    expect(screen.queryByText('VITE v5.4.10 ready in 240 ms')).not.toBeNull();
  });

  it('renders Preview button in TopBar and opens HTML preview pane when an HTML file is active', async () => {
    useEditorStore.setState({
      activeFilePath: 'index.html',
      openFiles: ['index.html'],
      getActiveContent: () => '<h1>Hello From Active Content</h1>',
    });

    render(<AppLayout />);

    const previewBtn = screen.getByRole('button', { name: /Preview/i });
    expect(previewBtn).toBeDefined();

    // Initially preview pane is not open
    expect(screen.queryByTestId('html-preview-pane')).toBeNull();

    // Click Run Project -> opens preview pane instead of falling back to npm run dev
    const runBtn = screen.getByRole('button', { name: /Run Project/i });
    fireEvent.click(runBtn);

    await waitFor(() => {
      expect(screen.queryByTestId('html-preview-pane')).not.toBeNull();
    });
    const iframe = screen.getByTestId('html-preview-iframe') as HTMLIFrameElement;
    expect(iframe.getAttribute('srcdoc')).toBe('<h1>Hello From Active Content</h1>');

    // Click Close on the preview pane
    const previewPane = screen.getByTestId('html-preview-pane');
    const closeBtn = within(previewPane).getByRole('button', { name: /^Close$/i });
    fireEvent.click(closeBtn);
    expect(screen.queryByTestId('html-preview-pane')).toBeNull();

    // Click Preview button in TopBar -> opens preview pane
    fireEvent.click(previewBtn);
    await waitFor(() => {
      expect(screen.queryByTestId('html-preview-pane')).not.toBeNull();
    });
  });

  it('opens AgentPanel and displays attachment preview badge when Snapshot to AI is clicked in HtmlPreview', async () => {
    useEditorStore.setState({
      activeFilePath: 'navbar.html',
      openFiles: ['navbar.html'],
      getActiveContent: () => '<nav><button>Log In</button></nav>',
    });

    render(<AppLayout initialAgentOpen={false} />);

    // Agent panel is initially closed
    expect(screen.queryByTestId('agent-attachment-badge')).toBeNull();

    // Open Preview pane
    const previewBtn = screen.getByRole('button', { name: /Preview/i });
    fireEvent.click(previewBtn);

    await waitFor(() => {
      expect(screen.queryByTestId('html-preview-pane')).not.toBeNull();
    });

    // Click Snapshot to AI
    const snapshotBtn = screen.getByRole('button', { name: /Snapshot to AI/i });
    fireEvent.click(snapshotBtn);

    // Agent panel should open and display the attachment badge
    await waitFor(() => {
      expect(screen.getByTestId('agent-attachment-badge')).toBeDefined();
    });

    expect(screen.getByTestId('agent-attachment-text').textContent).toContain('navbar.html');
    expect(screen.getByTestId('agent-attachment-thumbnail')).toBeDefined();

    // Remove attachment button
    const removeBtn = screen.getByRole('button', { name: /Remove attachment/i });
    fireEvent.click(removeBtn);
    expect(screen.queryByTestId('agent-attachment-badge')).toBeNull();
  });
});
