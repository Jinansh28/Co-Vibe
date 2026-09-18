// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import React from 'react';
import App from './App.js';

vi.mock('./lib/supabaseClient.js', () => {
  return {
    supabase: {
      auth: {
        getSession: vi.fn().mockResolvedValue({
          data: {
            session: {
              access_token: 'test-token',
              user: { id: 'user-1', email: 'test@example.com' },
            },
          },
          error: null,
        }),
        onAuthStateChange: vi.fn().mockReturnValue({
          data: { subscription: { unsubscribe: vi.fn() } },
        }),
        signInWithPassword: vi.fn(),
        signUp: vi.fn(),
        signOut: vi.fn(),
      },
    },
  };
});

describe('Web App Shell UI', () => {
  it('renders Projects Dashboard when authenticated and transitions to IDE shell on workspace open', async () => {
    await act(async () => {
      render(<App />);
    });

    await waitFor(() => {
      expect(screen.getAllByText(/Co-Vibe/i).length).toBeGreaterThan(0);
      expect(screen.getByTestId('projects-page')).toBeDefined();
    });

    // Create a project to enter workspace view
    const createBtn = screen.getByTestId('create-project-btn');
    await act(async () => {
      fireEvent.click(createBtn);
    });

    const nameInput = screen.getByLabelText(/Project Name/i);
    await act(async () => {
      fireEvent.change(nameInput, { target: { value: 'Test Workspace Project' } });
    });

    const submitBtn = screen.getByTestId('create-project-submit-btn');
    await act(async () => {
      fireEvent.click(submitBtn);
    });

    await waitFor(() => {
      expect(screen.getByText(/Explorer/i)).toBeDefined();
      expect(screen.getByRole('button', { name: /Run Project/i })).toBeDefined();
    });
  });
});
