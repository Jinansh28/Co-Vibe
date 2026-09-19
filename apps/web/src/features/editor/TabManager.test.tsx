import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TabManager } from './TabManager.js';
import { useEditorStore } from './useEditorStore.js';
import * as monacoReact from '@monaco-editor/react';

vi.mock('./useEditorStore.js', () => ({
  useEditorStore: vi.fn(),
}));

vi.mock('@monaco-editor/react', () => ({
  useMonaco: vi.fn(),
}));

describe('TabManager', () => {
  const mockSetActiveFile = vi.fn();
  const mockCloseFile = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders tabs based on open files', () => {
    vi.mocked(useEditorStore).mockReturnValue({
      openFiles: ['src/App.tsx', 'src/main.tsx'],
      activeFilePath: 'src/App.tsx',
      setActiveFile: mockSetActiveFile,
      closeFile: mockCloseFile,
    } as any);

    render(<TabManager />);
    expect(screen.getByText('App.tsx')).toBeDefined();
    expect(screen.getByText('main.tsx')).toBeDefined();
  });

  it('calls setActiveFile when a tab is clicked', () => {
    vi.mocked(useEditorStore).mockReturnValue({
      openFiles: ['src/App.tsx', 'src/main.tsx'],
      activeFilePath: 'src/App.tsx',
      setActiveFile: mockSetActiveFile,
      closeFile: mockCloseFile,
    } as any);

    render(<TabManager />);
    fireEvent.click(screen.getByText('main.tsx'));
    expect(mockSetActiveFile).toHaveBeenCalledWith('src/main.tsx');
  });

  it('calls closeFile when tab close button is clicked', () => {
    vi.mocked(useEditorStore).mockReturnValue({
      openFiles: ['src/App.tsx'],
      activeFilePath: 'src/App.tsx',
      setActiveFile: mockSetActiveFile,
      closeFile: mockCloseFile,
    } as any);

    render(<TabManager />);
    const closeButtons = screen.getAllByRole('button', { name: /close tab/i });
    fireEvent.click(closeButtons[0]);
    expect(mockCloseFile).toHaveBeenCalledWith('src/App.tsx');
  });

  it('disposes models of closed files', () => {
    const mockDisposeApp = vi.fn();
    const mockDisposeMain = vi.fn();
    const mockMonaco = {
      editor: {
        getModels: vi.fn().mockReturnValue([
          { uri: { path: '/src/App.tsx' }, dispose: mockDisposeApp },
          { uri: { path: '/src/main.tsx' }, dispose: mockDisposeMain },
        ]),
      },
    };
    
    vi.mocked(monacoReact.useMonaco).mockReturnValue(mockMonaco as any);

    // Only main.tsx is open, App.tsx should be disposed
    vi.mocked(useEditorStore).mockReturnValue({
      openFiles: ['src/main.tsx'],
      activeFilePath: 'src/main.tsx',
      setActiveFile: mockSetActiveFile,
      closeFile: mockCloseFile,
    } as any);

    render(<TabManager />);
    
    expect(mockMonaco.editor.getModels).toHaveBeenCalled();
    expect(mockDisposeApp).toHaveBeenCalledTimes(1);
    expect(mockDisposeMain).not.toHaveBeenCalled();
  });
});
