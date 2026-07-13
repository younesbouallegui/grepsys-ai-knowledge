
CREATE TABLE public.assessment_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  assessment_id uuid NOT NULL REFERENCES public.quizzes(id) ON DELETE CASCADE,
  attempt_id uuid REFERENCES public.quiz_attempts(id) ON DELETE SET NULL,
  score integer NOT NULL,
  level public.skill_level NOT NULL,
  skills jsonb NOT NULL DEFAULT '[]'::jsonb,
  submitted_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.assessment_results TO authenticated;
GRANT ALL ON public.assessment_results TO service_role;

ALTER TABLE public.assessment_results ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own results"
  ON public.assessment_results FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Admins view all results"
  ON public.assessment_results FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX assessment_results_submitted_at_idx ON public.assessment_results (submitted_at DESC);
CREATE INDEX assessment_results_user_id_idx ON public.assessment_results (user_id);
CREATE INDEX assessment_results_assessment_id_idx ON public.assessment_results (assessment_id);
