import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { SkillBadge } from "@/components/SkillBadge";
import { ArrowLeft, ArrowRight, BookOpen, CheckCircle2, Loader2, XCircle } from "lucide-react";
import { toast } from "sonner";
import { scoreToLevel, highestLevel, SkillLevel } from "@/lib/skill";

interface Question {
  id: string;
  question_text: string;
  question_type: "multiple_choice" | "scenario";
  options: { key: string; text: string }[];
  correct_answer: string;
  explanation: string | null;
  related_document_id: string | null;
  weight: number;
  position: number;
}

interface Quiz {
  id: string;
  title: string;
  category: string;
  passing_score: number;
}

interface ResultDetail {
  question: Question;
  userAnswer: string | null;
  correct: boolean;
}

export default function QuizTake() {
  const { id } = useParams<{ id: string }>();
  const { t } = useTranslation();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [current, setCurrent] = useState(0);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ score: number; level: SkillLevel; details: ResultDetail[]; weakDocs: { id: string; title: string; slug: string }[] } | null>(null);

  useEffect(() => {
    if (!id) return;
    (async () => {
      const [{ data: q }, { data: qs }] = await Promise.all([
        supabase.from("quizzes").select("id, title, category, passing_score").eq("id", id).maybeSingle(),
        supabase.from("quiz_questions").select("*").eq("quiz_id", id).order("position", { ascending: true }),
      ]);
      setQuiz(q as Quiz | null);
      setQuestions((qs ?? []) as unknown as Question[]);
      setLoading(false);
    })();
  }, [id]);

  const total = questions.length;
  const progress = useMemo(() => (total === 0 ? 0 : ((current + 1) / total) * 100), [current, total]);
  const answeredCount = Object.keys(answers).length;

  const submit = async () => {
    if (!quiz || !user) return;
    if (answeredCount < total && !confirm(t("quiz.unanswered"))) return;
    setSubmitting(true);
    try {
      let earned = 0;
      let totalWeight = 0;
      const details: ResultDetail[] = [];
      const weakDocIds = new Set<string>();

      for (const q of questions) {
        totalWeight += q.weight;
        const userAns = answers[q.id] ?? null;
        const correct = userAns === q.correct_answer;
        if (correct) earned += q.weight;
        else if (q.related_document_id) weakDocIds.add(q.related_document_id);
        details.push({ question: q, userAnswer: userAns, correct });
      }

      const score = totalWeight > 0 ? Math.round((earned / totalWeight) * 100) : 0;
      const level = scoreToLevel(score);

      // Resolve weak doc titles
      let weakDocs: { id: string; title: string; slug: string }[] = [];
      if (weakDocIds.size) {
        const { data } = await supabase
          .from("documents")
          .select("id, title, slug")
          .in("id", Array.from(weakDocIds));
        weakDocs = data ?? [];
      }

      // Save attempt
      await supabase.from("quiz_attempts").insert({
        user_id: user.id,
        quiz_id: quiz.id,
        score,
        level,
        weak_areas: weakDocs.map((d) => ({ id: d.id, title: d.title, slug: d.slug })),
        answers: details.map((d) => ({ question_id: d.question.id, answer: d.userAnswer, correct: d.correct })),
      });

      // Upsert certification (best score / highest level wins)
      const { data: existing } = await supabase
        .from("certifications")
        .select("id, best_score, level, attempts_count")
        .eq("user_id", user.id)
        .eq("category", quiz.category)
        .maybeSingle();

      if (existing) {
        await supabase
          .from("certifications")
          .update({
            best_score: Math.max(existing.best_score, score),
            level: highestLevel(existing.level as SkillLevel, level),
            attempts_count: (existing.attempts_count ?? 0) + 1,
            awarded_at: new Date().toISOString(),
          })
          .eq("id", existing.id);
      } else {
        await supabase.from("certifications").insert({
          user_id: user.id,
          category: quiz.category,
          best_score: score,
          level,
          attempts_count: 1,
        });
      }

      setResult({ score, level, details, weakDocs });
    } catch (err: any) {
      toast.error(err.message ?? "Error");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-12 flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> {t("common.loading")}
      </div>
    );
  }

  if (!quiz) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-12">
        <Button variant="ghost" onClick={() => navigate("/quizzes")}><ArrowLeft className="h-4 w-4 mr-1" /> {t("quiz.backToList")}</Button>
      </div>
    );
  }

  if (questions.length === 0) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-12">
        <Card className="p-12 text-center text-muted-foreground">{t("quiz.noQuestions")}</Card>
      </div>
    );
  }

  if (result) {
    const passed = result.score >= quiz.passing_score;
    return (
      <div className="mx-auto max-w-3xl px-6 py-12 animate-fade-up">
        <Card className="p-8 mb-6 glass">
          <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1">{t("quiz.results")}</div>
          <h1 className="text-2xl font-display font-semibold tracking-tight">{quiz.title}</h1>
          <div className="mt-6 grid grid-cols-3 gap-4">
            <div>
              <div className="text-xs text-muted-foreground">{t("quiz.yourScore")}</div>
              <div className="text-3xl font-semibold mt-1">{result.score}<span className="text-base text-muted-foreground">/100</span></div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">{t("quiz.levelAchieved")}</div>
              <div className="mt-2"><SkillBadge level={result.level} /></div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">{t("quiz.passing")}</div>
              <div className={`mt-2 inline-flex items-center gap-1.5 text-sm font-medium ${passed ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}>
                {passed ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
                {passed ? t("quiz.passed") : t("quiz.failed")}
              </div>
            </div>
          </div>
        </Card>

        {result.weakDocs.length > 0 && (
          <Card className="p-6 mb-6">
            <div className="text-sm font-semibold mb-3">{t("quiz.reviewSuggested")}</div>
            <div className="flex flex-wrap gap-2">
              {result.weakDocs.map((d) => (
                <Link key={d.id} to={`/docs/${d.slug}`} className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md bg-accent text-accent-foreground hover:bg-primary-soft transition-colors">
                  <BookOpen className="h-3 w-3" /> {d.title}
                </Link>
              ))}
            </div>
          </Card>
        )}

        <div className="space-y-3">
          {result.details.map((d, i) => (
            <Card key={d.question.id} className="p-5">
              <div className="flex items-start gap-3">
                {d.correct ? <CheckCircle2 className="h-5 w-5 text-emerald-500 shrink-0 mt-0.5" /> : <XCircle className="h-5 w-5 text-rose-500 shrink-0 mt-0.5" />}
                <div className="flex-1 min-w-0">
                  <div className="text-xs text-muted-foreground mb-1">{t("quiz.question")} {i + 1}</div>
                  <div className="font-medium">{d.question.question_text}</div>
                  <div className="mt-3 space-y-1 text-sm">
                    <div><span className="text-muted-foreground">{t("quiz.yourAnswer")}: </span>{d.userAnswer ? d.question.options.find((o) => o.key === d.userAnswer)?.text ?? d.userAnswer : "—"}</div>
                    {!d.correct && (
                      <div><span className="text-muted-foreground">{t("quiz.correctAnswer")}: </span>{d.question.options.find((o) => o.key === d.question.correct_answer)?.text ?? d.question.correct_answer}</div>
                    )}
                    {d.question.explanation && (
                      <div className="mt-2 text-muted-foreground"><span className="font-medium text-foreground">{t("quiz.explanation")}: </span>{d.question.explanation}</div>
                    )}
                  </div>
                </div>
              </div>
            </Card>
          ))}
        </div>

        <div className="mt-8 flex gap-3">
          <Button variant="outline" asChild><Link to="/quizzes">{t("quiz.backToList")}</Link></Button>
          <Button asChild><Link to="/skills">{t("nav.skills")}</Link></Button>
        </div>
      </div>
    );
  }

  const q = questions[current];

  return (
    <div className="mx-auto max-w-3xl px-6 py-12">
      <div className="mb-6 animate-fade-in">
        <Button variant="ghost" size="sm" asChild className="mb-4 -ml-2">
          <Link to="/quizzes"><ArrowLeft className="h-4 w-4 mr-1" /> {t("quiz.backToList")}</Link>
        </Button>
        <div className="flex items-center justify-between gap-3 mb-2">
          <h1 className="text-2xl font-display font-semibold tracking-tight">{quiz.title}</h1>
          <Badge variant="outline">{t(`docs.categories.${quiz.category}`, quiz.category)}</Badge>
        </div>
        <div className="text-xs text-muted-foreground mb-2">
          {t("quiz.question")} {current + 1} {t("quiz.of")} {total}
        </div>
        <Progress value={progress} className="h-1.5" />
      </div>

      <Card className="p-6 animate-fade-up">
        {q.question_type === "scenario" && (
          <Badge variant="secondary" className="mb-3 text-[10px] uppercase tracking-wider">Scenario</Badge>
        )}
        <h2 className="text-lg font-medium mb-6 leading-relaxed">{q.question_text}</h2>

        <RadioGroup
          value={answers[q.id] ?? ""}
          onValueChange={(v) => setAnswers((prev) => ({ ...prev, [q.id]: v }))}
          className="space-y-2"
        >
          {q.options.map((opt) => (
            <Label
              key={opt.key}
              htmlFor={`${q.id}-${opt.key}`}
              className="flex items-start gap-3 p-3 rounded-lg border border-border hover:border-primary/40 hover:bg-accent/50 cursor-pointer transition-colors has-[:checked]:border-primary has-[:checked]:bg-primary-soft"
            >
              <RadioGroupItem id={`${q.id}-${opt.key}`} value={opt.key} className="mt-0.5" />
              <span className="text-sm font-normal leading-relaxed">{opt.text}</span>
            </Label>
          ))}
        </RadioGroup>
      </Card>

      <div className="mt-6 flex items-center justify-between">
        <Button variant="outline" disabled={current === 0} onClick={() => setCurrent((c) => c - 1)}>
          <ArrowLeft className="h-4 w-4 mr-1" /> {t("quiz.previous")}
        </Button>
        {current < total - 1 ? (
          <Button onClick={() => setCurrent((c) => c + 1)}>
            {t("quiz.next")} <ArrowRight className="h-4 w-4 ml-1" />
          </Button>
        ) : (
          <Button onClick={submit} disabled={submitting}>
            {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
            {submitting ? t("quiz.submitting") : t("quiz.submit")}
          </Button>
        )}
      </div>
    </div>
  );
}
