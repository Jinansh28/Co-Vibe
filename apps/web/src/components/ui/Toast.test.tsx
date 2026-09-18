// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import React from 'react';
import { NotificationProvider, useNotification } from '../../context/NotificationContext.js';

const TestComponent = () => {
  const { showNotification, clearAllNotifications } = useNotification();

  return (
    <div>
      <button onClick={() => showNotification('Error notification', 'error')}>
        Trigger Error Toast
      </button>
      <button onClick={() => showNotification('Success notification', 'success')}>
        Trigger Success Toast
      </button>
      <button onClick={() => showNotification('Info notification', 'info')}>
        Trigger Info Toast
      </button>
      <button onClick={() => showNotification('Warning notification', 'warning')}>
        Trigger Warning Toast
      </button>
      <button onClick={clearAllNotifications}>Clear All</button>
    </div>
  );
};

describe('Toast & Notification System', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders red toast banner when calling showNotification with error type', () => {
    render(
      <NotificationProvider>
        <TestComponent />
      </NotificationProvider>
    );

    const triggerBtn = screen.getByText('Trigger Error Toast');
    fireEvent.click(triggerBtn);

    const toastText = screen.getByText('Error notification');
    expect(toastText).toBeDefined();

    const toastElement = screen.getByRole('alert');
    expect(toastElement.getAttribute('data-toast-type')).toBe('error');
  });

  it('dismisses toast automatically after 4000ms', () => {
    render(
      <NotificationProvider>
        <TestComponent />
      </NotificationProvider>
    );

    fireEvent.click(screen.getByText('Trigger Info Toast'));
    expect(screen.queryByText('Info notification')).not.toBeNull();

    act(() => {
      vi.advanceTimersByTime(4000);
    });

    expect(screen.queryByText('Info notification')).toBeNull();
  });

  it('allows manual dismiss of a toast via close button', () => {
    render(
      <NotificationProvider>
        <TestComponent />
      </NotificationProvider>
    );

    fireEvent.click(screen.getByText('Trigger Warning Toast'));
    expect(screen.queryByText('Warning notification')).not.toBeNull();

    const closeBtn = screen.getByRole('button', { name: /Dismiss notification/i });
    fireEvent.click(closeBtn);

    expect(screen.queryByText('Warning notification')).toBeNull();
  });

  it('clears all notifications when clearAllNotifications is called', () => {
    render(
      <NotificationProvider>
        <TestComponent />
      </NotificationProvider>
    );

    fireEvent.click(screen.getByText('Trigger Info Toast'));
    fireEvent.click(screen.getByText('Trigger Success Toast'));
    expect(screen.queryByText('Info notification')).not.toBeNull();
    expect(screen.queryByText('Success notification')).not.toBeNull();

    fireEvent.click(screen.getByText('Clear All'));
    expect(screen.queryByText('Info notification')).toBeNull();
    expect(screen.queryByText('Success notification')).toBeNull();
  });

  it('throws an error if useNotification is used outside NotificationProvider', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(() => render(<TestComponent />)).toThrow(
      'useNotification must be used within a NotificationProvider'
    );

    consoleSpy.mockRestore();
  });
});
