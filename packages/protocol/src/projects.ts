import { z } from 'zod';
import { SafeRepoUrlSchema } from './runtime.js';

export const ProjectMemberRoleSchema = z.enum(['owner', 'editor', 'viewer']);
export type ProjectMemberRole = z.infer<typeof ProjectMemberRoleSchema>;

export const CreateProjectSchema = z.object({
  name: z.string().trim().min(1, 'Project name is required'),
  description: z.string().optional(),
  repoUrl: z.preprocess(
    (val) => (typeof val === 'string' && val.trim() === '' ? undefined : val),
    SafeRepoUrlSchema.optional()
  ),
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

export const JoinProjectSchema = z.object({
  joinCode: z.string().trim().min(1, 'Join code is required'),
});
export type JoinProjectInput = z.infer<typeof JoinProjectSchema>;
