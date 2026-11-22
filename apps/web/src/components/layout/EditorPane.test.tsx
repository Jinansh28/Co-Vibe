// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import React from 'react';
import { EditorPane } from './EditorPane.js';
import { useEditorStore } from '../../features/editor/useEditorStore.js';
import * as monaco from 'monaco-editor';

// Mock MonacoEditor component so we can capture onMount and test action registration
let capturedOnMount: ((editor: any, monacoInstance: any) => void) | null = null;

vi.mock('../../features/editor/MonacoEditor.js', () => ({
  MonacoEditor: ({ onMount, filePath }: any) => {
    capturedOnMount = onMount;
    return (
      <div data-testid="monaco-editor-container" data-filepath={filePath}>
        Monaco Editor Placeholder
      </div>
    );
  },
}));

vi.mock('../../features/auth/useAuth.js', () => ({
  useAuth: () => ({ user: { email: 'developer@example.com' } }),
}));

vi.mock('../../features/collaboration/useCollaboration.js', () => ({
  useCollaboration: () => ({ connected: true }),
}));

const mockSaveFileContent = vi.fn();
const mockGetFileContent = vi.fn();
vi.mock('../../features/editor/useFiles.js', () => ({
  useFiles: () => ({
    saveFileContent: mockSaveFileContent,
    getFileContent: mockGetFileContent,
  }),
}));

const mockShowNotification = vi.fn();
vi.mock('../../context/NotificationContext.js', () => ({
  useOptionalNotification: () => ({
    showNotification: mockShowNotification,
  }),
}));

