// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { ProblemsView } from './ProblemsView.js';
import {
  useDiagnosticsStore,
  extractDiagnosticsFromMarkers,
  type DiagnosticItem,
} from './useDiagnosticsStore.js';
import { useEditorStore } from './useEditorStore.js';

describe('ProblemsView Component & Diagnostics Aggregation', () => {
  const sampleDiagnostics: DiagnosticItem[] = [
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
      source: 'typescript',
    },
    {
      id: 'src/App.tsx:25:3:6133:"unusedVar" is declared but never read.',
      filePath: 'src/App.tsx',
      message: '"unusedVar" is declared but its value is never read.',
      severity: 'warning',
      startLineNumber: 25,
      startColumn: 3,
      endLineNumber: 25,
      endColumn: 12,
      code: 'ts(6133)',
      source: 'typescript',
    },
    {
      id: 'src/components/Button.tsx:8:10:2322:Type "string" is not assignable.',
      filePath: 'src/components/Button.tsx',
      message: 'Type "string" is not assignable to type "number".',
      severity: 'error',
      startLineNumber: 8,
      startColumn: 10,
      endLineNumber: 8,
      endColumn: 16,
      code: 'ts(2322)',
      source: 'typescript',
    },
    {
      id: 'src/types.ts:2:1:info:File contains deprecated types.',
      filePath: 'src/types.ts',
      message: 'File contains deprecated type definitions.',
      severity: 'info',
      startLineNumber: 2,
      startColumn: 1,
      endLineNumber: 2,
      endColumn: 20,
      code: 'deprecated',
    },
  ];

  beforeEach(() => {
    useDiagnosticsStore.getState().clearDiagnostics();
  });

  it('renders clean empty state when 0 errors or warnings exist', () => {
    render(<ProblemsView />);

    expect(screen.getByTestId('problems-empty-state')).toBeDefined();
    expect(screen.getByText('✓')).toBeDefined();
    expect(screen.getByText('No diagnostics or errors detected.')).toBeDefined();
  });

  it('renders grouped diagnostics by file with error and warning counts', () => {
    useDiagnosticsStore.getState().setDiagnostics(sampleDiagnostics);
    render(<ProblemsView />);

    expect(screen.getByTestId('problems-view')).toBeDefined();
    expect(screen.getByTestId('file-group-src/App.tsx')).toBeDefined();
    expect(screen.getByTestId('file-group-src/components/Button.tsx')).toBeDefined();

    // Verify messages
    expect(screen.getByText('Cannot find name "foo". Did you mean "for"?')).toBeDefined();
    expect(screen.getByText('"unusedVar" is declared but its value is never read.')).toBeDefined();

    // Verify coordinates and codes
    expect(screen.getByText('[L14, C5]')).toBeDefined();
    expect(screen.getByText('ts(2304)')).toBeDefined();

    // Verify severity icons
    expect(screen.getAllByTestId('severity-icon-error').length).toBe(2);
    expect(screen.getAllByTestId('severity-icon-warning').length).toBe(1);
    expect(screen.getAllByTestId('severity-icon-info').length).toBe(1);
  });

  it('filters diagnostics by severity toggle buttons (Errors only, Warnings only, All)', () => {
    useDiagnosticsStore.getState().setDiagnostics(sampleDiagnostics);
    render(<ProblemsView />);

    // Initially "All" is active (4 items)
    expect(screen.getByText('All (4)')).toBeDefined();
    expect(screen.getByText('Errors (2)')).toBeDefined();
    expect(screen.getByText('Warnings (1)')).toBeDefined();

    // Filter by Errors only
    fireEvent.click(screen.getByTestId('filter-errors-btn'));
    expect(screen.queryByText('Cannot find name "foo". Did you mean "for"?')).not.toBeNull();
    expect(screen.queryByText('Type "string" is not assignable to type "number".')).not.toBeNull();
    expect(screen.queryByText('"unusedVar" is declared but its value is never read.')).toBeNull();

    // Filter by Warnings only
    fireEvent.click(screen.getByTestId('filter-warnings-btn'));
    expect(screen.queryByText('Cannot find name "foo". Did you mean "for"?')).toBeNull();
    expect(screen.queryByText('"unusedVar" is declared but its value is never read.')).not.toBeNull();

    // Switch back to All
    fireEvent.click(screen.getByTestId('filter-all-btn'));
    expect(screen.queryByText('Cannot find name "foo". Did you mean "for"?')).not.toBeNull();
    expect(screen.queryByText('"unusedVar" is declared but its value is never read.')).not.toBeNull();
  });

  it('filters diagnostics using search input for message or code', () => {
    useDiagnosticsStore.getState().setDiagnostics(sampleDiagnostics);
    render(<ProblemsView />);

    const searchInput = screen.getByTestId('problems-search-input');
    fireEvent.change(searchInput, { target: { value: 'unusedVar' } });

    expect(screen.getByText('"unusedVar" is declared but its value is never read.')).toBeDefined();
    expect(screen.queryByText('Cannot find name "foo". Did you mean "for"?')).toBeNull();

    // Search by code rule
    fireEvent.change(searchInput, { target: { value: '2322' } });
    expect(screen.getByText('Type "string" is not assignable to type "number".')).toBeDefined();
    expect(screen.queryByText('"unusedVar" is declared but its value is never read.')).toBeNull();

    // Search with non-matching query
    fireEvent.change(searchInput, { target: { value: 'xyzNotFound' } });
    expect(screen.getByTestId('problems-no-results')).toBeDefined();
    expect(screen.getByText('No diagnostics match current filter.')).toBeDefined();
  });

  it('calls onNavigateToFile and opens target file when problem row is clicked', () => {
    useDiagnosticsStore.getState().setDiagnostics(sampleDiagnostics);
    const mockNavigate = vi.fn();
    render(<ProblemsView onNavigateToFile={mockNavigate} />);

    const row = screen.getByTestId('problem-row-src/App.tsx:14:5:2304:Cannot find name "foo".');
    fireEvent.click(row);

    expect(mockNavigate).toHaveBeenCalledWith('src/App.tsx', 14, 5);
  });

  it('falls back to useEditorStore.navigateToPosition when onNavigateToFile is not provided', () => {
    useDiagnosticsStore.getState().setDiagnostics(sampleDiagnostics);
    const navigateSpy = vi.spyOn(useEditorStore.getState(), 'navigateToPosition');
    render(<ProblemsView />);

    const row = screen.getByTestId('problem-row-src/App.tsx:14:5:2304:Cannot find name "foo".');
    fireEvent.click(row);

    expect(navigateSpy).toHaveBeenCalledWith('src/App.tsx', 14, 5);
  });

  it('triggers onFixWithAI when "⚡ Fix with AI" button is clicked', () => {
    useDiagnosticsStore.getState().setDiagnostics(sampleDiagnostics);
    const mockFixWithAI = vi.fn();
    render(<ProblemsView onFixWithAI={mockFixWithAI} />);

    const fixBtn = screen.getByTestId('fix-ai-btn-src/App.tsx:14:5:2304:Cannot find name "foo".');
    fireEvent.click(fixBtn);

    expect(mockFixWithAI).toHaveBeenCalledTimes(1);
    expect(mockFixWithAI).toHaveBeenCalledWith(sampleDiagnostics[0]);
  });

  it('renders "⚡ Fix All with AI" button when multiple errors exist and invokes onFixAllWithAI', () => {
    useDiagnosticsStore.getState().setDiagnostics(sampleDiagnostics);
    const mockFixAll = vi.fn();
    render(<ProblemsView onFixAllWithAI={mockFixAll} />);

    const fixAllBtn = screen.getByTestId('fix-all-with-ai-btn');
    expect(fixAllBtn).toBeDefined();
    expect(fixAllBtn.textContent).toContain('Fix All with AI (2)');

    fireEvent.click(fixAllBtn);
    expect(mockFixAll).toHaveBeenCalledTimes(1);
    expect(mockFixAll.mock.calls[0][0].length).toBe(2);
  });

  it('toggles collapse and expand on file group headers', () => {
    useDiagnosticsStore.getState().setDiagnostics(sampleDiagnostics);
    render(<ProblemsView />);

    const fileGroup = screen.getByTestId('file-group-src/App.tsx');
    expect(screen.queryByText('Cannot find name "foo". Did you mean "for"?')).not.toBeNull();

    // Click to collapse
    fireEvent.click(fileGroup);
    expect(screen.queryByText('Cannot find name "foo". Did you mean "for"?')).toBeNull();

    // Click to expand again
    fireEvent.click(fileGroup);
    expect(screen.queryByText('Cannot find name "foo". Did you mean "for"?')).not.toBeNull();
  });
});

