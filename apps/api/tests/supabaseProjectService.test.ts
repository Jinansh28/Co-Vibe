import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SupabaseProjectService } from '../src/services/projectService.js';

describe('SupabaseProjectService Unit Tests', () => {
  let mockSupabase: any;
  let service: SupabaseProjectService;

  beforeEach(() => {
    mockSupabase = {
      from: vi.fn(),
    };
    service = new SupabaseProjectService(mockSupabase);
  });

  it('getOrCreateUser returns existing user if found', async () => {
    const mockUser = {
      id: 'usr-1',
      auth_user_id: 'auth-1',
      email: 'test@example.com',
      display_name: 'test',
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    };

    const queryBuilder = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: mockUser, error: null }),
    };
    mockSupabase.from.mockReturnValue(queryBuilder);

    const user = await service.getOrCreateUser('auth-1', 'test@example.com');
    expect(user.id).toBe('usr-1');
    expect(user.email).toBe('test@example.com');
    expect(user.authUserId).toBe('auth-1');
  });

  it('createProject inserts project and owner member', async () => {
    const mockUser = {
      id: 'usr-owner',
      auth_user_id: 'auth-owner',
      email: 'owner@example.com',
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    };

    const mockProjectRow = {
      id: 'proj-123',
      owner_id: 'usr-owner',
      name: 'New Project',
      description: 'Test Desc',
      join_code: 'CODE12',
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    };

    const mockMemberRow = {
      id: 'mem-123',
      project_id: 'proj-123',
      user_id: 'usr-owner',
      role: 'owner',
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    };

    mockSupabase.from.mockImplementation((table: string) => {
      if (table === 'users') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: mockUser, error: null }),
        };
      }
      if (table === 'projects') {
        return {
          insert: vi.fn().mockReturnThis(),
          select: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: mockProjectRow, error: null }),
        };
      }
      if (table === 'project_members') {
        return {
          insert: vi.fn().mockReturnThis(),
          select: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: mockMemberRow, error: null }),
        };
      }
      return {};
    });

    const result = await service.createProject('auth-owner', 'owner@example.com', {
      name: 'New Project',
      description: 'Test Desc',
    });

    expect(result.project.id).toBe('proj-123');
    expect(result.project.name).toBe('New Project');
    expect(result.member.role).toBe('owner');
  });

  it('getProject returns not_found if project does not exist', async () => {
    mockSupabase.from.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    });

    const result = await service.getProject('11111111-1111-4111-8111-111111111111', 'auth-1');
    expect(result.status).toBe('not_found');
  });

  it('getProject returns forbidden if user is not a member', async () => {
    const mockProject = {
      id: '11111111-1111-4111-8111-111111111111',
      owner_id: 'usr-other',
      name: 'Secret Project',
      project_members: [],
      workspaces: [],
    };

    mockSupabase.from.mockImplementation((table: string) => {
      if (table === 'projects') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: mockProject, error: null }),
        };
      }
      if (table === 'users') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'usr-outsider' }, error: null }),
        };
      }
      return {};
    });

    const result = await service.getProject('11111111-1111-4111-8111-111111111111', 'auth-outsider');
    expect(result.status).toBe('forbidden');
  });

  it('joinProjectByCode joins project with editor role', async () => {
    const mockProject = {
      id: '11111111-1111-1111-1111-111111111111',
      name: 'Collab Project',
      join_code: 'JOIN99',
    };

    const mockUser = {
      id: 'usr-joiner',
      auth_user_id: 'auth-joiner',
      email: 'joiner@example.com',
    };

    const mockMember = {
      id: 'mem-99',
      project_id: mockProject.id,
      user_id: mockUser.id,
      role: 'editor',
    };

    mockSupabase.from.mockImplementation((table: string) => {
      if (table === 'projects') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: mockProject, error: null }),
        };
      }
      if (table === 'users') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: mockUser, error: null }),
        };
      }
      if (table === 'project_members') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
          insert: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: mockMember, error: null }),
        };
      }
      return {};
    });

    const result = await service.joinProjectByCode('JOIN99', 'auth-joiner', 'joiner@example.com');
    expect(result.status).toBe('ok');
    if (result.status === 'ok') {
      expect(result.project.name).toBe('Collab Project');
      expect(result.member.role).toBe('editor');
    }
  });

  it('checkWorkspaceMembership returns ok with role for member and forbidden for non-member', async () => {
    const wsId = '11111111-1111-4111-8111-111111111111';
    const projId = '22222222-2222-4222-8222-222222222222';

    expect((await service.checkWorkspaceMembership('bad-id', 'auth-1')).status).toBe('invalid_id');

    mockSupabase.from.mockImplementation((table: string) => {
      if (table === 'workspaces') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: { id: wsId, project_id: projId }, error: null }),
        };
      }
      if (table === 'users') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'usr-1' }, error: null }),
        };
      }
      if (table === 'project_members') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: { role: 'editor' }, error: null }),
        };
      }
      return {};
    });

    const okRes = await service.checkWorkspaceMembership(wsId, 'auth-1');
    expect(okRes).toEqual({
      status: 'ok',
      projectId: projId,
      workspaceId: wsId,
      role: 'editor',
    });

    mockSupabase.from.mockImplementation((table: string) => {
      if (table === 'workspaces') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: { id: wsId, project_id: projId }, error: null }),
        };
      }
      if (table === 'users') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'usr-2' }, error: null }),
        };
      }
      if (table === 'project_members') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
        };
      }
      return {};
    });

    const forbiddenRes = await service.checkWorkspaceMembership(wsId, 'auth-2');
    expect(forbiddenRes).toEqual({ status: 'forbidden' });
  });
});
