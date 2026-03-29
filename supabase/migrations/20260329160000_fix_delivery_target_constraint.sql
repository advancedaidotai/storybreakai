-- Fix: Add 'youtube' to delivery_target CHECK constraint (was missing, causing INSERT failures)
-- The original constraint was named 'projects_delivery_target_check' (from migration 20260329145229),
-- so we must drop BOTH possible names to handle either state.
ALTER TABLE public.projects DROP CONSTRAINT IF EXISTS projects_delivery_target_check;
ALTER TABLE public.projects DROP CONSTRAINT IF EXISTS delivery_target_check;
ALTER TABLE public.projects ADD CONSTRAINT delivery_target_check
  CHECK (delivery_target IS NULL OR delivery_target IN ('streaming', 'broadcast', 'cable', 'cable_vod', 'ott', 'social', 'youtube'));
