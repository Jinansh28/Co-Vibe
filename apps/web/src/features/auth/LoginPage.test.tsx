// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import { AuthProvider } from './AuthProvider.js';
import { LoginPage } from './LoginPage.js';
import { ProtectedRoute } from './ProtectedRoute.js';
import { NotificationProvider } from '../../context/NotificationContext.js';
import { supabase } from '../../lib/supabaseClient.js';

// Mock Supabase client
vi.mock('../../lib/supabaseClient.js', () => {
  const mockAuth = {
    getSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
    onAuthStateChange: vi.fn().mockReturnValue({
      data: { subscription: { unsubscribe: vi.fn() } },
    }),
    signInWithPassword: vi.fn(),
    signUp: vi.fn(),
    signOut: vi.fn().mockResolvedValue({ error: null }),
  };
  return {
    supabase: {
      auth: mockAuth,
    },
  };
});

describe('LoginPage & AuthProvider Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const renderWithProviders = (ui: React.ReactNode, initialSession = null) => {
    return render(
      <NotificationProvider>
        <AuthProvider initialSession={initialSession}>
          {ui}
        </AuthProvider>
      </NotificationProvider>
    );
  };

  it('renders login form with email and password inputs', async () => {
    renderWithProviders(<LoginPage />);

    expect(screen.getByText('Co-Vibe')).toBeDefined();
    expect(screen.getByLabelText('Email Address')).toBeDefined();
    expect(screen.getByLabelText('Password')).toBeDefined();
    expect(screen.getByRole('button', { name: 'Sign In' })).toBeDefined();
  });

  it('switches between Sign In and Sign Up modes when tab buttons are clicked', async () => {
    renderWithProviders(<LoginPage />);

    const signUpTab = screen.getByRole('tab', { name: 'Sign Up' });
    fireEvent.click(signUpTab);

    expect(screen.getByRole('button', { name: 'Create Account' })).toBeDefined();

    const signInTab = screen.getByRole('tab', { name: 'Sign In' });
    fireEvent.click(signInTab);

    expect(screen.getByRole('button', { name: 'Sign In' })).toBeDefined();
  });

  it('invokes signInWithPassword when submitting sign in form', async () => {
    const mockSignIn = vi.spyOn(supabase.auth, 'signInWithPassword').mockResolvedValueOnce({
      data: {
        user: { id: 'user-123', email: 'test@example.com' } as any,
        session: { access_token: 'fake-token' } as any,
      },
      error: null,
    });

    renderWithProviders(<LoginPage />);

    fireEvent.change(screen.getByLabelText('Email Address'), {
      target: { value: 'test@example.com' },
    });
    fireEvent.change(screen.getByLabelText('Password'), {
      target: { value: 'secret123' },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Sign In' }));

    await waitFor(() => {
      expect(mockSignIn).toHaveBeenCalledWith({
        email: 'test@example.com',
        password: 'secret123',
      });
    });
  });

  it('displays alert message on failed authentication', async () => {
    vi.spyOn(supabase.auth, 'signInWithPassword').mockResolvedValueOnce({
      data: { user: null, session: null },
      error: new Error('Invalid login credentials') as any,
    });

    renderWithProviders(<LoginPage />);

    fireEvent.change(screen.getByLabelText('Email Address'), {
      target: { value: 'test@example.com' },
    });
    fireEvent.change(screen.getByLabelText('Password'), {
      target: { value: 'wrongpass' },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Sign In' }));

    await waitFor(() => {
      expect(screen.getAllByRole('alert').length).toBeGreaterThan(0);
      expect(screen.getAllByText('Invalid login credentials').length).toBeGreaterThan(0);
    });
  });

  it('ProtectedRoute renders LoginPage when unauthenticated', async () => {
    renderWithProviders(
      <ProtectedRoute>
        <div data-testid="protected-content">Protected Dashboard</div>
      </ProtectedRoute>
    );

    await waitFor(() => {
      expect(screen.queryByTestId('protected-content')).toBeNull();
      expect(screen.getByText('Co-Vibe')).toBeDefined();
    });
  });

  it('ProtectedRoute renders protected children when session exists', async () => {
    const mockSession = {
      user: { id: 'user-123', email: 'test@example.com' },
      access_token: 'valid-token',
    } as any;

    renderWithProviders(
      <ProtectedRoute>
        <div data-testid="protected-content">Protected Dashboard</div>
      </ProtectedRoute>,
      mockSession
    );

    await waitFor(() => {
      expect(screen.getByTestId('protected-content')).toBeDefined();
      expect(screen.getByText('Protected Dashboard')).toBeDefined();
    });
  });
});
