-- Allow anonymous (public) read access to quiz content and documents so the app
-- works with the local mock authentication system. User-scoped tables remain protected.

DROP POLICY IF EXISTS "Authenticated read quizzes" ON public.quizzes;
CREATE POLICY "Public read quizzes"
  ON public.quizzes FOR SELECT
  TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "Authenticated read questions" ON public.quiz_questions;
CREATE POLICY "Public read questions"
  ON public.quiz_questions FOR SELECT
  TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "Authenticated read documents" ON public.documents;
CREATE POLICY "Public read documents"
  ON public.documents FOR SELECT
  TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "Authenticated read chunks" ON public.document_chunks;
CREATE POLICY "Public read chunks"
  ON public.document_chunks FOR SELECT
  TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "Profiles readable by authenticated" ON public.profiles;
CREATE POLICY "Public read profiles"
  ON public.profiles FOR SELECT
  TO anon, authenticated
  USING (true);