describe('EditorPane Inline Code Action Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedOnMount = null;
    useEditorStore.setState({
      activeFilePath: 'src/auth/service.ts',
      openFiles: ['src/auth/service.ts'],
    });
  });

  function setupMockEditor() {
    const actions: any[] = [];
    const commands: any[] = [];
    let currentSelection = {
      startLineNumber: 10,
      startColumn: 1,
      endLineNumber: 15,
      endColumn: 30,
      isEmpty: () => false,
      getEndPosition: () => ({ lineNumber: 15, column: 30 }),
    };

    const mockModel = {
      getValueInRange: vi.fn().mockReturnValue('export function authenticate() { return true; }'),
      getLineMaxColumn: vi.fn().mockReturnValue(50),
    };

    const mockEditor = {
      addAction: vi.fn((config) => actions.push(config)),
      addCommand: vi.fn((keybinding, handler) => commands.push({ keybinding, handler })),
      getSelection: vi.fn(() => currentSelection),
      setSelection: vi.fn((sel) => {
        currentSelection = {
          ...sel,
          isEmpty: () => false,
          getEndPosition: () => ({ lineNumber: sel.endLineNumber, column: sel.endColumn }),
        };
      }),
      getPosition: vi.fn(() => ({ lineNumber: 12, column: 5 })),
      getModel: vi.fn(() => mockModel),
      getScrolledVisiblePosition: vi.fn(() => ({ top: 150, left: 100, height: 20 })),
      getValue: vi.fn(() => '// file content'),
      onMouseDown: vi.fn(() => ({ dispose: vi.fn() })),
    };

    return { mockEditor, actions, commands, mockModel };
  }

  it('registers inline-code-action with Ctrl+K shortcut on Monaco mount', () => {
    render(<EditorPane />);

    const { mockEditor, actions } = setupMockEditor();
    expect(capturedOnMount).not.toBeNull();

    act(() => {
      capturedOnMount!(mockEditor, monaco);
    });

    expect(mockEditor.addAction).toHaveBeenCalled();
    const actionConfig = actions.find((a) => a.id === 'inline-code-action');
    expect(actionConfig).toBeDefined();
    expect(actionConfig.label).toBe('AI: Code Action / Explain / Refactor');
    expect(actionConfig.keybindings).toBeDefined();
  });

  it('mounts InlineActionBubble when action runs with active selection', () => {
    render(<EditorPane />);

    const { mockEditor, actions } = setupMockEditor();
    act(() => {
      capturedOnMount!(mockEditor, monaco);
    });

    const actionConfig = actions.find((a) => a.id === 'inline-code-action');
    expect(screen.queryByTestId('inline-action-bubble')).toBeNull();

    // Trigger action run
    act(() => {
      actionConfig.run(mockEditor);
    });

    const bubble = screen.getByTestId('inline-action-bubble');
    expect(bubble).toBeDefined();

    const badge = screen.getByTestId('inline-action-badge');
    expect(badge.textContent).toContain('src/auth/service.ts');
    expect(badge.textContent).toContain('Lines 10-15');
  });

  it('gracefully selects current line when no text is highlighted before running action', () => {
    render(<EditorPane />);

    const { mockEditor, actions, mockModel } = setupMockEditor();
    // Simulate empty selection
    mockEditor.getSelection = vi.fn().mockReturnValueOnce({
      isEmpty: () => true,
    } as any);

    act(() => {
      capturedOnMount!(mockEditor, monaco);
    });

    const actionConfig = actions.find((a) => a.id === 'inline-code-action');

    act(() => {
      actionConfig.run(mockEditor);
    });

    // Verify setSelection was called to select the line
    expect(mockEditor.setSelection).toHaveBeenCalled();
    expect(screen.getByTestId('inline-action-bubble')).toBeDefined();
  });

  it('calls onTriggerCodeAction callback when preset action pill is clicked in bubble', () => {
    const handleTriggerCodeAction = vi.fn();
    render(<EditorPane onTriggerCodeAction={handleTriggerCodeAction} />);

    const { mockEditor, actions } = setupMockEditor();
    act(() => {
      capturedOnMount!(mockEditor, monaco);
    });

    const actionConfig = actions.find((a) => a.id === 'inline-code-action');
    act(() => {
      actionConfig.run(mockEditor);
    });

    // Bubble is open, click Explain
    const explainBtn = screen.getByTestId('quick-action-explain');
    fireEvent.click(explainBtn);

    expect(handleTriggerCodeAction).toHaveBeenCalledTimes(1);
    expect(handleTriggerCodeAction).toHaveBeenCalledWith({
      snippet: {
        filePath: 'src/auth/service.ts',
        startLine: 10,
        endLine: 15,
        code: 'export function authenticate() { return true; }',
      },
      prompt: 'Explain what this code does and highlight edge cases.',
      actionType: 'explain',
    });

    // Bubble is dismissed after submission
    expect(screen.queryByTestId('inline-action-bubble')).toBeNull();
  });

  it('calls onTriggerCodeAction when custom prompt is submitted from bubble', () => {
    const handleTriggerCodeAction = vi.fn();
    render(<EditorPane onTriggerCodeAction={handleTriggerCodeAction} />);

    const { mockEditor, actions } = setupMockEditor();
    act(() => {
      capturedOnMount!(mockEditor, monaco);
    });

    const actionConfig = actions.find((a) => a.id === 'inline-code-action');
    act(() => {
      actionConfig.run(mockEditor);
    });

    const input = screen.getByTestId('inline-action-input');
    fireEvent.change(input, { target: { value: 'Add error handling for invalid token' } });
    fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });

    expect(handleTriggerCodeAction).toHaveBeenCalledTimes(1);
    expect(handleTriggerCodeAction).toHaveBeenCalledWith({
      snippet: {
        filePath: 'src/auth/service.ts',
        startLine: 10,
        endLine: 15,
        code: 'export function authenticate() { return true; }',
      },
      prompt: 'Add error handling for invalid token',
      actionType: 'custom',
    });

    expect(screen.queryByTestId('inline-action-bubble')).toBeNull();
  });

  it('dismisses bubble when close button or Escape is triggered', () => {
    render(<EditorPane />);

    const { mockEditor, actions } = setupMockEditor();
    act(() => {
      capturedOnMount!(mockEditor, monaco);
    });

    const actionConfig = actions.find((a) => a.id === 'inline-code-action');
    act(() => {
      actionConfig.run(mockEditor);
    });

    expect(screen.getByTestId('inline-action-bubble')).toBeDefined();

    const closeBtn = screen.getByTestId('inline-action-close-btn');
    fireEvent.click(closeBtn);

    expect(screen.queryByTestId('inline-action-bubble')).toBeNull();
  });
});
