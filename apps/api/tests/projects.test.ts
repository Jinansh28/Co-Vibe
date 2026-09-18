import { describe, it, expect, beforeEach } from 'vitest';
import { sign } from 'hono/jwt';
import app from '../src/index.js';
import { projectService } from '../src/services/projectService.js';

const SECRET = 'dev-secret-key-change-in-prod';

describe('Projects & Workspaces API Endpoints (TASK-010)', () => {
  let ownerToken: string;
  let memberToken: string;
  let viewerToken: string;
  let outsiderToken: string;

  const ownerSub = 'usr_owner_001';
  const ownerEmail = 'owner@co-vibe.dev';

  const memberSub = 'usr_member_002';
  const memberEmail = 'editor@co-vibe.dev';

  const viewerSub = 'usr_viewer_003';
  const viewerEmail = 'viewer@co-vibe.dev';

  const outsiderSub = 'usr_outsider_999';
  const outsiderEmail = 'outsider@co-vibe.dev';

  beforeEach(async () => {
    projectService.reset();

    const exp = Math.floor(Date.now() / 1000) + 3600;

    ownerToken = await sign({ sub: ownerSub, email: ownerEmail, exp }, SECRET, 'HS256');
    memberToken = await sign({ sub: memberSub, email: memberEmail, exp }, SECRET, 'HS256');
    viewerToken = await sign({ sub: viewerSub, email: viewerEmail, exp }, SECRET, 'HS256');
    outsiderToken = await sign({ sub: outsiderSub, email: outsiderEmail, exp }, SECRET, 'HS256');
  });

  describe('POST /api/v1/projects', () => {
    it('returns 401 Unauthorized if no token provided', async () => {
      const res = await app.request('/api/v1/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Test Project' }),
      });
      expect(res.status).toBe(401);
    });

    it('returns 400 Bad Request if project name is missing or empty', async () => {
      const res = await app.request('/api/v1/projects', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${ownerToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name: '' }),
      });
      expect(res.status).toBe(400);

      const body = (await res.json()) as Record<string, any>;
      expect(body.error).toBe('Bad Request');
    });

    it('creates project and assigns owner role in project_members (201 Created)', async () => {
      const res = await app.request('/api/v1/projects', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${ownerToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name: 'Co-Vibe MVP', description: 'Collaborative IDE Project' }),
      });

      expect(res.status).toBe(201);
      const body = (await res.json()) as Record<string, any>;
      expect(body.project).toBeDefined();
      expect(body.project.id).toBeDefined();
      expect(body.project.name).toBe('Co-Vibe MVP');
      expect(body.project.description).toBe('Collaborative IDE Project');

      expect(body.member).toBeDefined();
      expect(body.member.role).toBe('owner');

      // Verify detailed project fetch
      const getRes = await app.request(`/api/v1/projects/${body.project.id}`, {
        headers: { Authorization: `Bearer ${ownerToken}` },
      });
      expect(getRes.status).toBe(200);
      const getBody = (await getRes.json()) as Record<string, any>;
      expect(getBody.role).toBe('owner');
      expect(getBody.members).toHaveLength(1);
    });
  });

  describe('GET /api/v1/projects/:id', () => {
    it('returns 400 Bad Request for invalid UUID format', async () => {
      const res = await app.request('/api/v1/projects/not-a-valid-uuid', {
        headers: { Authorization: `Bearer ${ownerToken}` },
      });
      expect(res.status).toBe(400);

      const body = (await res.json()) as Record<string, any>;
      expect(body.error).toBe('Bad Request');
      expect(body.message).toBe('Invalid UUID format');
    });

    it('returns 404 Not Found for non-existent project UUID', async () => {
      const randomUuid = crypto.randomUUID();
      const res = await app.request(`/api/v1/projects/${randomUuid}`, {
        headers: { Authorization: `Bearer ${ownerToken}` },
      });
      expect(res.status).toBe(404);
    });

    it('returns 403 Forbidden when user is not a member of the project', async () => {
      // Create project as owner
      const createRes = await app.request('/api/v1/projects', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${ownerToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name: 'Private Repo' }),
      });
      const { project } = (await createRes.json()) as Record<string, any>;

      // Attempt to access project with outsiderToken
      const res = await app.request(`/api/v1/projects/${project.id}`, {
        headers: { Authorization: `Bearer ${outsiderToken}` },
      });

      expect(res.status).toBe(403);
      const body = (await res.json()) as Record<string, any>;
      expect(body.error).toBe('Forbidden');
      expect(body.message).toBe('User is not a member of this project');
    });
  });

  describe('POST /api/v1/projects/:id/workspaces', () => {
    it('returns 400 Bad Request if workspace name is missing', async () => {
      const createRes = await app.request('/api/v1/projects', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${ownerToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name: 'Workspace Test Project' }),
      });
      const { project } = (await createRes.json()) as Record<string, any>;

      const res = await app.request(`/api/v1/projects/${project.id}/workspaces`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${ownerToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name: '' }),
      });

      expect(res.status).toBe(400);
    });

    it('returns 403 Forbidden if user with viewer role attempts to spawn workspace', async () => {
      const createRes = await app.request('/api/v1/projects', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${ownerToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name: 'Viewer Workspace Test' }),
      });
      const { project } = (await createRes.json()) as Record<string, any>;

      // Add viewer member
      projectService.addMember(project.id, viewerSub, viewerEmail, 'viewer');

      const res = await app.request(`/api/v1/projects/${project.id}/workspaces`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${viewerToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name: 'Viewer Workspace' }),
      });

      expect(res.status).toBe(403);
      const body = (await res.json()) as Record<string, any>;
      expect(body.error).toBe('Forbidden');
      expect(body.message).toBe('Viewer role cannot create workspaces');
    });

    it('spawns workspace instance for project owner or editor (201 Created)', async () => {
      const createRes = await app.request('/api/v1/projects', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${ownerToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name: 'Workspace Creation Test' }),
      });
      const { project } = (await createRes.json()) as Record<string, any>;

      // Add editor member
      projectService.addMember(project.id, memberSub, memberEmail, 'editor');

      // Create workspace as editor
      const res = await app.request(`/api/v1/projects/${project.id}/workspaces`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${memberToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name: 'Feature Branch WS', activeBranch: 'feat/test' }),
      });

      expect(res.status).toBe(201);
      const body = (await res.json()) as Record<string, any>;
      expect(body.workspace).toBeDefined();
      expect(body.workspace.name).toBe('Feature Branch WS');
      expect(body.workspace.activeBranch).toBe('feat/test');
      expect(body.workspace.projectId).toBe(project.id);
    });
  });

  describe('GET /api/v1/projects/:id/workspaces', () => {
    it('returns list of workspaces for authorized project members', async () => {
      const createRes = await app.request('/api/v1/projects', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${ownerToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name: 'Workspace List Test' }),
      });
      const { project } = (await createRes.json()) as Record<string, any>;

      await app.request(`/api/v1/projects/${project.id}/workspaces`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${ownerToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name: 'WS 1' }),
      });

      const listRes = await app.request(`/api/v1/projects/${project.id}/workspaces`, {
        headers: { Authorization: `Bearer ${ownerToken}` },
      });

      expect(listRes.status).toBe(200);
      const listBody = (await listRes.json()) as Record<string, any>;
      expect(listBody.workspaces).toHaveLength(1);
      expect(listBody.workspaces[0].name).toBe('WS 1');
    });
  });
});
