import { z } from 'zod';

export const ProjectMemberRoleSchema = z.enum(['owner', 'editor', 'viewer']);
export type ProjectMemberRole = z.infer<typeof ProjectMemberRoleSchema>;

export const CreateProjectSchema = z.object({
  name: z.string().trim().min(1, 'Project name is required'),
  description: z.string().optional(),
});
export type CreateProjectInput = z.infer<typeof CreateProjectSchema>;

export const CreateWorkspaceSchema = z.object({
  name: z.string().trim().min(1, 'Workspace name is required'),
  activeBranch: z.string().optional(),
});
export type CreateWorkspaceInput = z.infer<typeof CreateWorkspaceSchema>;

export const AddProjectMemberSchema = z.object({
  userId: z.string().uuid(),
  role: ProjectMemberRoleSchema,
});
export type AddProjectMemberInput = z.infer<typeof AddProjectMemberSchema>;
