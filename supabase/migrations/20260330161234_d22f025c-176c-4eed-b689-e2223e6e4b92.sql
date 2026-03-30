
-- 1. Add user_id to projects
ALTER TABLE public.projects ADD COLUMN user_id uuid REFERENCES auth.users(id);

-- 2. Drop all overly-permissive "Allow all access" policies
DROP POLICY IF EXISTS "Allow all access to projects" ON public.projects;
DROP POLICY IF EXISTS "Allow all access to videos" ON public.videos;
DROP POLICY IF EXISTS "Allow all access to exports" ON public.exports;
DROP POLICY IF EXISTS "Allow all access to segments" ON public.segments;
DROP POLICY IF EXISTS "Allow all access to breakpoints" ON public.breakpoints;
DROP POLICY IF EXISTS "Allow all access to highlights" ON public.highlights;
DROP POLICY IF EXISTS "Allow all access to analysis_logs" ON public.analysis_logs;
DROP POLICY IF EXISTS "Allow all access to analysis_chunks" ON public.analysis_chunks;

-- 3. Projects: owner-scoped policies
CREATE POLICY "Users can select own projects" ON public.projects FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Users can insert own projects" ON public.projects FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users can update own projects" ON public.projects FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users can delete own projects" ON public.projects FOR DELETE TO authenticated USING (user_id = auth.uid());

-- 4. Videos: read-only via project ownership
CREATE POLICY "Users can select own videos" ON public.videos FOR SELECT TO authenticated USING (project_id IN (SELECT id FROM public.projects WHERE user_id = auth.uid()));

-- 5. Segments: select + delete via project ownership
CREATE POLICY "Users can select own segments" ON public.segments FOR SELECT TO authenticated USING (project_id IN (SELECT id FROM public.projects WHERE user_id = auth.uid()));
CREATE POLICY "Users can delete own segments" ON public.segments FOR DELETE TO authenticated USING (project_id IN (SELECT id FROM public.projects WHERE user_id = auth.uid()));

-- 6. Breakpoints: select + update + delete via project ownership
CREATE POLICY "Users can select own breakpoints" ON public.breakpoints FOR SELECT TO authenticated USING (project_id IN (SELECT id FROM public.projects WHERE user_id = auth.uid()));
CREATE POLICY "Users can update own breakpoints" ON public.breakpoints FOR UPDATE TO authenticated USING (project_id IN (SELECT id FROM public.projects WHERE user_id = auth.uid()));
CREATE POLICY "Users can delete own breakpoints" ON public.breakpoints FOR DELETE TO authenticated USING (project_id IN (SELECT id FROM public.projects WHERE user_id = auth.uid()));

-- 7. Highlights: select + delete via project ownership
CREATE POLICY "Users can select own highlights" ON public.highlights FOR SELECT TO authenticated USING (project_id IN (SELECT id FROM public.projects WHERE user_id = auth.uid()));
CREATE POLICY "Users can delete own highlights" ON public.highlights FOR DELETE TO authenticated USING (project_id IN (SELECT id FROM public.projects WHERE user_id = auth.uid()));

-- 8. Analysis chunks: select + delete via project ownership
CREATE POLICY "Users can select own analysis_chunks" ON public.analysis_chunks FOR SELECT TO authenticated USING (project_id IN (SELECT id FROM public.projects WHERE user_id = auth.uid()));
CREATE POLICY "Users can delete own analysis_chunks" ON public.analysis_chunks FOR DELETE TO authenticated USING (project_id IN (SELECT id FROM public.projects WHERE user_id = auth.uid()));

-- 9. Analysis logs: delete via project ownership
CREATE POLICY "Users can delete own analysis_logs" ON public.analysis_logs FOR DELETE TO authenticated USING (project_id IN (SELECT id FROM public.projects WHERE user_id = auth.uid()));

-- 10. Exports: select via project ownership
CREATE POLICY "Users can select own exports" ON public.exports FOR SELECT TO authenticated USING (project_id IN (SELECT id FROM public.projects WHERE user_id = auth.uid()));

-- 11. Fix waitlist_signups INSERT policy to enforce ownership
DROP POLICY IF EXISTS "Authenticated users can insert own signup" ON public.waitlist_signups;
CREATE POLICY "Authenticated users can insert own signup" ON public.waitlist_signups FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
