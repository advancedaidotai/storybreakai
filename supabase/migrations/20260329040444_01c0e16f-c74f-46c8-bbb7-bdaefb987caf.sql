
CREATE TYPE public.analysis_log_type AS ENUM (
  'skipped_segment',
  'skipped_highlight',
  'skipped_breakpoint',
  'clamped_score',
  'parse_error',
  'info'
);

CREATE TABLE public.analysis_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  log_type analysis_log_type NOT NULL,
  message TEXT,
  raw_data JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_analysis_logs_project_id ON public.analysis_logs(project_id);

ALTER TABLE public.analysis_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all access to analysis_logs" ON public.analysis_logs
  FOR ALL TO public USING (true) WITH CHECK (true);
