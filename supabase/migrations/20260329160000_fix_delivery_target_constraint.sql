-- Fix: Add 'youtube' to delivery_target CHECK constraint (was missing, causing INSERT failures)
ALTER TABLE public.projects DROP CONSTRAINT IF EXISTS delivery_target_check;
ALTER TABLE public.projects ADD CONSTRAINT delivery_target_check
  CHECK (delivery_target IS NULL OR delivery_target IN ('streaming', 'broadcast', 'cable', 'cable_vod', 'ott', 'social', 'youtube'));
