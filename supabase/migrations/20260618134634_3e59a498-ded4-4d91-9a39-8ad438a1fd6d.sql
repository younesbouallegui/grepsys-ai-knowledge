
CREATE OR REPLACE FUNCTION public.score_quiz_attempt_as(
  p_user_id uuid,
  p_quiz_id uuid,
  p_answers jsonb,
  p_auto boolean DEFAULT false,
  p_violations_count integer DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user uuid := p_user_id;
  v_quiz quizzes%ROWTYPE;
  v_total_weight int := 0;
  v_earned int := 0;
  v_score int := 0;
  v_level skill_level;
  v_attempt_id uuid;
  v_details jsonb := '[]'::jsonb;
  v_weak_ids uuid[] := ARRAY[]::uuid[];
  v_answers jsonb;
  v_cert certifications%ROWTYPE;
  v_new_level skill_level;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'user id required';
  END IF;

  SELECT * INTO v_quiz FROM public.quizzes WHERE id = p_quiz_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'quiz not found';
  END IF;

  WITH ans AS (
    SELECT (elem->>'question_id')::uuid AS qid,
           NULLIF(elem->>'answer','') AS ua
    FROM jsonb_array_elements(p_answers) elem
  ),
  joined AS (
    SELECT q.id, q.weight, q.correct_answer, q.explanation, q.related_document_id,
           a.ua,
           (a.ua IS NOT NULL AND a.ua = q.correct_answer) AS correct
    FROM public.quiz_questions q
    LEFT JOIN ans a ON a.qid = q.id
    WHERE q.quiz_id = p_quiz_id
  )
  SELECT
    COALESCE(SUM(weight),0),
    COALESCE(SUM(CASE WHEN correct THEN weight ELSE 0 END),0),
    COALESCE(jsonb_agg(jsonb_build_object(
      'question_id', id,
      'user_answer', ua,
      'correct_answer', correct_answer,
      'explanation', explanation,
      'correct', correct
    )), '[]'::jsonb),
    COALESCE(array_agg(related_document_id) FILTER (WHERE NOT correct AND related_document_id IS NOT NULL), ARRAY[]::uuid[])
  INTO v_total_weight, v_earned, v_details, v_weak_ids
  FROM joined;

  v_score := CASE WHEN v_total_weight > 0 THEN ROUND((v_earned::numeric / v_total_weight) * 100) ELSE 0 END;
  v_level := CASE
    WHEN v_score >= 90 THEN 'production_ready'::skill_level
    WHEN v_score >= 75 THEN 'advanced'::skill_level
    WHEN v_score >= 50 THEN 'intermediate'::skill_level
    ELSE 'beginner'::skill_level
  END;

  v_answers := (
    SELECT jsonb_agg(jsonb_build_object(
      'question_id', d->>'question_id',
      'answer', d->>'user_answer',
      'correct', (d->>'correct')::boolean
    )) FROM jsonb_array_elements(v_details) d
  );

  INSERT INTO public.quiz_attempts (user_id, quiz_id, score, level, weak_areas, answers)
  VALUES (v_user, p_quiz_id, v_score, v_level, '[]'::jsonb, COALESCE(v_answers, '[]'::jsonb))
  RETURNING id INTO v_attempt_id;

  IF p_auto THEN
    INSERT INTO public.assessment_violations (user_id, quiz_id, attempt_id, violation_type, details)
    VALUES (v_user, p_quiz_id, v_attempt_id, 'auto_submit',
            jsonb_build_object('reason','violation_limit_exceeded','count', p_violations_count));
  END IF;

  SELECT * INTO v_cert FROM public.certifications
    WHERE user_id = v_user AND category = v_quiz.category;

  IF FOUND THEN
    v_new_level := CASE WHEN
      (CASE v_level WHEN 'beginner' THEN 0 WHEN 'intermediate' THEN 1 WHEN 'advanced' THEN 2 WHEN 'production_ready' THEN 3 END)
      >=
      (CASE v_cert.level WHEN 'beginner' THEN 0 WHEN 'intermediate' THEN 1 WHEN 'advanced' THEN 2 WHEN 'production_ready' THEN 3 END)
      THEN v_level ELSE v_cert.level END;

    UPDATE public.certifications
      SET best_score = GREATEST(v_cert.best_score, v_score),
          level = v_new_level,
          attempts_count = COALESCE(v_cert.attempts_count, 0) + 1,
          awarded_at = now()
      WHERE id = v_cert.id;
  ELSE
    INSERT INTO public.certifications (user_id, category, best_score, level, attempts_count)
    VALUES (v_user, v_quiz.category, v_score, v_level, 1);
  END IF;

  RETURN jsonb_build_object(
    'attempt_id', v_attempt_id,
    'score', v_score,
    'level', v_level,
    'weak_doc_ids', to_jsonb(v_weak_ids),
    'details', v_details
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.record_assessment_violation_as(
  p_user_id uuid,
  p_quiz_id uuid,
  p_violation_type text,
  p_details jsonb DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'user id required';
  END IF;
  INSERT INTO public.assessment_violations (user_id, quiz_id, violation_type, details)
  VALUES (p_user_id, p_quiz_id, p_violation_type, COALESCE(p_details, '{}'::jsonb));
END;
$function$;

REVOKE ALL ON FUNCTION public.score_quiz_attempt_as(uuid, uuid, jsonb, boolean, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.score_quiz_attempt_as(uuid, uuid, jsonb, boolean, integer) TO service_role;

REVOKE ALL ON FUNCTION public.record_assessment_violation_as(uuid, uuid, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_assessment_violation_as(uuid, uuid, text, jsonb) TO service_role;
