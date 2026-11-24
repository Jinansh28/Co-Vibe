// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { TerminalPane } from './TerminalPane.js';
import { useDiagnosticsStore, DiagnosticItem } from '../../features/editor/useDiagnosticsStore.js';

describe('TerminalPane Component with Problems Drawer Integration', () => {
  beforeEach(() => {
    useDiagnosticsStore.getState().clearDiagnostics();
  });

  it('renders terminal drawer with tabs when isOpen is true', () => {
    render(<TerminalPane isOpen={true} />);

    expect(screen.getByTestId('terminal-tab-terminal')).toBeDefined();
    expect(screen.getByTestId('terminal-tab-output')).toBeDefined();
    expect(screen.getByTestId('terminal-tab-problems')).toBeDefined();
    expect(screen.getByTestId('terminal-tab-tests')).toBeDefined();
  });

  it('does not render anything when isOpen is false', () => {
    const { container } = render(<TerminalPane isOpen={false} />);
    expect(container.firstChild).toBeNull();
  });

  it('does not show problem count badge on Problems tab when diagnostics store is empty', () => {
    render(<TerminalPane isOpen={true} />);
    expect(screen.queryByTestId('problems-badge')).toBeNull();
  });

  it('displays updated count badge on the Problems tab header when diagnostics exist', () => {
    const items: DiagnosticItem[] = [
      {
        id: '1',
        filePath: 'src/App.tsx',
        message: 'Cannot find name "x".',
        severity: 'error',
        startLineNumber: 10,
        startColumn: 1,
        endLineNumber: 10,
        endColumn: 2,
      },
      {
        id: '2',
        filePath: 'src/App.tsx',
        message: 'Unused variable "y".',
        severity: 'warning',
        startLineNumber: 12,
        startColumn: 1,
        endLineNumber: 12,
        endColumn: 2,
      },
    ];
    useDiagnosticsStore.getState().setDiagnostics(items);

    render(<TerminalPane isOpen={true} />);

    const badge = screen.getByTestId('problems-badge');
    expect(badge).toBeDefined();
    expect(badge.textContent).toBe('2');
    expect(badge.className).toContain('error-badge');
  });

  it('switches to Problems tab and displays ProblemsView when Problems tab is clicked', () => {
    render(<TerminalPane isOpen={true} />);

    // Initially in terminal tab (shows default dev output)
    expect(screen.getByText('VITE v5.4.10 ready in 240 ms')).toBeDefined();
    expect(screen.queryByTestId('problems-empty-state')).toBeNull();

    // Click Problems tab
    fireEvent.click(screen.getByTestId('terminal-tab-problems'));

    // ProblemsView is rendered with empty state
    expect(screen.getByTestId('problems-empty-state')).toBeDefined();
    expect(screen.getByText('No diagnostics or errors detected.')).toBeDefined();
  });

  it('renders diagnostics list in Problems tab and passes onNavigateToFile and onFixWithAI', () => {
    const items: DiagnosticItem[] = [
      {
        id: 'src/App.tsx:14:5:2304:Cannot find name "foo".',
        filePath: 'src/App.tsx',
        message: 'Cannot find name "foo". Did you mean "for"?',
        severity: 'error',
        startLineNumber: 14,
        startColumn: 5,
        endLineNumber: 14,
        endColumn: 8,
        code: 'ts(2304)',
      },
    ];
    useDiagnosticsStore.getState().setDiagnostics(items);

    const mockNavigate = vi.fn();
    const mockFixWithAI = vi.fn();

    render(
      <TerminalPane
        isOpen={true}
        onNavigateToFile={mockNavigate}
        onFixWithAI={mockFixWithAI}
      />
    );

    // Switch to problems tab
    fireEvent.click(screen.getByTestId('terminal-tab-problems'));

    expect(screen.getByTestId('problems-view')).toBeDefined();
    expect(screen.getByText('Cannot find name "foo". Did you mean "for"?')).toBeDefined();

    // Click problem row -> onNavigateToFile
    const row = screen.getByTestId('problem-row-src/App.tsx:14:5:2304:Cannot find name "foo".');
    fireEvent.click(row);
    expect(mockNavigate).toHaveBeenCalledWith('src/App.tsx', 14, 5);

    // Click Fix with AI -> onFixWithAI
    const fixBtn = screen.getByTestId('fix-ai-btn-src/App.tsx:14:5:2304:Cannot find name "foo".');
    fireEvent.click(fixBtn);
    expect(mockFixWithAI).toHaveBeenCalledWith(items[0]);
  });
});
