-- Create enums
CREATE TYPE public.project_status AS ENUM ('draft', 'uploaded', 'analyzing', 'ready', 'failed');
CREATE TYPE public.segment_type AS ENUM ('opening', 'climax', 'story_unit', 'transition', 'resolution');
CREATE TYPE public.export_type AS ENUM ('json', 'reel');

-- Projects
CREATE TABLE public.projects (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  status public.project_status NOT NULL DEFAULT 'draft',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Videos
CREATE TABLE public.videos (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  original_filename TEXT NOT NULL,
  s3_uri TEXT,
  duration_sec NUMERIC
);
CREATE INDEX idx_videos_project_id ON public.videos(project_id);

-- Segments
CREATE TABLE public.segments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  start_sec NUMERIC NOT NULL,
  end_sec NUMERIC NOT NULL,
  type public.segment_type NOT NULL,
  summary TEXT,
  confidence NUMERIC
);
CREATE INDEX idx_segments_project_id ON public.segments(project_id);

-- Breakpoints
CREATE TABLE public.breakpoints (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  timestamp_sec NUMERIC NOT NULL,
  type TEXT,
  reason TEXT,
  confidence NUMERIC
);
CREATE INDEX idx_breakpoints_project_id ON public.breakpoints(project_id);

-- Highlights
CREATE TABLE public.highlights (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  start_sec NUMERIC NOT NULL,
  end_sec NUMERIC NOT NULL,
  score NUMERIC,
  reason TEXT,
  clip_url TEXT,
  rank_order INTEGER
);
CREATE INDEX idx_highlights_project_id ON public.highlights(project_id);

-- Exports
CREATE TABLE public.exports (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  type public.export_type NOT NULL,
  file_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
CREATE INDEX idx_exports_project_id ON public.exports(project_id);

-- Enable RLS on all tables
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.videos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.segments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.breakpoints ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.highlights ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exports ENABLE ROW LEVEL SECURITY;

-- Allow public read/write for now (no auth implemented yet)
CREATE POLICY "Allow all access to projects" ON public.projects FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to videos" ON public.videos FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to segments" ON public.segments FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to breakpoints" ON public.breakpoints FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to highlights" ON public.highlights FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to exports" ON public.exports FOR ALL USING (true) WITH CHECK (true);