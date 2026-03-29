
-- Analysis chunk status enum
DO $$ BEGIN
  CREATE TYPE public.chunk_status AS ENUM ('pending', 'analyzing', 'complete', 'failed');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Analysis chunks table
CREATE TABLE IF NOT EXISTS public.analysis_chunks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  chunk_index integer NOT NULL,
  start_sec integer NOT NULL,
  end_sec integer NOT NULL,
  overlap_start_sec integer,
  overlap_end_sec integer,
  status public.chunk_status NOT NULL DEFAULT 'pending',
  pegasus_response jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_analysis_chunks_project_id ON public.analysis_chunks(project_id);

ALTER TABLE public.analysis_chunks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all access to analysis_chunks" ON public.analysis_chunks FOR ALL TO public USING (true) WITH CHECK (true);
