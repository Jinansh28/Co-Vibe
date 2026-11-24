// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import { AgentPanel, type CodeSnippetAttachment } from './AgentPanel.js';

describe('AgentPanel Component with Code Snippet Context', () => {
  const sampleSnippet: CodeSnippetAttachment = {
    filePath: 'src/auth/jwt.ts',
    startLine: 12,
    endLine: 45,
    code: 'export function verifyToken(token: string) { return jwt.verify(token); }',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/api/v1/agent/info')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ ok: true, provider: 'Gemini', model: 'gemini-3.5-flash-lite' }),
        });
      }
      if (url.includes('/agent/tasks') && !url.includes('/task-past-1')) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              tasks: [
                {
                  id: 'task-past-1',
                  workspaceId: 'ws-test',
                  prompt: 'Add login button',
                  status: 'completed',
                  createdAt: new Date().toISOString(),
                  runCount: 1,
                  hasDiff: true,
                  changedFiles: ['src/components/LoginButton.tsx'],
                },
              ],
            }),
        });
      }
      if (url.includes('/agent/tasks/task-past-1')) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              task: {
                id: 'task-past-1',
                workspaceId: 'ws-test',
                prompt: 'Add login button',
                status: 'completed',
                createdAt: new Date().toISOString(),
                runCount: 1,
                hasDiff: true,
                changedFiles: ['src/components/LoginButton.tsx'],
                conversations: [
                  { role: 'user', content: 'Add login button' },
                  { role: 'assistant', content: 'Login button created successfully' },
                ],
                runs: [{ id: 'run-past-1', status: 'completed' }],
                toolCalls: [],
                changeSet: {
                  id: 'cs-past-1',
                  patch: 'diff --git a/src/components/LoginButton.tsx ...',
                  changedFiles: ['src/components/LoginButton.tsx'],
                  status: 'pending',
                  diffData: {
                    changeSetId: 'cs-past-1',
                    filePath: 'src/components/LoginButton.tsx',
                    originalContent: '',
                    modifiedContent: '<button>Login</button>',
                  },
                },
              },
            }),
        });
      }
      if (url.includes('/api/v1/agent/run')) {
        const stream = new ReadableStream({
          start(controller) {
            controller.enqueue(
              new TextEncoder().encode(
                JSON.stringify({
                  taskId: 'task-123',
                  runId: 'run-123',
                  state: 'SUCCESS',
                  stepName: 'Explanation',
                  message: 'This code verifies JWT tokens.',
                  percentage: 100,
                }) + '\n'
              )
            );
            controller.close();
          },
        });
        return Promise.resolve({
          ok: true,
          body: stream,
        });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    });
  });

  it('renders code snippet chip when attachedSnippet prop is provided', () => {
    render(
      <AgentPanel
        isOpen={true}
        attachedSnippet={sampleSnippet}
      />
    );

    const badge = screen.getByTestId('agent-snippet-badge');
    expect(badge).toBeDefined();

    const badgeText = screen.getByTestId('agent-snippet-text');
    expect(badgeText.textContent).toBe('[Code Snippet: src/auth/jwt.ts:L12-L45]');
  });

  it('removes code snippet chip and calls onClearSnippet when remove button is clicked', () => {
    const handleClear = vi.fn();
    render(
      <AgentPanel
        isOpen={true}
        attachedSnippet={sampleSnippet}
        onClearSnippet={handleClear}
      />
    );

    expect(screen.getByTestId('agent-snippet-badge')).toBeDefined();

    const removeBtn = screen.getByTestId('remove-snippet-btn');
    fireEvent.click(removeBtn);

    expect(handleClear).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('agent-snippet-badge')).toBeNull();
  });

  it('prepends code snippet context to prompt payload on submit', async () => {
    render(
      <AgentPanel
        isOpen={true}
        attachedSnippet={sampleSnippet}
      />
    );

    const input = screen.getByPlaceholderText(/Ask agent to generate, modify, or run tests.../i);
    fireEvent.change(input, { target: { value: 'Explain error scenarios' } });

    const sendBtn = screen.getByRole('button', { name: /Send prompt/i });
    fireEvent.click(sendBtn);

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        'http://127.0.0.1:7890/api/v1/agent/run',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({ 'Content-Type': 'application/json' }),
          body: expect.stringContaining('[Code Snippet: src/auth/jwt.ts:L12-L45]'),
        })
      );
    });

    // Check that body also includes the question and snippet code
    const fetchCalls = vi.mocked(global.fetch).mock.calls;
    const runCall = fetchCalls.find((c) => String(c[0]).includes('/api/v1/agent/run'));
    expect(runCall).toBeDefined();
    const payload = JSON.parse(runCall![1]!.body as string);
    expect(payload.prompt).toContain('Explain error scenarios');
    expect(payload.prompt).toContain(sampleSnippet.code);
    expect(payload.snippet).toEqual(sampleSnippet);
  });

  it('triggers execution automatically when autoExecute and initialPrompt are provided', async () => {
    render(
      <AgentPanel
        isOpen={true}
        attachedSnippet={sampleSnippet}
        initialPrompt="Refactor this function to async/await"
        autoExecute={true}
      />
    );

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        'http://127.0.0.1:7890/api/v1/agent/run',
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('Refactor this function to async/await'),
        })
      );
    });
  });

  it('renders History tab and displays saved tasks list when clicked', async () => {
    render(<AgentPanel isOpen={true} workspaceId="ws-test" />);

    const historyTab = screen.getByTestId('agent-history-tab');
    fireEvent.click(historyTab);

    expect(await screen.findByText('Add login button')).toBeDefined();
    expect(screen.getByText('DIFF')).toBeDefined();
    expect(screen.getByText(/completed/i)).toBeDefined();
  });

  it('loads task details, updates active goal, and displays Review Staged Diff when past task is selected', async () => {
    const handleReviewDiff = vi.fn();
    render(<AgentPanel isOpen={true} workspaceId="ws-test" onReviewDiff={handleReviewDiff} />);

    // Switch to history tab
    fireEvent.click(screen.getByTestId('agent-history-tab'));

    // Click past task
    const taskItem = await screen.findByText('Add login button');
    fireEvent.click(taskItem);

    // Active goal and timeline should be updated
    expect(await screen.findByText(/Task: Add login button/i)).toBeDefined();
    expect(screen.getByText('Login button created successfully')).toBeDefined();

    // Review Staged Diff button should be visible and clickable
    const diffBtn = screen.getByTestId('review-past-diff-btn');
    expect(diffBtn).toBeDefined();
    fireEvent.click(diffBtn);

    expect(handleReviewDiff).toHaveBeenCalledTimes(1);
    expect(handleReviewDiff).toHaveBeenCalledWith(
      expect.objectContaining({
        changeSetId: 'cs-past-1',
        filePath: 'src/components/LoginButton.tsx',
        modifiedContent: '<button>Login</button>',
      })
    );
  });

  it('persists AI chat and timeline events in local history cache and restores them', async () => {
    localStorage.clear();
    render(<AgentPanel isOpen={true} workspaceId="ws-local-test" />);

    const input = screen.getByPlaceholderText(/Ask agent to generate, modify, or run tests.../i);
    fireEvent.change(input, { target: { value: 'Create auth module' } });

    const sendBtn = screen.getByRole('button', { name: /Send prompt/i });
    fireEvent.click(sendBtn);

    // Wait for the agent run to complete
    await waitFor(() => {
      expect(screen.getByText('This code verifies JWT tokens.')).toBeDefined();
    });

    // Check localStorage cache
    const raw = localStorage.getItem('co_vibe_agent_tasks_ws-local-test');
    expect(raw).toBeTruthy();
    const tasks = JSON.parse(raw!);
    expect(tasks.length).toBeGreaterThan(0);
    const moduleTask = tasks.find((t: any) => t.prompt === 'Create auth module');
    expect(moduleTask).toBeDefined();
    expect(moduleTask.conversations.length).toBe(2);
    expect(moduleTask.conversations[1].content).toContain('This code verifies JWT tokens.');

    // Switch to history tab and verify it renders
    const historyTab = screen.getByTestId('agent-history-tab');
    fireEvent.click(historyTab);
    expect(await screen.findByText('Create auth module')).toBeDefined();
  });
});
