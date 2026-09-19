-- Migration: 003_collaboration_sessions.sql
-- Description: Create collaboration_sessions table for tracking active sessions.

CREATE TABLE IF NOT EXISTS public.collaboration_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  client_id TEXT NOT NULL,
  connected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  disconnected_at TIMESTAMPTZ,
  CONSTRAINT uq_collaboration_sessions_workspace_client UNIQUE (workspace_id, client_id)
);

-- Indexes for foreign key lookup performance
CREATE INDEX IF NOT EXISTS idx_collaboration_sessions_workspace_id ON public.collaboration_sessions(workspace_id);
CREATE INDEX IF NOT EXISTS idx_collaboration_sessions_user_id ON public.collaboration_sessions(user_id);
