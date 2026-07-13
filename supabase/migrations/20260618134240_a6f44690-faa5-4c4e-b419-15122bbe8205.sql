GRANT EXECUTE ON FUNCTION public.score_quiz_attempt(uuid, jsonb, boolean, integer) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.record_assessment_violation(uuid, text, jsonb) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_assessment_questions(uuid) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.list_assessments() TO anon, authenticated, service_role;