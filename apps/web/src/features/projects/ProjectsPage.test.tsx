import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ProjectsPage } from './ProjectsPage.js';
import { NotificationProvider } from '../../context/NotificationContext.js';
import { AuthProvider } from '../auth/AuthProvider.js';

// Mock Supabase client
vi.mock('../../lib/supabaseClient.js', () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({
        data: {
          session: {
            user: { id: 'test-user-123', email: 'test@co-vibe.dev' },
            access_token: 'fake-jwt-token',
          },
        },
        error: null,
      }),
      onAuthStateChange: vi.fn().mockReturnValue({
        data: { subscription: { unsubscribe: vi.fn() } },
      }),
      signOut: vi.fn().mockResolvedValue({ error: null }),
    },
  },
}));

const renderWithProviders = (ui: React.ReactElement) => {
  return render(
    <NotificationProvider>
      <AuthProvider>{ui}</AuthProvider>
    </NotificationProvider>
  );
};

describe('ProjectsPage Component', () => {
  const initialProjects = [
    {
      id: 'proj-1',
      name: 'Alpha Project',
      description: 'First test workspace project',
      createdAt: '2026-09-18T00:00:00.000Z',
      role: 'owner' as const,
      workspaceCount: 2,
      activeWorkspaceId: 'ws-1',
    },
    {
      id: 'proj-2',
      name: 'Beta Workspace',
      description: 'Second test workspace project',
      createdAt: '2026-09-18T00:00:00.000Z',
      role: 'editor' as const,
      workspaceCount: 1,
      activeWorkspaceId: 'ws-2',
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders dashboard header and project cards', async () => {
    await act(async () => {
      renderWithProviders(<ProjectsPage initialProjects={initialProjects} />);
    });

    expect(screen.getByTestId('projects-page')).toBeDefined();
    expect(screen.getByText('Alpha Project')).toBeDefined();
    expect(screen.getByText('Beta Workspace')).toBeDefined();
    expect(screen.getByTestId('create-project-btn')).toBeDefined();
  });

  it('filters project cards by search input query', async () => {
    await act(async () => {
      renderWithProviders(<ProjectsPage initialProjects={initialProjects} />);
    });

    const searchInput = screen.getByTestId('project-search-input');
    await act(async () => {
      fireEvent.change(searchInput, { target: { value: 'Alpha' } });
    });

    expect(screen.getByText('Alpha Project')).toBeDefined();
    expect(screen.queryByText('Beta Workspace')).toBeNull();
  });

  it('opens CreateProjectModal when Create Project button is clicked', async () => {
    await act(async () => {
      renderWithProviders(<ProjectsPage initialProjects={initialProjects} />);
    });

    expect(screen.queryByTestId('create-project-modal')).toBeNull();

    const createBtn = screen.getByTestId('create-project-btn');
    await act(async () => {
      fireEvent.click(createBtn);
    });

    expect(screen.getByTestId('create-project-modal')).toBeDefined();
    expect(screen.getByLabelText(/Project Name/i)).toBeDefined();
  });

  it('creates a project when modal form is submitted', async () => {
    const handleOpenWorkspace = vi.fn();

    await act(async () => {
      renderWithProviders(
        <ProjectsPage initialProjects={[]} onOpenWorkspace={handleOpenWorkspace} />
      );
    });

    // Verify empty state
    expect(screen.getByTestId('empty-projects-state')).toBeDefined();

    // Open modal
    const createBtn = screen.getByTestId('create-project-btn');
    await act(async () => {
      fireEvent.click(createBtn);
    });

    // Fill form
    const nameInput = screen.getByLabelText(/Project Name/i);
    const descInput = screen.getByLabelText(/Description/i);

    await act(async () => {
      fireEvent.change(nameInput, { target: { value: 'New Gamma Project' } });
      fireEvent.change(descInput, { target: { value: 'Gamma project description' } });
    });

    // Submit form
    const submitBtn = screen.getByTestId('create-project-submit-btn');
    await act(async () => {
      fireEvent.click(submitBtn);
    });

    // Verify new card is displayed
    await waitFor(() => {
      expect(screen.getByText('New Gamma Project')).toBeDefined();
    });

    // Verify onOpenWorkspace callback was invoked
    expect(handleOpenWorkspace).toHaveBeenCalledTimes(1);
  });

  it('invokes onOpenWorkspace callback when Open Workspace button is clicked', async () => {
    const handleOpenWorkspace = vi.fn();

    await act(async () => {
      renderWithProviders(
        <ProjectsPage
          initialProjects={initialProjects}
          onOpenWorkspace={handleOpenWorkspace}
        />
      );
    });

    const openBtns = screen.getAllByRole('button', { name: /Open Workspace/i });
    expect(openBtns.length).toBeGreaterThan(0);

    await act(async () => {
      fireEvent.click(openBtns[0]);
    });

    expect(handleOpenWorkspace).toHaveBeenCalledWith('proj-1', 'ws-1');
  });
});
