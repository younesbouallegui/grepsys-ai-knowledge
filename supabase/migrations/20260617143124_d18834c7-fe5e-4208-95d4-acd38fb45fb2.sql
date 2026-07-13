CREATE OR REPLACE FUNCTION public.get_assessment_questions(p_quiz_id uuid)
RETURNS TABLE(
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
SET search_path TO 'public'
AS $$
BEGIN
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

GRANT EXECUTE ON FUNCTION public.get_assessment_questions(uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.get_assessment_questions(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_assessment_questions(uuid) TO service_role;

GRANT SELECT ON public.quizzes TO anon;
GRANT SELECT ON public.quizzes TO authenticated;
GRANT ALL ON public.quizzes TO service_role;