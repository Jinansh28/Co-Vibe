import { describe, it, expect } from 'vitest';
import type { HealthStatus, User, Project, Workspace } from '../src/index.js';

describe('Shared Package Types', () => {
  it('should instantiate valid HealthStatus object', () => {
    const health: HealthStatus = {
      service: 'test-service',
      status: 'ok',
      timestamp: Date.now(),
      version: '0.1.0',
    };

    expect(health.service).toBe('test-service');
    expect(health.status).toBe('ok');
    expect(typeof health.timestamp).toBe('number');
  });

  it('should instantiate valid User, Project, and Workspace objects', () => {
    const user: User = {
      id: 'usr_1',
      authUserId: 'auth_1',
      email: 'dev@example.com',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const project: Project = {
      id: 'prj_1',
      ownerId: user.id,
      name: 'Test Project',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const workspace: Workspace = {
      id: 'ws_1',
      projectId: project.id,
      name: 'main-workspace',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    expect(project.ownerId).toBe(user.id);
    expect(workspace.projectId).toBe(project.id);
  });
});
