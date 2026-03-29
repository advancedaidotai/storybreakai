ALTER TABLE public.breakpoints 
ADD COLUMN IF NOT EXISTS approval_status text NOT NULL DEFAULT 'pending',
ADD COLUMN IF NOT EXISTS boundary_reasons jsonb DEFAULT '[]'::jsonb;