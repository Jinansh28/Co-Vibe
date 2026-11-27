import { describe, it, expect, beforeEach } from 'vitest';
import { sign } from 'hono/jwt';
import app from '../src/index.js';
import {
  inMemoryAgentHistoryService,
  InMemoryAgentHistoryService,
} from '../src/services/agentHistoryService.js';
import { inMemoryProjectService } from '../src/services/projectService.js';

const SECRET = 'dev-secret-key-change-in-prod';

describe('Saved Agent Task & Run History API & Service (TASK-053)', () => {
  let authToken: string;
  let outsiderToken: string;
  let viewerToken: string;
  let workspaceId: string;
  const testSub = 'user-test-agent-001';
  const testEmail = 'agent-user@co-vibe.dev';
  const outsiderSub = 'user-outsider-999';
  const viewerSub = 'user-viewer-002';

  beforeEach(async () => {
    inMemoryAgentHistoryService.reset();
    inMemoryProjectService.reset();

    const { project } = await inMemoryProjectService.createProject(testSub, testEmail, {
      name: 'Agent History Test Project',
    });
    const wsRes = await inMemoryProjectService.createWorkspace(project.id, testSub, {
      name: 'Agent Workspace',
    });
    if (wsRes.status !== 'ok') throw new Error('Failed to seed workspace');
    workspaceId = wsRes.workspace.id;

    await inMemoryProjectService.addMember(project.id, viewerSub, 'viewer@co-vibe.dev', 'viewer');

    const exp = Math.floor(Date.now() / 1000) + 3600;
    authToken = await sign({ sub: testSub, email: testEmail, exp }, SECRET, 'HS256');
    outsiderToken = await sign({ sub: outsiderSub, email: 'outsider@co-vibe.dev', exp }, SECRET, 'HS256');
    viewerToken = await sign({ sub: viewerSub, email: 'viewer@co-vibe.dev', exp }, SECRET, 'HS256');
  });

  describe('InMemoryAgentHistoryService Unit Tests', () => {
    it('creates a task with run and initial conversation message', async () => {
      const service = new InMemoryAgentHistoryService();
      const prompt = 'Fix authentication bug in jwt.ts';
      const { taskId, runId } = await service.createTask(workspaceId, prompt);

      expect(taskId).toBeDefined();
      expect(runId).toBeDefined();

      const details = await service.getTaskDetails(taskId);
      expect(details).not.toBeNull();
      expect(details?.prompt).toBe(prompt);
      expect(details?.workspaceId).toBe(workspaceId);
      expect(details?.status).toBe('planning');
      expect(details?.runCount).toBe(1);
      expect(details?.runs[0].id).toBe(runId);
      expect(details?.runs[0].status).toBe('running');
      expect(details?.conversations.length).toBe(1);
      expect(details?.conversations[0].role).toBe('user');
      expect(details?.conversations[0].content).toBe(prompt);
    });

    it('lists workspace tasks ordered by creation time', async () => {
      const service = new InMemoryAgentHistoryService();
      await service.createTask(workspaceId, 'First prompt');
      await service.createTask(workspaceId, 'Second prompt');

      const tasks = await service.listWorkspaceTasks(workspaceId);
      expect(tasks.length).toBe(2);
      expect(tasks[0].prompt).toBe('Second prompt');
      expect(tasks[1].prompt).toBe('First prompt');
    });

    it('records progress event with diffData and creates changeset', async () => {
      const service = new InMemoryAgentHistoryService();
      const { taskId, runId } = await service.createTask(workspaceId, 'Refactor CSS');

      await service.recordProgressEvent(taskId, runId, {
        state: 'AWAITING_APPROVAL',
        stepName: 'Diff Review',
        message: 'Proposed modifications to style.css',
        diffData: {
          changeSetId: 'cs-001',
          filePath: 'src/style.css',
          originalContent: 'body { color: black; }',
          modifiedContent: 'body { color: white; }',
        },
      });

      const details = await service.getTaskDetails(taskId);
      expect(details?.status).toBe('awaiting_review');
      expect(details?.hasDiff).toBe(true);
      expect(details?.changedFiles).toContain('src/style.css');
      expect(details?.changeSet?.id).toBe('cs-001');
      expect(details?.changeSet?.diffData?.filePath).toBe('src/style.css');
    });

    it('records tool execution and tool results', async () => {
      const service = new InMemoryAgentHistoryService();
      const { taskId, runId } = await service.createTask(workspaceId, 'Run tests');

      await service.recordProgressEvent(taskId, runId, {
        state: 'EXECUTING',
        stepName: 'Execute Tool',
        message: 'Executing tool runTests',
      });

      await service.recordProgressEvent(taskId, runId, {
        state: 'EXECUTING',
        stepName: 'Tool Result',
        message: 'Executing tool runTests finished: 4 passed',
      });

      const details = await service.getTaskDetails(taskId);
      expect(details?.toolCalls.length).toBe(2);
      expect(details?.toolCalls[0].toolName).toBe('runTests');
      expect(details?.toolCalls[1].result).toContain('4 passed');
    });

    it('completes task and run on SUCCESS event and adds assistant conversation message', async () => {
      const service = new InMemoryAgentHistoryService();
      const { taskId, runId } = await service.createTask(workspaceId, 'Build feature');

      await service.recordProgressEvent(taskId, runId, {
        state: 'SUCCESS',
        stepName: 'Task Completed',
        message: 'Feature successfully implemented!',
      });

      const details = await service.getTaskDetails(taskId);
      expect(details?.status).toBe('completed');
      expect(details?.runs[0].status).toBe('completed');
      expect(details?.runs[0].completedAt).toBeDefined();
      expect(details?.conversations.length).toBe(2);
      expect(details?.conversations[1].role).toBe('assistant');
      expect(details?.conversations[1].content).toBe('Feature successfully implemented!');
    });

    it('stores multiple conversation turns and preserves chat history', async () => {
      const service = new InMemoryAgentHistoryService();
      const { taskId } = await service.createTask(workspaceId, 'Initial user question');

      await service.addConversation(taskId, 'assistant', 'Initial AI answer');
      await service.addConversation(taskId, 'user', 'Follow-up user question');
      await service.addConversation(taskId, 'assistant', 'Follow-up AI answer');

      const details = await service.getTaskDetails(taskId);
      expect(details?.conversations.length).toBe(4);
      expect(details?.conversations[0].role).toBe('user');
      expect(details?.conversations[0].content).toBe('Initial user question');
      expect(details?.conversations[1].role).toBe('assistant');
      expect(details?.conversations[1].content).toBe('Initial AI answer');
      expect(details?.conversations[2].role).toBe('user');
      expect(details?.conversations[2].content).toBe('Follow-up user question');
      expect(details?.conversations[3].role).toBe('assistant');
      expect(details?.conversations[3].content).toBe('Follow-up AI answer');
    });
  });

  describe('Agent History Routes (HTTP / API v1)', () => {
    it('returns 401 Unauthorized if no auth token is provided', async () => {
      const res = await app.request(`/api/v1/workspaces/${workspaceId}/agent/tasks`, {
        method: 'GET',
      });
      expect(res.status).toBe(401);
    });

    it('POST /api/v1/workspaces/:wsId/agent/tasks creates task and returns 201', async () => {
      const res = await app.request(`/api/v1/workspaces/${workspaceId}/agent/tasks`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({ prompt: 'Implement login page' }),
      });

      expect(res.status).toBe(201);
      const data = (await res.json()) as any;
      expect(data.taskId).toBeDefined();
      expect(data.runId).toBeDefined();
    });

    it('POST /api/v1/workspaces/:wsId/agent/tasks returns 400 for empty prompt', async () => {
      const res = await app.request(`/api/v1/workspaces/${workspaceId}/agent/tasks`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({ prompt: '' }),
      });

      expect(res.status).toBe(400);
    });

    it('GET /api/v1/workspaces/:wsId/agent/tasks returns task summaries', async () => {
      // Create two tasks
      await app.request(`/api/v1/workspaces/${workspaceId}/agent/tasks`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({ prompt: 'Task A' }),
      });
      await app.request(`/api/v1/workspaces/${workspaceId}/agent/tasks`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({ prompt: 'Task B' }),
      });

      const res = await app.request(`/api/v1/workspaces/${workspaceId}/agent/tasks`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
      });

      expect(res.status).toBe(200);
      const data = (await res.json()) as any;
      expect(data.tasks).toBeDefined();
      expect(data.tasks.length).toBe(2);
      expect(data.tasks[0].prompt).toBe('Task B');
      expect(data.tasks[1].prompt).toBe('Task A');
    });

    it('GET /api/v1/agent/tasks/:taskId returns full task details', async () => {
      const createRes = await app.request(`/api/v1/workspaces/${workspaceId}/agent/tasks`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({ prompt: 'Task with full details' }),
      });
      const { taskId, runId } = (await createRes.json()) as any;

      // Post progress event
      await app.request(`/api/v1/agent/tasks/${taskId}/progress`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          runId,
          event: {
            state: 'SUCCESS',
            stepName: 'Completed',
            message: 'All done',
          },
        }),
      });

      const getRes = await app.request(`/api/v1/agent/tasks/${taskId}`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
      });

      expect(getRes.status).toBe(200);
      const data = (await getRes.json()) as any;
      expect(data.task).toBeDefined();
      expect(data.task.id).toBe(taskId);
      expect(data.task.status).toBe('completed');
      expect(data.task.conversations.length).toBe(2);
    });

    it('GET /api/v1/agent/tasks/:taskId returns 404 for nonexistent task', async () => {
      const res = await app.request('/api/v1/agent/tasks/non-existent-id', {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
      });
      expect(res.status).toBe(404);
    });

    it('POST /api/v1/agent/tasks/:taskId/changesets saves a changeset', async () => {
      const createRes = await app.request(`/api/v1/workspaces/${workspaceId}/agent/tasks`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({ prompt: 'Generate diff' }),
      });
      const { taskId, runId } = (await createRes.json()) as any;

      const csRes = await app.request(`/api/v1/agent/tasks/${taskId}/changesets`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          runId,
          patch: '--- a/file.txt\n+++ b/file.txt\n@@ -1 +1 @@\n-old\n+new',
          changedFiles: ['file.txt'],
        }),
      });

      expect(csRes.status).toBe(201);
      const csData = (await csRes.json()) as any;
      expect(csData.changeSetId).toBeDefined();

      const detailsRes = await app.request(`/api/v1/agent/tasks/${taskId}`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
      });
      const details = (await detailsRes.json()) as any;
      expect(details.task.hasDiff).toBe(true);
      expect(details.task.changedFiles).toEqual(['file.txt']);
    });

    it('PATCH /api/v1/agent/tasks/:taskId/status updates status', async () => {
      const createRes = await app.request(`/api/v1/workspaces/${workspaceId}/agent/tasks`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({ prompt: 'Status test' }),
      });
      const { taskId } = (await createRes.json()) as any;

      const patchRes = await app.request(`/api/v1/agent/tasks/${taskId}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({ status: 'completed' }),
      });

      expect(patchRes.status).toBe(200);

      const detailsRes = await app.request(`/api/v1/agent/tasks/${taskId}`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
      });
      const details = (await detailsRes.json()) as any;
      expect(details.task.status).toBe('completed');
    });

    it('POST /api/v1/agent/tasks/:taskId/conversations adds message to conversation', async () => {
      const createRes = await app.request(`/api/v1/workspaces/${workspaceId}/agent/tasks`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({ prompt: 'Turn 1' }),
      });
      const { taskId } = (await createRes.json()) as any;

      const convRes = await app.request(`/api/v1/agent/tasks/${taskId}/conversations`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          role: 'assistant',
          content: 'Turn 1 AI response',
        }),
      });
      expect(convRes.status).toBe(201);

      const detailsRes = await app.request(`/api/v1/agent/tasks/${taskId}`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
      });
      const details = (await detailsRes.json()) as any;
      expect(details.task.conversations.length).toBe(2);
      expect(details.task.conversations[1].content).toBe('Turn 1 AI response');
    });

    it('POST /api/v1/agent/tasks/:taskId/runs/:runId/progress records event', async () => {
      const createRes = await app.request(`/api/v1/workspaces/${workspaceId}/agent/tasks`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({ prompt: 'Progress task' }),
      });
      const { taskId, runId } = (await createRes.json()) as any;

      const progRes = await app.request(`/api/v1/agent/tasks/${taskId}/runs/${runId}/progress`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          state: 'SUCCESS',
          stepName: 'Done',
          message: 'Task completed cleanly',
        }),
      });
      expect(progRes.status).toBe(200);

      const detailsRes = await app.request(`/api/v1/agent/tasks/${taskId}`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
      });
      const details = (await detailsRes.json()) as any;
      expect(details.task.status).toBe('completed');
      expect(details.task.conversations.length).toBe(2);
      expect(details.task.conversations[1].content).toBe('Task completed cleanly');
    });

    it('enforces workspace/project membership RBAC (403 Forbidden for non-members) across all routes', async () => {
      const { taskId, runId } = await inMemoryAgentHistoryService.createTask(
        workspaceId,
        'Authorized task'
      );

      // Workspace-scoped routes
      const listRes = await app.request(`/api/v1/workspaces/${workspaceId}/agent/tasks`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${outsiderToken}` },
      });
      expect(listRes.status).toBe(403);

      const createRes = await app.request(`/api/v1/workspaces/${workspaceId}/agent/tasks`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${outsiderToken}`,
        },
        body: JSON.stringify({ prompt: 'Unauthorized' }),
      });
      expect(createRes.status).toBe(403);

      // Task-scoped routes
      const getRes = await app.request(`/api/v1/agent/tasks/${taskId}`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${outsiderToken}` },
      });
      expect(getRes.status).toBe(403);

      const convRes = await app.request(`/api/v1/agent/tasks/${taskId}/conversations`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${outsiderToken}`,
        },
        body: JSON.stringify({ role: 'user', content: 'Inject' }),
      });
      expect(convRes.status).toBe(403);

      const runProgRes = await app.request(
        `/api/v1/agent/tasks/${taskId}/runs/${runId}/progress`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${outsiderToken}`,
          },
          body: JSON.stringify({ state: 'EXECUTING' }),
        }
      );
      expect(runProgRes.status).toBe(403);

      const runCsRes = await app.request(
        `/api/v1/agent/tasks/${taskId}/runs/${runId}/changeset`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${outsiderToken}`,
          },
          body: JSON.stringify({ patch: 'diff' }),
        }
      );
      expect(runCsRes.status).toBe(403);

      const progRes = await app.request(`/api/v1/agent/tasks/${taskId}/progress`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${outsiderToken}`,
        },
        body: JSON.stringify({ runId, event: { state: 'EXECUTING' } }),
      });
      expect(progRes.status).toBe(403);

      const csRes = await app.request(`/api/v1/agent/tasks/${taskId}/changesets`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${outsiderToken}`,
        },
        body: JSON.stringify({ runId, patch: 'diff', changedFiles: [] }),
      });
      expect(csRes.status).toBe(403);

      const statusRes = await app.request(`/api/v1/agent/tasks/${taskId}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${outsiderToken}`,
        },
        body: JSON.stringify({ status: 'failed' }),
      });
      expect(statusRes.status).toBe(403);
    });

    it('allows viewer read access (200) but rejects viewer mutations (403)', async () => {
      const { taskId } = await inMemoryAgentHistoryService.createTask(
        workspaceId,
        'Viewer readable task'
      );

      const listRes = await app.request(`/api/v1/workspaces/${workspaceId}/agent/tasks`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${viewerToken}` },
      });
      expect(listRes.status).toBe(200);

      const getRes = await app.request(`/api/v1/agent/tasks/${taskId}`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${viewerToken}` },
      });
      expect(getRes.status).toBe(200);

      const createRes = await app.request(`/api/v1/workspaces/${workspaceId}/agent/tasks`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${viewerToken}`,
        },
        body: JSON.stringify({ prompt: 'Viewer should not create' }),
      });
      expect(createRes.status).toBe(403);

      const statusRes = await app.request(`/api/v1/agent/tasks/${taskId}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${viewerToken}`,
        },
        body: JSON.stringify({ status: 'failed' }),
      });
      expect(statusRes.status).toBe(403);
    });
  });
});
