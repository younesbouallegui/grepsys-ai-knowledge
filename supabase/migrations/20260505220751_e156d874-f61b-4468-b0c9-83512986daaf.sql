-- quiz_attempts: allow anon insert + read (mock-auth flow)
CREATE POLICY "Public insert attempts" ON public.quiz_attempts
  FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "Public read attempts" ON public.quiz_attempts
  FOR SELECT TO anon, authenticated USING (true);

-- certifications: allow anon insert + update + read
CREATE POLICY "Public insert certifications" ON public.certifications
  FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "Public read certifications" ON public.certifications
  FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Public update certifications" ON public.certifications
  FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);

-- assessment_violations: allow anon insert + read
CREATE POLICY "Public insert violations" ON public.assessment_violations
  FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "Public read violations" ON public.assessment_violations
  FOR SELECT TO anon, authenticated USING (true);

-- profiles: allow anon insert (so mock users can have a profile row for display_name)
CREATE POLICY "Public insert profiles" ON public.profiles
  FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "Public update profiles all" ON public.profiles
  FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
