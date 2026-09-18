import crypto from 'node:crypto';
import type { User, Project, Workspace, ProjectMember } from '@co-vibe/shared';
import type { CreateProjectInput, CreateWorkspaceInput, ProjectMemberRole } from '@co-vibe/protocol';

function generateUUID(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isValidUuid(id: string): boolean {
  return UUID_REGEX.test(id);
}

export class ProjectService {
  private users: Map<string, User> = new Map(); // key: id
  private userAuthMap: Map<string, string> = new Map(); // key: authUserId -> user.id
  private projects: Map<string, Project> = new Map(); // key: id
  private projectMembers: Map<string, ProjectMember> = new Map(); // key: `${projectId}:${userId}`
  private workspaces: Map<string, Workspace> = new Map(); // key: id

  /**
   * Resets internal in-memory store (useful for testing)
   */
  public reset(): void {
    this.users.clear();
    this.userAuthMap.clear();
    this.projects.clear();
    this.projectMembers.clear();
    this.workspaces.clear();
  }

  /**
   * Gets or creates a internal user record linked to authUserId (Supabase sub)
   */
  public getOrCreateUser(authUserId: string, email: string): User {
    const userId = this.userAuthMap.get(authUserId);
    if (userId && this.users.has(userId)) {
      return this.users.get(userId)!;
    }

    const now = new Date().toISOString();
    const newUser: User = {
      id: generateUUID(),
      authUserId,
      email,
      displayName: email.split('@')[0],
      createdAt: now,
      updatedAt: now,
    };

    this.users.set(newUser.id, newUser);
    this.userAuthMap.set(authUserId, newUser.id);
    return newUser;
  }

  /**
   * Creates a new project and assigns creator as owner in project_members
   */
  public createProject(
    authUserId: string,
    email: string,
    input: CreateProjectInput
  ): { project: Project; member: ProjectMember } {
    const user = this.getOrCreateUser(authUserId, email);
    const now = new Date().toISOString();

    const project: Project = {
      id: generateUUID(),
      ownerId: user.id,
      name: input.name,
      description: input.description,
      createdAt: now,
      updatedAt: now,
    };

    const member: ProjectMember = {
      id: generateUUID(),
      projectId: project.id,
      userId: user.id,
      role: 'owner',
      createdAt: now,
      updatedAt: now,
    };

    this.projects.set(project.id, project);
    this.projectMembers.set(`${project.id}:${user.id}`, member);

    return { project, member };
  }

  /**
   * Retrieves a project details + members + workspaces if user has membership
   */
  public getProject(
    projectId: string,
    authUserId: string
  ):
    | { status: 'ok'; project: Project; role: ProjectMemberRole; members: ProjectMember[]; workspaces: Workspace[] }
    | { status: 'invalid_id' }
    | { status: 'not_found' }
    | { status: 'forbidden' } {
    if (!isValidUuid(projectId)) {
      return { status: 'invalid_id' };
    }

    const project = this.projects.get(projectId);
    if (!project) {
      return { status: 'not_found' };
    }

    const userId = this.userAuthMap.get(authUserId);
    if (!userId) {
      return { status: 'forbidden' };
    }

    const memberKey = `${projectId}:${userId}`;
    const currentMember = this.projectMembers.get(memberKey);
    if (!currentMember) {
      return { status: 'forbidden' };
    }

    const members: ProjectMember[] = [];
    for (const [key, mem] of this.projectMembers.entries()) {
      if (key.startsWith(`${projectId}:`)) {
        members.push(mem);
      }
    }

    const workspaces: Workspace[] = [];
    for (const ws of this.workspaces.values()) {
      if (ws.projectId === projectId) {
        workspaces.push(ws);
      }
    }

    return {
      status: 'ok',
      project,
      role: currentMember.role,
      members,
      workspaces,
    };
  }

  /**
   * Lists projects accessible to the authenticated user
   */
  public listUserProjects(authUserId: string, email?: string): Project[] {
    const userId = this.userAuthMap.get(authUserId);
    if (!userId) {
      if (email) {
        this.getOrCreateUser(authUserId, email);
      } else {
        return [];
      }
    }

    const currentUserId = this.userAuthMap.get(authUserId);
    if (!currentUserId) return [];

    const accessibleProjectIds = new Set<string>();
    for (const [key, mem] of this.projectMembers.entries()) {
      const parts = key.split(':');
      if (parts[1] === currentUserId) {
        accessibleProjectIds.add(mem.projectId);
      }
    }

    const result: Project[] = [];
    for (const projectId of accessibleProjectIds) {
      const proj = this.projects.get(projectId);
      if (proj) {
        result.push(proj);
      }
    }

    return result;
  }

  /**
   * Spawns a new workspace for a project (RBAC: requires owner or editor role)
   */
  public createWorkspace(
    projectId: string,
    authUserId: string,
    input: CreateWorkspaceInput
  ):
    | { status: 'ok'; workspace: Workspace }
    | { status: 'invalid_id' }
    | { status: 'not_found' }
    | { status: 'forbidden'; message?: string } {
    if (!isValidUuid(projectId)) {
      return { status: 'invalid_id' };
    }

    const project = this.projects.get(projectId);
    if (!project) {
      return { status: 'not_found' };
    }

    const userId = this.userAuthMap.get(authUserId);
    if (!userId) {
      return { status: 'forbidden', message: 'User is not a member of this project' };
    }

    const memberKey = `${projectId}:${userId}`;
    const currentMember = this.projectMembers.get(memberKey);
    if (!currentMember) {
      return { status: 'forbidden', message: 'User is not a member of this project' };
    }

    if (currentMember.role === 'viewer') {
      return { status: 'forbidden', message: 'Viewer role cannot create workspaces' };
    }

    const now = new Date().toISOString();
    const workspace: Workspace = {
      id: generateUUID(),
      projectId,
      name: input.name,
      activeBranch: input.activeBranch || 'main',
      createdAt: now,
      updatedAt: now,
    };

    this.workspaces.set(workspace.id, workspace);
    return { status: 'ok', workspace };
  }

  /**
   * Lists all workspaces for a given project (requires member role)
   */
  public listWorkspaces(
    projectId: string,
    authUserId: string
  ):
    | { status: 'ok'; workspaces: Workspace[] }
    | { status: 'invalid_id' }
    | { status: 'not_found' }
    | { status: 'forbidden' } {
    if (!isValidUuid(projectId)) {
      return { status: 'invalid_id' };
    }

    const project = this.projects.get(projectId);
    if (!project) {
      return { status: 'not_found' };
    }

    const userId = this.userAuthMap.get(authUserId);
    if (!userId) {
      return { status: 'forbidden' };
    }

    const memberKey = `${projectId}:${userId}`;
    const currentMember = this.projectMembers.get(memberKey);
    if (!currentMember) {
      return { status: 'forbidden' };
    }

    const result: Workspace[] = [];
    for (const ws of this.workspaces.values()) {
      if (ws.projectId === projectId) {
        result.push(ws);
      }
    }

    return { status: 'ok', workspaces: result };
  }

  /**
   * Helper to add a member to a project with specific role (used in tests/invites)
   */
  public addMember(
    projectId: string,
    authUserId: string,
    email: string,
    role: ProjectMemberRole
  ): ProjectMember {
    const user = this.getOrCreateUser(authUserId, email);
    const now = new Date().toISOString();
    const member: ProjectMember = {
      id: generateUUID(),
      projectId,
      userId: user.id,
      role,
      createdAt: now,
      updatedAt: now,
    };
    this.projectMembers.set(`${projectId}:${user.id}`, member);
    return member;
  }
}

export const projectService = new ProjectService();
