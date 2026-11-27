-- ==============================================================================
-- Co-Vibe Complete Database Schema Migration (001 - 007)
-- Target: Supabase PostgreSQL (SQL Editor)
-- Instructions: Copy and run this entire script in Supabase SQL Editor
-- Note: auth.users is already provided and managed by Supabase Auth
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 0. Schema Migrations Tracking Table
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.schema_migrations (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ------------------------------------------------------------------------------
-- 1. Helper: updated_at Trigger Function
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ------------------------------------------------------------------------------
-- 2. Migration 001: Users, Projects, Project Members
-- ------------------------------------------------------------------------------

-- Users table (profiles mapped to Supabase auth.users)
CREATE TABLE IF NOT EXISTS public.users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL UNIQUE,
  display_name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Projects table
CREATE TABLE IF NOT EXISTS public.projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Project Members join table
CREATE TABLE IF NOT EXISTS public.project_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('owner', 'editor', 'viewer')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_project_members_project_user UNIQUE (project_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_users_auth_user_id ON public.users(auth_user_id);
CREATE INDEX IF NOT EXISTS idx_projects_owner_id ON public.projects(owner_id);
CREATE INDEX IF NOT EXISTS idx_project_members_project_id ON public.project_members(project_id);
CREATE INDEX IF NOT EXISTS idx_project_members_user_id ON public.project_members(user_id);

CREATE OR REPLACE TRIGGER set_users_updated_at
  BEFORE UPDATE ON public.users
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();

CREATE OR REPLACE TRIGGER set_projects_updated_at
  BEFORE UPDATE ON public.projects
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();

CREATE OR REPLACE TRIGGER set_project_members_updated_at
  BEFORE UPDATE ON public.project_members
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();

-- ------------------------------------------------------------------------------
-- 3. Migration 002: Workspaces and Repositories
-- ------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.workspaces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  active_branch TEXT NOT NULL DEFAULT 'main',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.repositories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  provider TEXT NOT NULL DEFAULT 'github',
  owner_name TEXT NOT NULL,
  repo_name TEXT NOT NULL,
  clone_url TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_repositories_project_owner_repo UNIQUE (project_id, owner_name, repo_name)
);

CREATE INDEX IF NOT EXISTS idx_workspaces_project_id ON public.workspaces(project_id);
CREATE INDEX IF NOT EXISTS idx_repositories_project_id ON public.repositories(project_id);

CREATE OR REPLACE TRIGGER set_workspaces_updated_at
  BEFORE UPDATE ON public.workspaces
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();

CREATE OR REPLACE TRIGGER set_repositories_updated_at
  BEFORE UPDATE ON public.repositories
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();

-- ------------------------------------------------------------------------------
-- 4. Migration 003: Collaboration Sessions
-- ------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.collaboration_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  client_id TEXT NOT NULL,
  connected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  disconnected_at TIMESTAMPTZ,
  CONSTRAINT uq_collaboration_sessions_workspace_client UNIQUE (workspace_id, client_id)
);

CREATE INDEX IF NOT EXISTS idx_collaboration_sessions_workspace_id ON public.collaboration_sessions(workspace_id);
CREATE INDEX IF NOT EXISTS idx_collaboration_sessions_user_id ON public.collaboration_sessions(user_id);

