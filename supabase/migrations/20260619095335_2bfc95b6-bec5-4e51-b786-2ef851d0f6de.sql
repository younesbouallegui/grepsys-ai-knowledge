
-- Lock down assessment_violations: only service role can insert
DROP POLICY IF EXISTS "Users insert own violations" ON public.assessment_violations;

-- Lock down certifications: only service role writes (via score_quiz_attempt_as RPC)
DROP POLICY IF EXISTS "Users upsert own certifications" ON public.certifications;
DROP POLICY IF EXISTS "Users update own certifications" ON public.certifications;

-- Lock down quiz_attempts: only service role inserts
DROP POLICY IF EXISTS "Users create own attempts" ON public.quiz_attempts;

-- Restrict sensitive quiz_questions columns from authenticated clients
REVOKE SELECT (correct_answer, explanation) ON public.quiz_questions FROM authenticated;
REVOKE SELECT (correct_answer, explanation) ON public.quiz_questions FROM anon;
