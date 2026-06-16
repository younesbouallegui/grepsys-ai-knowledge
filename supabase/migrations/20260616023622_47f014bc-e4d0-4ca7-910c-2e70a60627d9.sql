
DROP VIEW IF EXISTS public.quiz_questions_public;

REVOKE SELECT ON public.quiz_questions FROM anon, authenticated;

GRANT SELECT (id, quiz_id, question_text, question_type, options,
              related_document_id, weight, position, created_at)
  ON public.quiz_questions TO authenticated;

GRANT SELECT ON public.quiz_questions TO service_role;

-- Allow signed-in users to read questions (column grants restrict which columns).
CREATE POLICY "Authenticated read questions"
  ON public.quiz_questions FOR SELECT
  TO authenticated
  USING (true);
