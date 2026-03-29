
-- Content type enum
DO $$ BEGIN
  CREATE TYPE public.content_type AS ENUM ('short_form', 'tv_episode', 'feature_film');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Add new columns to projects
ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS content_type public.content_type DEFAULT 'short_form',
  ADD COLUMN IF NOT EXISTS content_metadata jsonb,
  ADD COLUMN IF NOT EXISTS duration_sec integer,
  ADD COLUMN IF NOT EXISTS file_size_bytes bigint;

-- Index on content_type
CREATE INDEX IF NOT EXISTS idx_projects_content_type ON public.projects (content_type);
