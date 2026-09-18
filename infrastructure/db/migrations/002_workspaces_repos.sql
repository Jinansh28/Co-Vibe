-- Migration: 002_workspaces_repos.sql
-- Description: Create workspaces and repositories tables.

-- 1. Workspaces table
CREATE TABLE IF NOT EXISTS public.workspaces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  active_branch TEXT NOT NULL DEFAULT 'main',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Repositories table
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

-- Indexes for foreign key lookup performance
CREATE INDEX IF NOT EXISTS idx_workspaces_project_id ON public.workspaces(project_id);
CREATE INDEX IF NOT EXISTS idx_repositories_project_id ON public.repositories(project_id);

-- Automatic updated_at timestamp triggers
CREATE OR REPLACE TRIGGER set_workspaces_updated_at
  BEFORE UPDATE ON public.workspaces
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();

CREATE OR REPLACE TRIGGER set_repositories_updated_at
  BEFORE UPDATE ON public.repositories
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();
