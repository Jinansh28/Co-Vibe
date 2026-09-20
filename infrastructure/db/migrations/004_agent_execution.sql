-- Migration: 004_agent_execution.sql
-- Description: Create agents, agent_tasks, agent_runs, and tool_calls tables.

-- 1. Agents table
CREATE TABLE IF NOT EXISTS public.agents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  model TEXT NOT NULL,
  system_prompt TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Agent Tasks table
CREATE TABLE IF NOT EXISTS public.agent_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  agent_id UUID REFERENCES public.agents(id) ON DELETE SET NULL,
  prompt TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('created', 'planning', 'executing', 'validating', 'needs_fix', 'awaiting_review', 'accepted', 'rejected', 'failed', 'completed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Agent Runs table
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

-- 4. Tool Calls table
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

-- Indexes for foreign key lookup performance
CREATE INDEX IF NOT EXISTS idx_agent_tasks_workspace_id ON public.agent_tasks(workspace_id);
CREATE INDEX IF NOT EXISTS idx_agent_tasks_agent_id ON public.agent_tasks(agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_runs_task_id ON public.agent_runs(task_id);
CREATE INDEX IF NOT EXISTS idx_tool_calls_run_id ON public.tool_calls(run_id);

-- Automatic updated_at timestamp triggers
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
