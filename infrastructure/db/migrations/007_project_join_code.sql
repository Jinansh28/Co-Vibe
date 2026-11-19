-- Migration: 007_project_join_code.sql
-- Description: Add join_code column to projects table for collaboration invite links and codes.

ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS join_code TEXT UNIQUE;
CREATE INDEX IF NOT EXISTS idx_projects_join_code ON public.projects(join_code);
