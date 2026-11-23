// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import React from 'react';
import { QuickOpenModal } from './QuickOpenModal.js';
import { useEditorStore } from './useEditorStore.js';

describe('QuickOpenModal Component', () => {
  const sampleFiles = [
    'apps/web/src/components/layout/AppLayout.tsx',
    'apps/web/src/components/layout/TopBar.tsx',
    'apps/web/src/components/layout/Sidebar.tsx',
    'README.md',
    'package.json',
  ];

  const defaultProps = {
    isOpen: true,
    onClose: vi.fn(),
    files: sampleFiles,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    useEditorStore.setState({
      openFiles: ['apps/web/src/components/layout/TopBar.tsx'],
      activeFilePath: 'apps/web/src/components/layout/TopBar.tsx',
    });
  });

  it('does not render when isOpen is false', () => {
    render(<QuickOpenModal {...defaultProps} isOpen={false} />);
    expect(screen.queryByTestId('quick-open-modal')).toBeNull();
  });

  it('renders modal dialog with input and initial results when isOpen is true', () => {
    render(<QuickOpenModal {...defaultProps} />);

    expect(screen.getByTestId('quick-open-modal')).toBeDefined();
    const input = screen.getByTestId('quick-open-input') as HTMLInputElement;
    expect(input).toBeDefined();
    expect(input.placeholder).toContain('Search files by name');

    // Initially displays open files first, then alphabetical
    const firstItem = screen.getByTestId('quick-open-item-0');
    expect(firstItem.getAttribute('data-filepath')).toBe(
      'apps/web/src/components/layout/TopBar.tsx'
    );
    expect(screen.getByTestId('quick-open-open-badge-0')).toBeDefined();
  });

  it('filters results dynamically when user types fuzzy query', () => {
    render(<QuickOpenModal {...defaultProps} />);

    const input = screen.getByTestId('quick-open-input');
    fireEvent.change(input, { target: { value: 'applay' } });

    // Should rank AppLayout.tsx as the top matched result
    const firstResult = screen.getByTestId('quick-open-item-0');
    expect(firstResult.getAttribute('data-filepath')).toBe(
      'apps/web/src/components/layout/AppLayout.tsx'
    );
    expect(firstResult.textContent).toContain('AppLayout.tsx');

    // Unrelated files without matching letters should not be present
    const results = screen.getByTestId('quick-open-results');
    expect(results.textContent).not.toContain('package.json');
    expect(results.textContent).not.toContain('README.md');
  });

  it('displays empty state message when no files match the search query', () => {
    render(<QuickOpenModal {...defaultProps} />);

    const input = screen.getByTestId('quick-open-input');
    fireEvent.change(input, { target: { value: 'nonexistent-query-xyz' } });

    expect(screen.getByTestId('quick-open-empty')).toBeDefined();
    expect(screen.getByText('No matching files found')).toBeDefined();
  });

  it('navigates through items with ArrowDown and ArrowUp', () => {
    render(<QuickOpenModal {...defaultProps} />);

    const item0 = screen.getByTestId('quick-open-item-0');
    expect(item0.getAttribute('aria-selected')).toBe('true');

    const input = screen.getByTestId('quick-open-input');

    // ArrowDown -> item 1 becomes selected
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    const item1 = screen.getByTestId('quick-open-item-1');
    expect(item1.getAttribute('aria-selected')).toBe('true');
    expect(screen.getByTestId('quick-open-item-0').getAttribute('aria-selected')).toBe('false');

    // ArrowUp -> back to item 0
    fireEvent.keyDown(input, { key: 'ArrowUp' });
    expect(screen.getByTestId('quick-open-item-0').getAttribute('aria-selected')).toBe('true');
  });

  it('opens selected file via useEditorStore and calls onClose on Enter key', () => {
    const onClose = vi.fn();
    render(<QuickOpenModal {...defaultProps} onClose={onClose} />);

    const input = screen.getByTestId('quick-open-input');
    fireEvent.change(input, { target: { value: 'applay' } });

    // Press Enter to select AppLayout.tsx
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(useEditorStore.getState().activeFilePath).toBe(
      'apps/web/src/components/layout/AppLayout.tsx'
    );
    expect(useEditorStore.getState().openFiles).toContain(
      'apps/web/src/components/layout/AppLayout.tsx'
    );
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('opens file and closes modal when an item is clicked directly', () => {
    const onClose = vi.fn();
    render(<QuickOpenModal {...defaultProps} onClose={onClose} />);

    const input = screen.getByTestId('quick-open-input');
    fireEvent.change(input, { target: { value: 'README' } });

    const readmeItem = screen.getByTestId('quick-open-item-0');
    fireEvent.click(readmeItem);

    expect(useEditorStore.getState().activeFilePath).toBe('README.md');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes modal when Escape key is pressed', () => {
    const onClose = vi.fn();
    render(<QuickOpenModal {...defaultProps} onClose={onClose} />);

    const input = screen.getByTestId('quick-open-input');
    fireEvent.keyDown(input, { key: 'Escape' });

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes modal when clicking the backdrop overlay', () => {
    const onClose = vi.fn();
    render(<QuickOpenModal {...defaultProps} onClose={onClose} />);

    const backdrop = screen.getByTestId('quick-open-backdrop');
    fireEvent.click(backdrop);

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('renders file type badges for different extensions', () => {
    render(<QuickOpenModal {...defaultProps} />);

    expect(screen.getAllByText('TSX').length).toBeGreaterThan(0);
    expect(screen.getByText('MD')).toBeDefined();
    expect(screen.getByText('JSON')).toBeDefined();
  });
});
