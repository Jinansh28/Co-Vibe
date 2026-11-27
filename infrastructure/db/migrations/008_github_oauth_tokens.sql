-- Migration: 008_github_oauth_tokens.sql
-- Description: Store AES-256-GCM encrypted per-user GitHub OAuth tokens (AUTH-03).

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
