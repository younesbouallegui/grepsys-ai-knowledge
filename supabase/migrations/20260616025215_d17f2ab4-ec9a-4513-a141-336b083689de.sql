
-- Restore data API access lost during security hardening
GRANT SELECT ON public.quizzes TO anon, authenticated;
GRANT ALL ON public.quizzes TO service_role;

-- quiz_questions: safe columns only for authenticated; never expose correct_answer/explanation
GRANT SELECT (id, quiz_id, question_text, question_type, options, related_document_id, weight, position, created_at)
  ON public.quiz_questions TO authenticated;
GRANT ALL ON public.quiz_questions TO service_role;

-- Allow count() aggregate in PostgREST embeds (needs SELECT on at least one col for anon if used; we use authenticated only)
GRANT SELECT (id, quiz_id) ON public.quiz_questions TO anon;
