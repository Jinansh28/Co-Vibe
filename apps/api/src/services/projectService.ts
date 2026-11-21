import crypto from 'node:crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { User, Project, Workspace, ProjectMember } from '@co-vibe/shared';
import type { CreateProjectInput, CreateWorkspaceInput, ProjectMemberRole } from '@co-vibe/protocol';
import type { Env } from '../middleware/auth.js';

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

export type GetProjectResult =
  | { status: 'ok'; project: Project; role: ProjectMemberRole; members: ProjectMember[]; workspaces: Workspace[] }
  | { status: 'invalid_id' }
  | { status: 'not_found' }
  | { status: 'forbidden' };

export type CreateWorkspaceResult =
  | { status: 'ok'; workspace: Workspace }
  | { status: 'invalid_id' }
  | { status: 'not_found' }
  | { status: 'forbidden'; message?: string };

export type ListWorkspacesResult =
  | { status: 'ok'; workspaces: Workspace[] }
  | { status: 'invalid_id' }
  | { status: 'not_found' }
  | { status: 'forbidden' };

export type JoinProjectResult =
  | { status: 'ok'; project: Project; member: ProjectMember }
  | { status: 'not_found' }
  | { status: 'already_member' };

export interface IProjectService {
  reset(): void;
  getOrCreateUser(authUserId: string, email: string): Promise<User>;
  createProject(
    authUserId: string,
    email: string,
    input: CreateProjectInput
  ): Promise<{ project: Project; member: ProjectMember }>;
  getProject(projectId: string, authUserId: string): Promise<GetProjectResult>;
  listUserProjects(authUserId: string, email?: string): Promise<Project[]>;
  createWorkspace(
    projectId: string,
    authUserId: string,
    input: CreateWorkspaceInput
  ): Promise<CreateWorkspaceResult>;
  listWorkspaces(projectId: string, authUserId: string): Promise<ListWorkspacesResult>;
  addMember(
    projectId: string,
    authUserId: string,
    email: string,
    role: ProjectMemberRole
  ): Promise<ProjectMember>;
  joinProjectByCode(
    joinCode: string,
    authUserId: string,
    email: string
  ): Promise<JoinProjectResult>;
}

// ---------------------------------------------------------------------------
// Helpers: Map Database Rows (snake_case) to TypeScript Models (camelCase)
// ---------------------------------------------------------------------------