describe('extractDiagnosticsFromMarkers Helper', () => {
  it('extracts, normalizes, and maps Monaco markers correctly', () => {
    const rawMarkers = [
      {
        resource: { path: '/src/main.ts' },
        message: 'Cannot find module "./utils".',
        severity: 8, // MarkerSeverity.Error
        startLineNumber: 1,
        startColumn: 1,
        endLineNumber: 1,
        endColumn: 24,
        code: '2307',
        source: 'typescript',
      },
      {
        resource: { path: '/src/main.ts' },
        message: 'Parameter "x" implicitly has an "any" type.',
        severity: 4, // MarkerSeverity.Warning
        startLineNumber: 10,
        startColumn: 12,
        endLineNumber: 10,
        endColumn: 13,
        code: 7006,
        source: 'typescript',
      },
      {
        resource: { path: '/src/main.ts' },
        message: 'Unused import',
        severity: 1, // MarkerSeverity.Hint -> should be filtered out
        startLineNumber: 2,
        startColumn: 1,
        endLineNumber: 2,
        endColumn: 10,
      },
    ];

    const result = extractDiagnosticsFromMarkers(rawMarkers);

    expect(result.length).toBe(2);
    expect(result[0].filePath).toBe('src/main.ts');
    expect(result[0].severity).toBe('error');
    expect(result[0].code).toBe('ts(2307)');
    expect(result[1].severity).toBe('warning');
    expect(result[1].code).toBe('ts(7006)');
  });
});