-- ------------------------------------------------------------------------------
-- 5. Migration 004: Agent Execution Schema
-- ------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.agents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  model TEXT NOT NULL,
  system_prompt TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.agent_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  agent_id UUID REFERENCES public.agents(id) ON DELETE SET NULL,
  prompt TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('created', 'planning', 'executing', 'validating', 'needs_fix', 'awaiting_review', 'accepted', 'rejected', 'failed', 'completed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.agent_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES public.agent_tasks(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'running',
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.tool_calls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES public.agent_runs(id) ON DELETE CASCADE,
  tool_name TEXT NOT NULL,
  arguments JSONB NOT NULL DEFAULT '{}'::jsonb,
  result TEXT,
  error TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agent_tasks_workspace_id ON public.agent_tasks(workspace_id);
CREATE INDEX IF NOT EXISTS idx_agent_tasks_agent_id ON public.agent_tasks(agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_runs_task_id ON public.agent_runs(task_id);
CREATE INDEX IF NOT EXISTS idx_tool_calls_run_id ON public.tool_calls(run_id);

CREATE OR REPLACE TRIGGER set_agents_updated_at
  BEFORE UPDATE ON public.agents
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();

CREATE OR REPLACE TRIGGER set_agent_tasks_updated_at
  BEFORE UPDATE ON public.agent_tasks
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();

CREATE OR REPLACE TRIGGER set_agent_runs_updated_at
  BEFORE UPDATE ON public.agent_runs
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();

CREATE OR REPLACE TRIGGER set_tool_calls_updated_at
  BEFORE UPDATE ON public.tool_calls
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();

-- ------------------------------------------------------------------------------
-- 6. Migration 005: Change Sets & AI Conversations
-- ------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.change_sets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES public.agent_tasks(id) ON DELETE CASCADE,
  run_id UUID REFERENCES public.agent_runs(id) ON DELETE CASCADE,
  base_revision TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'accepted', 'rejected', 'stale', 'conflicted')) DEFAULT 'pending',
  patch TEXT NOT NULL,
  changed_files JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.ai_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES public.agent_tasks(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('system', 'user', 'assistant', 'tool')),
  content TEXT NOT NULL,
  tool_calls JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_change_sets_task_id ON public.change_sets(task_id);
CREATE INDEX IF NOT EXISTS idx_change_sets_run_id ON public.change_sets(run_id);
CREATE INDEX IF NOT EXISTS idx_ai_conversations_task_id ON public.ai_conversations(task_id);

CREATE OR REPLACE TRIGGER set_change_sets_updated_at
  BEFORE UPDATE ON public.change_sets
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();

CREATE OR REPLACE TRIGGER set_ai_conversations_updated_at
  BEFORE UPDATE ON public.ai_conversations
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();

-- ------------------------------------------------------------------------------
-- 7. Migration 006: Audit Logs
-- ------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE,
  workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  event_type VARCHAR(255) NOT NULL,
  target_type VARCHAR(255) NOT NULL,
  target_id VARCHAR(255),
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_project_id ON public.audit_logs(project_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_workspace_id ON public.audit_logs(workspace_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON public.audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_event_type ON public.audit_logs(event_type);

-- ------------------------------------------------------------------------------
-- 8. Migration 007: Join Code Column & Index
-- ------------------------------------------------------------------------------

ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS join_code TEXT UNIQUE;
CREATE INDEX IF NOT EXISTS idx_projects_join_code ON public.projects(join_code);

-- ------------------------------------------------------------------------------
-- 9. Migration 008: Encrypted GitHub OAuth Tokens (AUTH-03)
-- ------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.github_oauth_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  github_username TEXT,
  encrypted_token TEXT NOT NULL,
  iv TEXT NOT NULL,
  auth_tag TEXT NOT NULL,
  scope TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_github_oauth_tokens_user_id UNIQUE (user_id)
);

CREATE INDEX IF NOT EXISTS idx_github_oauth_tokens_user_id ON public.github_oauth_tokens(user_id);

CREATE OR REPLACE TRIGGER set_github_oauth_tokens_updated_at
  BEFORE UPDATE ON public.github_oauth_tokens
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();

-- ------------------------------------------------------------------------------
-- 10. Record All Migrations as Applied
-- ------------------------------------------------------------------------------

INSERT INTO public.schema_migrations (name) VALUES
  ('001_initial_schema.sql'),
  ('002_workspaces_repos.sql'),
  ('003_collaboration_sessions.sql'),
  ('004_agent_execution.sql'),
  ('005_changesets_conversations.sql'),
  ('006_runtimes_git_audit.sql'),
  ('007_project_join_code.sql'),
  ('008_github_oauth_tokens.sql')
ON CONFLICT (name) DO NOTHING;
