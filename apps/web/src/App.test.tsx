// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
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
  it('renders IDE shell layout grid when authenticated', async () => {
    render(<App />);

    await waitFor(() => {
      expect(screen.getAllByText(/Co-Vibe/i).length).toBeGreaterThan(0);
      expect(screen.getByText(/Explorer/i)).toBeDefined();
      expect(screen.getByRole('button', { name: /Run Project/i })).toBeDefined();
    });
  });
});
