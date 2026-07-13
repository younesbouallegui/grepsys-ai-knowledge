-- Restore safe assessment reads without exposing quiz_answers
GRANT SELECT ON public.quizzes TO anon, authenticated;
GRANT ALL ON public.quizzes TO service_role;
GRANT ALL ON public.quiz_questions TO service_role;

REVOKE SELECT ON public.quiz_questions FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.list_assessments()
RETURNS TABLE (
  id uuid,
  title text,
  description text,
  category text,
  passing_score integer,
  time_limit_minutes integer,
  question_count integer,
  created_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    q.id,
    q.title,
    q.description,
    q.category::text,
    q.passing_score,
    q.time_limit_minutes,
    COUNT(qq.id)::integer AS question_count,
    q.created_at
  FROM public.quizzes q
  LEFT JOIN public.quiz_questions qq ON qq.quiz_id = q.id
  GROUP BY q.id, q.title, q.description, q.category, q.passing_score, q.time_limit_minutes, q.created_at
  ORDER BY q.created_at DESC;
$$;

CREATE OR REPLACE FUNCTION public.get_assessment_questions(p_quiz_id uuid)
RETURNS TABLE (
  id uuid,
  quiz_id uuid,
  question_text text,
  question_type question_type,
  options jsonb,
  related_document_id uuid,
  weight integer,
  question_position integer
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  RETURN QUERY
  SELECT
    qq.id,
    qq.quiz_id,
    qq.question_text,
    qq.question_type,
    qq.options,
    qq.related_document_id,
    qq.weight,
    qq.position AS question_position
  FROM public.quiz_questions qq
  WHERE qq.quiz_id = p_quiz_id
  ORDER BY qq.position ASC;
END;
$$;

REVOKE ALL ON FUNCTION public.list_assessments() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_assessments() TO anon, authenticated;

REVOKE ALL ON FUNCTION public.get_assessment_questions(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_assessment_questions(uuid) TO authenticated;