function mapUser(row: any): User {
  return {
    id: row.id,
    authUserId: row.auth_user_id,
    email: row.email,
    displayName: row.display_name ?? undefined,
    avatarUrl: row.avatar_url ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapProject(row: any): Project {
  return {
    id: row.id,
    ownerId: row.owner_id,
    name: row.name,
    description: row.description ?? undefined,
    joinCode: row.join_code ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function isTableMissingError(err: any): boolean {
  if (!err) return false;
  return (
    err.code === 'PGRST205' ||
    (typeof err.message === 'string' &&
      (err.message.includes('PGRST205') || err.message.includes('Could not find the table')))
  );
}

function mapMember(row: any): ProjectMember {
  return {
    id: row.id,
    projectId: row.project_id,
    userId: row.user_id,
    role: row.role,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapWorkspace(row: any): Workspace {
  return {
    id: row.id,
    projectId: row.project_id,
    name: row.name,
    activeBranch: row.active_branch ?? 'main',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// ---------------------------------------------------------------------------
// Implementation 1: Supabase PostgreSQL Service (Production / Dev)
// ---------------------------------------------------------------------------

export class SupabaseProjectService implements IProjectService {
  private fallback: InMemoryProjectService = inMemoryProjectService;

  constructor(private client: SupabaseClient) {}

  public reset(): void {
    this.fallback.reset();
  }

  public async getOrCreateUser(authUserId: string, email: string): Promise<User> {
    const { data: existingUser, error: findErr } = await this.client
      .from('users')
      .select('*')
      .eq('auth_user_id', authUserId)
      .maybeSingle();

    if (isTableMissingError(findErr)) {
      return this.fallback.getOrCreateUser(authUserId, email);
    }

    if (existingUser) {
      return mapUser(existingUser);
    }

    const now = new Date().toISOString();
    const newUser = {
      auth_user_id: authUserId,
      email,
      display_name: email.split('@')[0],
      created_at: now,
      updated_at: now,
    };

    const { data: created, error } = await this.client
      .from('users')
      .insert(newUser)
      .select('*')
      .single();

    if (error || !created) {
      if (isTableMissingError(error)) {
        return this.fallback.getOrCreateUser(authUserId, email);
      }
      // Handle race condition: check if inserted concurrently
      const { data: retryUser } = await this.client
        .from('users')
        .select('*')
        .eq('auth_user_id', authUserId)
        .maybeSingle();
      if (retryUser) return mapUser(retryUser);

      throw new Error(`Failed to create user: ${error?.message}`);
    }

    return mapUser(created);
  }

  public async createProject(
    authUserId: string,
    email: string,
    input: CreateProjectInput
  ): Promise<{ project: Project; member: ProjectMember }> {
    const user = await this.getOrCreateUser(authUserId, email);
    const now = new Date().toISOString();
    const joinCode = Array.from({ length: 6 }, () =>
      'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'[Math.floor(Math.random() * 36)]
    ).join('');

    const newProject = {
      owner_id: user.id,
      name: input.name,
      description: input.description ?? null,
      join_code: joinCode,
      created_at: now,
      updated_at: now,
    };

    const { data: projectRow, error: pErr } = await this.client
      .from('projects')
      .insert(newProject)
      .select('*')
      .single();

    if (isTableMissingError(pErr)) {
      return this.fallback.createProject(authUserId, email, input);
    }

    if (pErr || !projectRow) {
      throw new Error(`Failed to create project: ${pErr?.message}`);
    }

    const newMember = {
      project_id: projectRow.id,
      user_id: user.id,
      role: 'owner',
      created_at: now,
      updated_at: now,
    };

    const { data: memberRow, error: mErr } = await this.client
      .from('project_members')
      .insert(newMember)
      .select('*')
      .single();

    if (isTableMissingError(mErr)) {
      return this.fallback.createProject(authUserId, email, input);
    }

    if (mErr || !memberRow) {
      throw new Error(`Failed to add project owner: ${mErr?.message}`);
    }

    return {
      project: mapProject(projectRow),
      member: mapMember(memberRow),
    };
  }

  public async getProject(projectId: string, authUserId: string): Promise<GetProjectResult> {
    if (!isValidUuid(projectId)) {
      return { status: 'invalid_id' };
    }

    // High-performance single-roundtrip join via PostgREST
    const { data: projectRow, error: pErr } = await this.client
      .from('projects')
      .select(`
        *,
        project_members (*),
        workspaces (*)
      `)
      .eq('id', projectId)
      .maybeSingle();

    if (isTableMissingError(pErr)) {
      return this.fallback.getProject(projectId, authUserId);
    }

    if (pErr || !projectRow) {
      return { status: 'not_found' };
    }

    const { data: userRow } = await this.client
      .from('users')
      .select('id')
      .eq('auth_user_id', authUserId)
      .maybeSingle();

    if (!userRow) {
      return { status: 'forbidden' };
    }

    const members: ProjectMember[] = (projectRow.project_members || []).map(mapMember);
    const currentMember = members.find((m) => m.userId === userRow.id);

    if (!currentMember) {
      return { status: 'forbidden' };
    }

    const workspaces: Workspace[] = (projectRow.workspaces || []).map(mapWorkspace);

    return {
      status: 'ok',
      project: mapProject(projectRow),
      role: currentMember.role,
      members,
      workspaces,
    };
  }

  public async listUserProjects(authUserId: string, email?: string): Promise<Project[]> {
    const { data: userRow, error: uErr } = await this.client
      .from('users')
      .select('id')
      .eq('auth_user_id', authUserId)
      .maybeSingle();

    if (isTableMissingError(uErr)) {
      return this.fallback.listUserProjects(authUserId, email);
    }

    let userId = userRow?.id;
    if (!userId) {
      if (email) {
        const newUser = await this.getOrCreateUser(authUserId, email);
        userId = newUser.id;
      } else {
        return [];
      }
    }

    const { data: memberRows, error: mErr } = await this.client
      .from('project_members')
      .select(`
        project_id,
        projects (*)
      `)
      .eq('user_id', userId);

    if (isTableMissingError(mErr)) {
      return this.fallback.listUserProjects(authUserId, email);
    }

    if (mErr || !memberRows) {
      return [];
    }

    const result: Project[] = [];
    for (const row of memberRows) {
      if (row.projects) {
        result.push(mapProject(row.projects));
      }
    }
    return result;
  }

  public async createWorkspace(
    projectId: string,
    authUserId: string,
    input: CreateWorkspaceInput
  ): Promise<CreateWorkspaceResult> {
    if (!isValidUuid(projectId)) {
      return { status: 'invalid_id' };
    }

    const { data: projectRow, error: pErr } = await this.client
      .from('projects')
      .select('id')
      .eq('id', projectId)
      .maybeSingle();

    if (isTableMissingError(pErr)) {
      return this.fallback.createWorkspace(projectId, authUserId, input);
    }

    if (!projectRow) {
      return { status: 'not_found' };
    }

    const { data: userRow } = await this.client
      .from('users')
      .select('id')
      .eq('auth_user_id', authUserId)
      .maybeSingle();

    if (!userRow) {
      return { status: 'forbidden', message: 'User is not a member of this project' };
    }

    const { data: memberRow } = await this.client
      .from('project_members')
      .select('role')
      .eq('project_id', projectId)
      .eq('user_id', userRow.id)
      .maybeSingle();

    if (!memberRow) {
      return { status: 'forbidden', message: 'User is not a member of this project' };
    }

    if (memberRow.role === 'viewer') {
      return { status: 'forbidden', message: 'Viewer role cannot create workspaces' };
    }

    const now = new Date().toISOString();
    const workspaceRow = {
      project_id: projectId,
      name: input.name,
      active_branch: input.activeBranch || 'main',
      created_at: now,
      updated_at: now,
    };

    const { data: wsData, error: wsErr } = await this.client
      .from('workspaces')
      .insert(workspaceRow)
      .select('*')
      .single();

    if (isTableMissingError(wsErr)) {
      return this.fallback.createWorkspace(projectId, authUserId, input);
    }

    if (wsErr || !wsData) {
      throw new Error(`Failed to create workspace: ${wsErr?.message}`);
    }

    return { status: 'ok', workspace: mapWorkspace(wsData) };
  }

  public async listWorkspaces(projectId: string, authUserId: string): Promise<ListWorkspacesResult> {
    if (!isValidUuid(projectId)) {
      return { status: 'invalid_id' };
    }

    const { data: projectRow, error: pErr } = await this.client
      .from('projects')
      .select('id')
      .eq('id', projectId)
      .maybeSingle();

    if (isTableMissingError(pErr)) {
      return this.fallback.listWorkspaces(projectId, authUserId);
    }

    if (!projectRow) {
      return { status: 'not_found' };
    }

    const { data: userRow } = await this.client
      .from('users')
      .select('id')
      .eq('auth_user_id', authUserId)
      .maybeSingle();

    if (!userRow) {
      return { status: 'forbidden' };
    }

    const { data: memberRow } = await this.client
      .from('project_members')
      .select('role')
      .eq('project_id', projectId)
      .eq('user_id', userRow.id)
      .maybeSingle();

    if (!memberRow) {
      return { status: 'forbidden' };
    }

    const { data: wsRows, error: wsErr } = await this.client
      .from('workspaces')
      .select('*')
      .eq('project_id', projectId);

    if (isTableMissingError(wsErr)) {
      return this.fallback.listWorkspaces(projectId, authUserId);
    }

    if (wsErr || !wsRows) {
      return { status: 'ok', workspaces: [] };
    }

    return { status: 'ok', workspaces: wsRows.map(mapWorkspace) };
  }

  public async addMember(
    projectId: string,
    authUserId: string,
    email: string,
    role: ProjectMemberRole
  ): Promise<ProjectMember> {
    const user = await this.getOrCreateUser(authUserId, email);
    const now = new Date().toISOString();
    const memberRow = {
      project_id: projectId,
      user_id: user.id,
      role,
      created_at: now,
      updated_at: now,
    };

    const { data: createdMember, error: mErr } = await this.client
      .from('project_members')
      .upsert(memberRow, { onConflict: 'project_id,user_id' })
      .select('*')
      .single();

    if (isTableMissingError(mErr)) {
      return this.fallback.addMember(projectId, authUserId, email, role);
    }

    if (mErr || !createdMember) {
      throw new Error(`Failed to add member: ${mErr?.message}`);
    }

    return mapMember(createdMember);
  }

  public async joinProjectByCode(
    joinCode: string,
    authUserId: string,
    email: string
  ): Promise<JoinProjectResult> {
    const { data: projectRow, error: pErr } = await this.client
      .from('projects')
      .select('*')
      .eq('join_code', joinCode)
      .maybeSingle();

    if (isTableMissingError(pErr)) {
      return this.fallback.joinProjectByCode(joinCode, authUserId, email);
    }

    if (pErr || !projectRow) {
      return { status: 'not_found' };
    }

    const user = await this.getOrCreateUser(authUserId, email);

    const { data: existingMember } = await this.client
      .from('project_members')
      .select('*')
      .eq('project_id', projectRow.id)
      .eq('user_id', user.id)
      .maybeSingle();

    if (existingMember) {
      return { status: 'already_member' };
    }

    const now = new Date().toISOString();
    const memberRow = {
      project_id: projectRow.id,
      user_id: user.id,
      role: 'editor',
      created_at: now,
      updated_at: now,
    };

    const { data: createdMember, error: mErr } = await this.client
      .from('project_members')
      .insert(memberRow)
      .select('*')
      .single();

    if (isTableMissingError(mErr)) {
      return this.fallback.joinProjectByCode(joinCode, authUserId, email);
    }

    if (mErr || !createdMember) {
      throw new Error(`Failed to join project: ${mErr?.message}`);
    }

    return {
      status: 'ok',
      project: mapProject(projectRow),
      member: mapMember(createdMember),
    };
  }
}

// ---------------------------------------------------------------------------
// Implementation 2: In-Memory Service (Offline Vitest Tests & Fallback)
// ---------------------------------------------------------------------------

export class InMemoryProjectService implements IProjectService {
  private users: Map<string, User> = new Map();
  private userAuthMap: Map<string, string> = new Map();
  private projects: Map<string, Project> = new Map();
  private projectMembers: Map<string, ProjectMember> = new Map();
  private workspaces: Map<string, Workspace> = new Map();

  public reset(): void {
    this.users.clear();
    this.userAuthMap.clear();
    this.projects.clear();
    this.projectMembers.clear();
    this.workspaces.clear();
  }

  public async getOrCreateUser(authUserId: string, email: string): Promise<User> {
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

  public async createProject(
    authUserId: string,
    email: string,
    input: CreateProjectInput
  ): Promise<{ project: Project; member: ProjectMember }> {
    const user = await this.getOrCreateUser(authUserId, email);
    const now = new Date().toISOString();
    const joinCode = Array.from({ length: 6 }, () =>
      'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'[Math.floor(Math.random() * 36)]
    ).join('');

    const project: Project = {
      id: generateUUID(),
      ownerId: user.id,
      name: input.name,
      description: input.description,
      joinCode,
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

  public async getProject(projectId: string, authUserId: string): Promise<GetProjectResult> {
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

  public async listUserProjects(authUserId: string, email?: string): Promise<Project[]> {
    const userId = this.userAuthMap.get(authUserId);
    if (!userId) {
      if (email) {
        await this.getOrCreateUser(authUserId, email);
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

  public async createWorkspace(
    projectId: string,
    authUserId: string,
    input: CreateWorkspaceInput
  ): Promise<CreateWorkspaceResult> {
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

  public async listWorkspaces(projectId: string, authUserId: string): Promise<ListWorkspacesResult> {
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

  public async addMember(
    projectId: string,
    authUserId: string,
    email: string,
    role: ProjectMemberRole
  ): Promise<ProjectMember> {
    const user = await this.getOrCreateUser(authUserId, email);
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

  public async joinProjectByCode(
    joinCode: string,
    authUserId: string,
    email: string
  ): Promise<JoinProjectResult> {
    let targetProject: Project | null = null;
    for (const proj of this.projects.values()) {
      if (proj.joinCode === joinCode) {
        targetProject = proj;
        break;
      }
    }

    if (!targetProject) {
      return { status: 'not_found' };
    }

    const user = await this.getOrCreateUser(authUserId, email);
    const memberKey = `${targetProject.id}:${user.id}`;
    if (this.projectMembers.has(memberKey)) {
      return { status: 'already_member' };
    }

    const now = new Date().toISOString();
    const member: ProjectMember = {
      id: generateUUID(),
      projectId: targetProject.id,
      userId: user.id,
      role: 'editor',
      createdAt: now,
      updatedAt: now,
    };
    this.projectMembers.set(memberKey, member);

    return { status: 'ok', project: targetProject, member };
  }
}

// ---------------------------------------------------------------------------
// Singleton & Factory resolution
// ---------------------------------------------------------------------------

export const inMemoryProjectService = new InMemoryProjectService();
export const projectService = inMemoryProjectService;

let cachedClient: SupabaseClient | null = null;
let cachedKey = '';

export function getProjectService(env?: Env['Bindings']): IProjectService {
  const supabaseUrl =
    env?.SUPABASE_URL ||
    (typeof process !== 'undefined' ? process.env?.SUPABASE_URL : undefined);
  const serviceRoleKey =
    (env as any)?.SUPABASE_SERVICE_ROLE_KEY ||
    (typeof process !== 'undefined' ? process.env?.SUPABASE_SERVICE_ROLE_KEY : undefined);

  if (supabaseUrl && serviceRoleKey) {
    const keyPair = `${supabaseUrl}::${serviceRoleKey}`;
    if (!cachedClient || cachedKey !== keyPair) {
      cachedClient = createClient(supabaseUrl, serviceRoleKey, {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
      });
      cachedKey = keyPair;
    }
    return new SupabaseProjectService(cachedClient);
  }

  return inMemoryProjectService;
}
