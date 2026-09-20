-- Migration: 005_changesets_conversations.sql
-- Description: Create change_sets and ai_conversations tables.

-- 1. Change Sets table
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

-- 2. AI Conversations table
CREATE TABLE IF NOT EXISTS public.ai_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES public.agent_tasks(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('system', 'user', 'assistant', 'tool')),
  content TEXT NOT NULL,
  tool_calls JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for foreign key lookup performance
CREATE INDEX IF NOT EXISTS idx_change_sets_task_id ON public.change_sets(task_id);
CREATE INDEX IF NOT EXISTS idx_change_sets_run_id ON public.change_sets(run_id);
CREATE INDEX IF NOT EXISTS idx_ai_conversations_task_id ON public.ai_conversations(task_id);

-- Automatic updated_at timestamp triggers
CREATE OR REPLACE TRIGGER set_change_sets_updated_at
  BEFORE UPDATE ON public.change_sets
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();

CREATE OR REPLACE TRIGGER set_ai_conversations_updated_at
  BEFORE UPDATE ON public.ai_conversations
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();
