// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { InlineActionBubble } from './InlineActionBubble.js';

describe('InlineActionBubble Component', () => {
  const defaultProps = {
    filePath: 'src/auth.ts',
    selectedText: 'const token = verifyJwt();',
    startLine: 24,
    endLine: 58,
    position: { top: 120, left: 80 },
    onSubmit: vi.fn(),
    onClose: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders target file and line range badge correctly', () => {
    render(<InlineActionBubble {...defaultProps} />);

    const badge = screen.getByTestId('inline-action-badge');
    expect(badge).toBeDefined();
    expect(badge.textContent).toContain('src/auth.ts');
    expect(badge.textContent).toContain('Lines 24-58');
  });

  it('renders input box with placeholder and key hints', () => {
    render(<InlineActionBubble {...defaultProps} />);

    const input = screen.getByTestId('inline-action-input');
    expect(input).toBeDefined();
    expect(input.getAttribute('placeholder')).toBe(
      'Ask AI about this code or choose an action below...'
    );

    const hints = screen.getByTestId('inline-action-hints');
    expect(hints.textContent).toContain('Esc to close');
    expect(hints.textContent).toContain('to submit');
  });

  it('renders three quick-action pills: Explain, Refactor, and Unit Tests', () => {
    render(<InlineActionBubble {...defaultProps} />);

    expect(screen.getByTestId('quick-action-explain')).toBeDefined();
    expect(screen.getByTestId('quick-action-refactor')).toBeDefined();
    expect(screen.getByTestId('quick-action-test')).toBeDefined();
    expect(screen.getByText(/⚡ Explain/i)).toBeDefined();
    expect(screen.getByText(/🛠️ Refactor/i)).toBeDefined();
    expect(screen.getByText(/🧪 Unit Tests/i)).toBeDefined();
  });

  it('calls onSubmit with explanation prompt when Explain pill is clicked', () => {
    render(<InlineActionBubble {...defaultProps} />);

    const explainBtn = screen.getByTestId('quick-action-explain');
    fireEvent.click(explainBtn);

    expect(defaultProps.onSubmit).toHaveBeenCalledTimes(1);
    expect(defaultProps.onSubmit).toHaveBeenCalledWith(
      'Explain what this code does and highlight edge cases.',
      'explain'
    );
  });

  it('calls onSubmit with refactor prompt when Refactor pill is clicked', () => {
    render(<InlineActionBubble {...defaultProps} />);

    const refactorBtn = screen.getByTestId('quick-action-refactor');
    fireEvent.click(refactorBtn);

    expect(defaultProps.onSubmit).toHaveBeenCalledTimes(1);
    expect(defaultProps.onSubmit).toHaveBeenCalledWith(
      'Refactor this code to clean, idiomatic TypeScript with strict types and error handling.',
      'refactor'
    );
  });

  it('calls onSubmit with test prompt when Unit Tests pill is clicked', () => {
    render(<InlineActionBubble {...defaultProps} />);

    const testBtn = screen.getByTestId('quick-action-test');
    fireEvent.click(testBtn);

    expect(defaultProps.onSubmit).toHaveBeenCalledTimes(1);
    expect(defaultProps.onSubmit).toHaveBeenCalledWith(
      'Generate comprehensive unit tests using vitest for this selected code.',
      'test'
    );
  });

  it('submits custom prompt when user types and presses Enter', () => {
    render(<InlineActionBubble {...defaultProps} />);

    const input = screen.getByTestId('inline-action-input');
    fireEvent.change(input, { target: { value: 'Optimize for memory efficiency' } });
    fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });

    expect(defaultProps.onSubmit).toHaveBeenCalledTimes(1);
    expect(defaultProps.onSubmit).toHaveBeenCalledWith(
      'Optimize for memory efficiency',
      'custom'
    );
  });

  it('does not submit empty prompt on Enter', () => {
    render(<InlineActionBubble {...defaultProps} />);

    const input = screen.getByTestId('inline-action-input');
    fireEvent.change(input, { target: { value: '   ' } });
    fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });

    expect(defaultProps.onSubmit).not.toHaveBeenCalled();
  });

  it('calls onClose when Escape key is pressed in input', () => {
    render(<InlineActionBubble {...defaultProps} />);

    const input = screen.getByTestId('inline-action-input');
    fireEvent.keyDown(input, { key: 'Escape', code: 'Escape' });

    expect(defaultProps.onClose).toHaveBeenCalled();
  });

  it('calls onClose when Escape key is pressed on window', () => {
    render(<InlineActionBubble {...defaultProps} />);

    fireEvent.keyDown(window, { key: 'Escape', code: 'Escape' });

    expect(defaultProps.onClose).toHaveBeenCalled();
  });

  it('calls onClose when close button is clicked', () => {
    render(<InlineActionBubble {...defaultProps} />);

    const closeBtn = screen.getByTestId('inline-action-close-btn');
    fireEvent.click(closeBtn);

    expect(defaultProps.onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onClose when clicking outside the bubble', () => {
    render(
      <div>
        <div data-testid="outside-area">Outside</div>
        <InlineActionBubble {...defaultProps} />
      </div>
    );

    const outside = screen.getByTestId('outside-area');
    fireEvent.mouseDown(outside);

    expect(defaultProps.onClose).toHaveBeenCalledTimes(1);
  });

  it('does not call onClose when clicking inside the bubble', () => {
    render(<InlineActionBubble {...defaultProps} />);

    const bubble = screen.getByTestId('inline-action-bubble');
    fireEvent.mouseDown(bubble);

    expect(defaultProps.onClose).not.toHaveBeenCalled();
  });
});
