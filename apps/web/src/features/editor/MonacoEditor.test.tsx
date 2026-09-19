// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { MonacoEditor } from './MonacoEditor.js';
import {
  DEFAULT_EDITOR_OPTIONS,
  getLanguageFromPath,
  EXTENSION_TO_LANGUAGE_MAP,
} from './editorConfig.js';
import { EditorPane } from '../../components/layout/EditorPane.js';
import { useEditorStore } from './useEditorStore.js';

vi.mock('./useEditorStore.js', () => ({
  useEditorStore: vi.fn(),
}));

describe('Monaco Editor Configuration (editorConfig)', () => {
  it('defines required default editor options for VS Code Dark Modern', () => {
    expect(DEFAULT_EDITOR_OPTIONS.fontSize).toBe(14);
    expect(DEFAULT_EDITOR_OPTIONS.lineNumbers).toBe('on');
    expect(DEFAULT_EDITOR_OPTIONS.automaticLayout).toBe(true);
    expect(DEFAULT_EDITOR_OPTIONS.minimap).toEqual({ enabled: true });
    expect(DEFAULT_EDITOR_OPTIONS.theme).toBe('vs-dark');
    expect(DEFAULT_EDITOR_OPTIONS.tabSize).toBe(2);
  });

  it('detects language correctly from file paths and extensions', () => {
    expect(getLanguageFromPath('src/App.tsx')).toBe('typescript');
    expect(getLanguageFromPath('src/index.ts')).toBe('typescript');
    expect(getLanguageFromPath('scripts/run.js')).toBe('javascript');
    expect(getLanguageFromPath('package.json')).toBe('json');
    expect(getLanguageFromPath('styles/main.css')).toBe('css');
    expect(getLanguageFromPath('index.html')).toBe('html');
    expect(getLanguageFromPath('README.md')).toBe('markdown');
    expect(getLanguageFromPath('daemon.py')).toBe('python');
    expect(getLanguageFromPath('docker-compose.yml')).toBe('yaml');
    expect(getLanguageFromPath('Dockerfile')).toBe('dockerfile');
    expect(getLanguageFromPath('config.yaml')).toBe('yaml');
    expect(getLanguageFromPath('unknown.xyz')).toBe('plaintext');
    expect(getLanguageFromPath('')).toBe('plaintext');
    expect(getLanguageFromPath(undefined)).toBe('plaintext');
  });
});

describe('MonacoEditor Component Integration', () => {
  it('renders editor container element with default vs-dark styling and loading placeholder', () => {
    const { container } = render(
      <MonacoEditor
        filePath="src/App.tsx"
        value="const x = 1;"
      />
    );

    const editorContainer = screen.getByTestId('monaco-editor-container');
    expect(editorContainer).toBeDefined();
    expect(editorContainer.style.width).toBe('100%');
    expect(editorContainer.style.height).toBe('100%');

    // Loading indicator is present during initialization
    expect(screen.getByTestId('monaco-editor-loading')).toBeDefined();
    expect(screen.getByText('Loading Editor...')).toBeDefined();
  });

  it('passes custom height, width, and testId props', () => {
    render(
      <MonacoEditor
        filePath="src/test.ts"
        height="500px"
        width="800px"
        data-testid="custom-editor"
      />
    );

    const editorContainer = screen.getByTestId('custom-editor');
    expect(editorContainer).toBeDefined();
    expect(editorContainer.style.height).toBe('500px');
    expect(editorContainer.style.width).toBe('800px');
  });

  it('renders custom loading fallback when provided', () => {
    render(
      <MonacoEditor
        filePath="src/App.tsx"
        loading={<div data-testid="custom-loading">Custom Spinner</div>}
      />
    );

    expect(screen.getByTestId('custom-loading')).toBeDefined();
    expect(screen.getByText('Custom Spinner')).toBeDefined();
  });
});

describe('EditorPane Integration with MonacoEditor', () => {
  it('renders tab bar with active file and mounts MonacoEditor', () => {
    vi.mocked(useEditorStore).mockReturnValue({
      activeFilePath: 'src/features/auth/LoginPage.tsx',
      openFiles: ['src/features/auth/LoginPage.tsx'],
      setActiveFile: vi.fn(),
      closeFile: vi.fn(),
    } as any);
    render(<EditorPane />);

    expect(screen.getByTestId('editor-pane')).toBeDefined();
    expect(screen.getByTestId('editor-tab-bar')).toBeDefined();
    expect(screen.getByText('LoginPage.tsx')).toBeDefined();
    expect(screen.getByTestId('monaco-editor-container')).toBeDefined();
    expect(screen.getByText('TypeScript React')).toBeDefined();
  });

  it('renders empty state when activeFilePath is empty or closed', () => {
    vi.mocked(useEditorStore).mockReturnValue({
      activeFilePath: null,
      openFiles: [],
      setActiveFile: vi.fn(),
      closeFile: vi.fn(),
    } as any);
    render(<EditorPane />);

    expect(screen.getByTestId('empty-editor-state')).toBeDefined();
    expect(screen.getByText('No file open')).toBeDefined();
    expect(screen.queryByTestId('editor-tab-bar')).toBeNull();
    expect(screen.queryByTestId('monaco-editor-container')).toBeNull();
  });

  it('calls closeFile callback when tab close button is clicked', () => {
    const handleCloseTab = vi.fn();
    vi.mocked(useEditorStore).mockReturnValue({
      activeFilePath: 'src/App.tsx',
      openFiles: ['src/App.tsx'],
      setActiveFile: vi.fn(),
      closeFile: handleCloseTab,
    } as any);
    render(<EditorPane />);

    const closeBtn = screen.getByRole('button', { name: /Close Tab/i });
    fireEvent.click(closeBtn);
    expect(handleCloseTab).toHaveBeenCalledTimes(1);
    expect(handleCloseTab).toHaveBeenCalledWith('src/App.tsx');
  });
});
