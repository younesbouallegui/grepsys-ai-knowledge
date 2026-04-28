import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import {
  AlertDialog, AlertDialogAction, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  ArrowLeft, ArrowRight, BookOpen, CheckCircle2, Clock, Loader2, Maximize2,
  ShieldAlert, ShieldCheck, XCircle,
} from "lucide-react";
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
  time_limit_minutes: number | null;
}

interface ResultDetail {
  question: Question;
  userAnswer: string | null;
  correct: boolean;
}

const shuffle = <T,>(arr: T[]): T[] => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

export default function QuizTake() {
  const { id } = useParams<{ id: string }>();
  const { t } = useTranslation();
  const { user, isLocalAdmin } = useAuth();
  const navigate = useNavigate();

  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [current, setCurrent] = useState(0);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [started, setStarted] = useState(false);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [timeLeft, setTimeLeft] = useState<number>(0);
  const [violations, setViolations] = useState(0);
  const [showWarning, setShowWarning] = useState(false);
  const violationsRef = useRef(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const finishedRef = useRef(false);

  const [result, setResult] = useState<{
    score: number; level: SkillLevel; details: ResultDetail[];
    weakDocs: { id: string; title: string; slug: string }[];
    elapsedSec: number; violations: number; integrity: number; passed: boolean;
  } | null>(null);

  const storageKey = id ? `quiz.attempt.${id}` : "";

  // Load quiz + questions, shuffle, restore autosave
  useEffect(() => {
    if (!id) return;
    (async () => {
      const [{ data: q }, { data: qs }] = await Promise.all([
        supabase.from("quizzes").select("id, title, category, passing_score, time_limit_minutes").eq("id", id).maybeSingle(),
        supabase.from("quiz_questions").select("*").eq("quiz_id", id).order("position", { ascending: true }),
      ]);
      setQuiz(q as Quiz | null);
      const shuffled = shuffle((qs ?? []) as unknown as Question[]).map((qq) => ({
        ...qq,
        options: shuffle(qq.options),
      }));
      setQuestions(shuffled);

      // restore answers
      try {
        const raw = localStorage.getItem(`quiz.attempt.${id}`);
        if (raw) {
          const saved = JSON.parse(raw);
          if (saved?.answers) setAnswers(saved.answers);
          if (typeof saved?.current === "number") setCurrent(saved.current);
        }
      } catch {}
      setLoading(false);
    })();
  }, [id]);

  // Autosave
  useEffect(() => {
    if (!started || !storageKey) return;
    const handle = setTimeout(() => {
      localStorage.setItem(storageKey, JSON.stringify({ answers, current, savedAt: Date.now() }));
    }, 400);
    return () => clearTimeout(handle);
  }, [answers, current, started, storageKey]);

  // Timer
  useEffect(() => {
    if (!started || !startedAt || !quiz?.time_limit_minutes) return;
    const total = quiz.time_limit_minutes * 60;
    const tick = () => {
      const elapsed = Math.floor((Date.now() - startedAt) / 1000);
      const remaining = Math.max(0, total - elapsed);
      setTimeLeft(remaining);
      if (remaining === 0 && !finishedRef.current) {
        finishedRef.current = true;
        void submit(true);
      }
    };
    tick();
    const i = setInterval(tick, 1000);
    return () => clearInterval(i);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [started, startedAt, quiz?.time_limit_minutes]);

  const logViolation = useCallback(async (type: string, details: Record<string, unknown> = {}) => {
    if (!quiz) return;
    if (user?.id && !isLocalAdmin) {
      try {
        await supabase.from("assessment_violations").insert([{
          user_id: user.id,
          quiz_id: quiz.id,
          violation_type: type,
          details,
        }]);
      } catch {/* ignore */}
    }
  }, [quiz, user?.id, isLocalAdmin]);

  const handleViolation = useCallback((type: string, details: Record<string, unknown> = {}) => {
    if (finishedRef.current) return;
    violationsRef.current += 1;
    const count = violationsRef.current;
    setViolations(count);
    void logViolation(type, details);
    if (count === 1) {
      setShowWarning(true);
    } else if (count >= 2) {
      finishedRef.current = true;
      toast.error(t("exam.terminated"));
      void submit(true, true);
    }
  }, [logViolation, t]);

  // Anti-cheat listeners
  useEffect(() => {
    if (!started) return;

    const onVisibility = () => {
      if (document.visibilityState === "hidden") handleViolation("tab_hidden");
    };
    const onBlur = () => handleViolation("window_blur");
    const onFsChange = () => {
      if (!document.fullscreenElement) handleViolation("fullscreen_exit");
    };
    const block = (e: Event) => { e.preventDefault(); };
    const onKey = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      // Block copy/paste/cut/select-all and devtools shortcuts
      if ((e.ctrlKey || e.metaKey) && ["c", "v", "x", "a", "p", "s", "u"].includes(k)) {
        e.preventDefault(); handleViolation("shortcut_blocked", { key: k });
      }
      if (k === "f12") { e.preventDefault(); handleViolation("devtools_attempt"); }
      // Esc would exit fullscreen — track but allow
    };

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("blur", onBlur);
    document.addEventListener("fullscreenchange", onFsChange);
    document.addEventListener("contextmenu", block);
    document.addEventListener("copy", block);
    document.addEventListener("cut", block);
    document.addEventListener("paste", block);
    document.addEventListener("keydown", onKey);

    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("blur", onBlur);
      document.removeEventListener("fullscreenchange", onFsChange);
      document.removeEventListener("contextmenu", block);
      document.removeEventListener("copy", block);
      document.removeEventListener("cut", block);
      document.removeEventListener("paste", block);
      document.removeEventListener("keydown", onKey);
    };
  }, [started, handleViolation]);

  const total = questions.length;
  const progress = useMemo(() => (total === 0 ? 0 : ((current + 1) / total) * 100), [current, total]);
  const answeredCount = Object.keys(answers).length;

  const startExam = async () => {
    try {
      await containerRef.current?.requestFullscreen?.();
    } catch {/* ignore */}
    setStartedAt(Date.now());
    setStarted(true);
  };

  const submit = useCallback(async (auto = false, terminated = false) => {
    if (!quiz) return;
    if (!auto && answeredCount < total && !confirm(t("quiz.unanswered"))) return;
    finishedRef.current = true;
    setSubmitting(true);
    try {
      let earned = 0, totalWeight = 0;
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
      const finalScore = terminated ? 0 : score;
      const level = scoreToLevel(finalScore);

      let weakDocs: { id: string; title: string; slug: string }[] = [];
      if (weakDocIds.size) {
        const { data } = await supabase.from("documents").select("id, title, slug").in("id", Array.from(weakDocIds));
        weakDocs = data ?? [];
      }

      const elapsedSec = startedAt ? Math.floor((Date.now() - startedAt) / 1000) : 0;
      const integrity = Math.max(0, 100 - violationsRef.current * 50);

      // Persist only for real users
      if (user?.id && !isLocalAdmin) {
        await supabase.from("quiz_attempts").insert({
          user_id: user.id, quiz_id: quiz.id, score: finalScore, level,
          weak_areas: weakDocs.map((d) => ({ id: d.id, title: d.title, slug: d.slug })),
          answers: details.map((d) => ({ question_id: d.question.id, answer: d.userAnswer, correct: d.correct, terminated })),
        });

        const { data: existing } = await supabase
          .from("certifications").select("id, best_score, level, attempts_count")
          .eq("user_id", user.id).eq("category", quiz.category).maybeSingle();

        if (existing) {
          await supabase.from("certifications").update({
            best_score: Math.max(existing.best_score, finalScore),
            level: highestLevel(existing.level as SkillLevel, level),
            attempts_count: (existing.attempts_count ?? 0) + 1,
            awarded_at: new Date().toISOString(),
          }).eq("id", existing.id);
        } else {
          await supabase.from("certifications").insert({
            user_id: user.id, category: quiz.category,
            best_score: finalScore, level, attempts_count: 1,
          });
        }
      }

      if (storageKey) localStorage.removeItem(storageKey);
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});

      setResult({
        score: finalScore, level, details, weakDocs,
        elapsedSec, violations: violationsRef.current, integrity,
        passed: finalScore >= quiz.passing_score && !terminated,
      });
    } catch (err: any) {
      toast.error(err.message ?? "Error");
    } finally {
      setSubmitting(false);
    }
  }, [answeredCount, answers, isLocalAdmin, questions, quiz, startedAt, storageKey, t, total, user?.id]);

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

  // Final report
  if (result) {
    const mins = Math.floor(result.elapsedSec / 60);
    const secs = result.elapsedSec % 60;
    return (
      <div className="mx-auto max-w-3xl px-6 py-12 animate-fade-up">
        <Card className="p-8 mb-6">
          <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground mb-1">{t("exam.finalReport")}</div>
          <h1 className="text-2xl font-display font-semibold tracking-tight">{quiz.title}</h1>
          <div className="mt-6 grid grid-cols-2 md:grid-cols-5 gap-4">
            <div>
              <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{t("quiz.yourScore")}</div>
              <div className="text-2xl font-semibold mt-1">{result.score}<span className="text-sm text-muted-foreground">%</span></div>
            </div>
            <div>
              <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{t("quiz.passing")}</div>
              <div className={`mt-2 inline-flex items-center gap-1.5 text-sm font-medium ${result.passed ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}>
                {result.passed ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
                {result.passed ? t("quiz.passed") : t("quiz.failed")}
              </div>
            </div>
            <div>
              <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{t("exam.timeSpent")}</div>
              <div className="text-2xl font-semibold mt-1 tabular-nums">{mins}:{String(secs).padStart(2, "0")}</div>
            </div>
            <div>
              <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{t("exam.suspicious")}</div>
              <div className="text-2xl font-semibold mt-1">{result.violations}</div>
            </div>
            <div>
              <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{t("exam.integrity")}</div>
              <div className={`text-2xl font-semibold mt-1 ${result.integrity >= 80 ? "text-emerald-600 dark:text-emerald-400" : result.integrity >= 50 ? "text-amber-600 dark:text-amber-400" : "text-rose-600 dark:text-rose-400"}`}>
                {result.integrity}
              </div>
            </div>
          </div>
          <div className="mt-6">
            <SkillBadge level={result.level} />
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

  // Pre-start screen
  if (!started) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-16">
        <Button variant="ghost" size="sm" asChild className="mb-6 -ml-2">
          <Link to="/quizzes"><ArrowLeft className="h-4 w-4 mr-1" /> {t("quiz.backToList")}</Link>
        </Button>
        <Card className="p-10">
          <Badge variant="outline" className="mb-4">{t(`docs.categories.${quiz.category}`, quiz.category)}</Badge>
          <h1 className="font-display text-3xl font-semibold tracking-tight">{quiz.title}</h1>
          <div className="mt-6 grid grid-cols-3 gap-6 text-sm">
            <div><div className="text-[11px] uppercase tracking-wider text-muted-foreground">Questions</div><div className="text-xl font-semibold mt-1">{total}</div></div>
            <div><div className="text-[11px] uppercase tracking-wider text-muted-foreground">{t("quiz.passing")}</div><div className="text-xl font-semibold mt-1">{quiz.passing_score}%</div></div>
            <div><div className="text-[11px] uppercase tracking-wider text-muted-foreground">{t("exam.timeLeft")}</div><div className="text-xl font-semibold mt-1">{quiz.time_limit_minutes ?? 30} min</div></div>
          </div>
          <div className="mt-8 rounded-lg border border-border bg-muted/40 p-4 text-sm leading-relaxed">
            <div className="flex items-center gap-2 font-medium mb-2"><ShieldCheck className="h-4 w-4 text-primary" /> Proctored environment</div>
            <ul className="list-disc list-inside text-muted-foreground space-y-1 text-[13px]">
              <li>{t("exam.fullscreenRequired")}</li>
              <li>Copy, paste, right-click and keyboard shortcuts are disabled.</li>
              <li>Tab switching, window blur or leaving full-screen counts as a violation.</li>
              <li>Two violations terminate the assessment automatically.</li>
            </ul>
          </div>
          <Button onClick={startExam} className="mt-8 w-full h-12 text-sm font-medium gap-2">
            <Maximize2 className="h-4 w-4" /> {t("exam.enterFullscreen")}
          </Button>
        </Card>
      </div>
    );
  }

  // In-exam UI (full viewport)
  const q = questions[current];
  const mins = Math.floor(timeLeft / 60);
  const secs = timeLeft % 60;
  const lowTime = quiz.time_limit_minutes ? timeLeft <= 60 : false;

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 z-50 bg-background flex flex-col select-none"
      style={{ userSelect: "none", WebkitUserSelect: "none" }}
      onContextMenu={(e) => e.preventDefault()}
      onCopy={(e) => e.preventDefault()}
    >
      {/* Top bar */}
      <header className="flex items-center justify-between gap-4 border-b border-border px-6 h-14 shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <ShieldCheck className="h-4 w-4 text-primary shrink-0" />
          <div className="text-sm font-semibold truncate">{quiz.title}</div>
          <Badge variant="outline" className="hidden sm:inline-flex text-[10px]">{t(`docs.categories.${quiz.category}`, quiz.category)}</Badge>
        </div>
        <div className="flex items-center gap-4 shrink-0">
          {violations > 0 && (
            <div className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-600 dark:text-amber-400">
              <ShieldAlert className="h-4 w-4" /> {violations}
            </div>
          )}
          {quiz.time_limit_minutes && (
            <div className={`inline-flex items-center gap-1.5 text-sm font-medium tabular-nums ${lowTime ? "text-rose-600 dark:text-rose-400" : ""}`}>
              <Clock className="h-4 w-4" />
              {mins}:{String(secs).padStart(2, "0")}
            </div>
          )}
          <div className="text-xs text-muted-foreground tabular-nums">
            {current + 1} / {total}
          </div>
        </div>
      </header>

      <Progress value={progress} className="h-1 rounded-none" />

      {/* Body */}
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl px-6 py-10">
          <Card className="p-8" onCopy={(e) => e.preventDefault()}>
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
                  className="flex items-start gap-3 p-3.5 rounded-lg border border-border hover:border-primary/40 hover:bg-accent/50 cursor-pointer transition-colors has-[:checked]:border-primary has-[:checked]:bg-primary-soft"
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
            <div className="text-[11px] text-muted-foreground">{answeredCount}/{total} answered · {t("exam.autoSaved")}</div>
            {current < total - 1 ? (
              <Button onClick={() => setCurrent((c) => c + 1)}>
                {t("quiz.next")} <ArrowRight className="h-4 w-4 ml-1" />
              </Button>
            ) : (
              <Button onClick={() => submit(false)} disabled={submitting}>
                {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
                {submitting ? t("quiz.submitting") : t("quiz.submit")}
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Warning dialog */}
      <AlertDialog open={showWarning} onOpenChange={setShowWarning}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <ShieldAlert className="h-5 w-5 text-amber-500" /> {t("exam.warningTitle")}
            </AlertDialogTitle>
            <AlertDialogDescription>{t("exam.warningBody")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction onClick={async () => {
              setShowWarning(false);
              try { await containerRef.current?.requestFullscreen?.(); } catch {}
            }}>Continue assessment</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
