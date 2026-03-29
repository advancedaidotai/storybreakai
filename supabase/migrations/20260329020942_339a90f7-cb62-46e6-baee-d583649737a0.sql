
ALTER TABLE public.projects ADD COLUMN delivery_target text DEFAULT NULL;

ALTER TABLE public.breakpoints ADD COLUMN lead_in_sec numeric DEFAULT NULL;
ALTER TABLE public.breakpoints ADD COLUMN valley_type text DEFAULT NULL;
ALTER TABLE public.breakpoints ADD COLUMN ad_slot_duration_rec numeric DEFAULT NULL;
ALTER TABLE public.breakpoints ADD COLUMN compliance_notes text DEFAULT NULL;
