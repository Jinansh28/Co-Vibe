// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { AppLayout } from './AppLayout.js';

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
});
