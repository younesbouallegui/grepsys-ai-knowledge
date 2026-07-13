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
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  CheckCircle2,
  Clock,
  Loader2,
  Lock,
  Maximize,
  ShieldAlert,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { SkillLevel } from "@/lib/skill";
import {
  attachInputBlockers,
  attachViolationListeners,
  enterFullscreen,
  exitFullscreen,
  isFullscreen,
  shuffle,
  ViolationType,
} from "@/lib/antiCheat";

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

const VIOLATION_LIMIT = 2;

export default function QuizTake() {
  const { id } = useParams<{ id: string }>();
  const { t } = useTranslation();
  const { user, zabbixToken } = useAuth();
  const navigate = useNavigate();

  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [current, setCurrent] = useState(0);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [started, setStarted] = useState(false);
  const [result, setResult] = useState<{
    score: number;
    level: SkillLevel;
    details: ResultDetail[];
    weakDocs: { id: string; title: string; slug: string }[];
    timeSpentSec: number;
    violationsCount: number;
    autoSubmitted: boolean;
  } | null>(null);

  const [violations, setViolations] = useState(0);
  const [showWarning, setShowWarning] = useState(false);
  const [warningMsg, setWarningMsg] = useState<string>("");
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const [startedAt, setStartedAt] = useState<number | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const violationsRef = useRef(0);
  const submittedRef = useRef(false);
  const autoSubmittedRef = useRef(false);

  const storageKey = useMemo(() => (id && user ? `quiz-progress:${user.id}:${id}` : null), [id, user]);

  // Load quiz + questions (without correct_answer/explanation), shuffle, hydrate
  useEffect(() => {
    if (!id) return;
    (async () => {
      const [{ data: q }, { data: qs }] = await Promise.all([
        supabase.from("quizzes").select("id, title, category, passing_score, time_limit_minutes").eq("id", id).maybeSingle(),
        (supabase.rpc as any)("get_assessment_questions", { p_quiz_id: id }),
      ]);
      const allQs = ((qs ?? []) as any[]).map((qq) => ({
        ...qq,
        position: qq.question_position ?? qq.position,
        correct_answer: "",
        explanation: null,
        options: shuffle(qq.options),
      })) as Question[];
      setQuiz(q as Quiz | null);
      setQuestions(shuffle(allQs));
      setLoading(false);
    })();
  }, [id]);

  // Hydrate saved progress
  useEffect(() => {
    if (!storageKey) return;
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        const saved = JSON.parse(raw);
        if (saved.answers) setAnswers(saved.answers);
        if (typeof saved.current === "number") setCurrent(saved.current);
      }
    } catch {}
  }, [storageKey]);

  // Auto-save progress
  useEffect(() => {
    if (!storageKey || !started) return;
    try {
      localStorage.setItem(storageKey, JSON.stringify({ answers, current, ts: Date.now() }));
    } catch {}
  }, [answers, current, storageKey, started]);

  const total = questions.length;
  const progress = useMemo(() => (total === 0 ? 0 : ((current + 1) / total) * 100), [current, total]);
  const answeredCount = Object.keys(answers).length;

  const submit = useCallback(
    async (opts?: { auto?: boolean }) => {
      if (!quiz || !user || submittedRef.current) return;
      if (!opts?.auto && answeredCount < total && !confirm(t("quiz.unanswered"))) return;
      submittedRef.current = true;
      setSubmitting(true);
      const auto = !!opts?.auto;
      autoSubmittedRef.current = auto;
      try {
        const { data: fnData, error: rpcErr } = await supabase.functions.invoke("assessment-submit", {
          body: {
            action: "submit",
            zabbix_token: zabbixToken,
            quiz_id: quiz.id,
            answers: questions.map((q) => ({ question_id: q.id, answer: answers[q.id] ?? null })),
            auto,
            violations_count: violationsRef.current,
          },
        });
        if (rpcErr) throw rpcErr;
        const rpcData = (fnData as any)?.data;
        const payload = rpcData as {
          attempt_id: string;
          score: number;
          level: SkillLevel;
          weak_doc_ids: string[];
          details: Array<{
            question_id: string;
            user_answer: string | null;
            correct_answer: string;
            explanation: string | null;
            correct: boolean;
          }>;
        };

        const detailsByQid = new Map(payload.details.map((d) => [d.question_id, d]));
        const details: ResultDetail[] = questions.map((q) => {
          const d = detailsByQid.get(q.id);
          return {
            question: { ...q, correct_answer: d?.correct_answer ?? "", explanation: d?.explanation ?? null },
            userAnswer: d?.user_answer ?? null,
            correct: !!d?.correct,
          };
        });

        let weakDocs: { id: string; title: string; slug: string }[] = [];
        if (payload.weak_doc_ids?.length) {
          const { data } = await supabase.from("documents").select("id, title, slug").in("id", payload.weak_doc_ids);
          weakDocs = data ?? [];
        }

        const timeSpentSec = startedAt ? Math.round((Date.now() - startedAt) / 1000) : 0;
        setResult({
          score: payload.score,
          level: payload.level,
          details,
          weakDocs,
          timeSpentSec,
          violationsCount: violationsRef.current,
          autoSubmitted: auto,
        });

        if (storageKey) localStorage.removeItem(storageKey);
        await exitFullscreen();
      } catch (err: any) {
        toast.error(err.message ?? "Error");
        submittedRef.current = false;
      } finally {
        setSubmitting(false);
      }
    },
    [quiz, user, zabbixToken, questions, answers, answeredCount, total, t, startedAt, storageKey]
  );

  const recordViolation = useCallback(
    async (type: ViolationType | string, details?: Record<string, unknown>) => {
      if (submittedRef.current || !started || !quiz || !user) return;
      violationsRef.current += 1;
      const count = violationsRef.current;
      setViolations(count);

      // Persist
      try {
        await supabase.functions.invoke("assessment-submit", {
          body: {
            action: "violation",
            zabbix_token: zabbixToken,
            quiz_id: quiz.id,
            violation_type: String(type),
            details: details ?? {},
          },
        });
      } catch {}

      if (count >= VIOLATION_LIMIT) {
        setWarningMsg(t("quiz.violationTerminated"));
        setShowWarning(true);
        // auto-submit
        setTimeout(() => submit({ auto: true }), 800);
      } else {
        setWarningMsg(t("quiz.violationWarning"));
        setShowWarning(true);
      }
    },
    [started, quiz, user, zabbixToken, t, submit]
  );

  // Anti-cheat listeners (active only after start, before submit)
  useEffect(() => {
    if (!started || result) return;
    const detachInputs = attachInputBlockers(document.body);
    const detachViol = attachViolationListeners({
      onViolation: (type, details) => recordViolation(type, details),
    });
    return () => {
      detachInputs();
      detachViol();
    };
  }, [started, result, recordViolation]);

  // Timer
  useEffect(() => {
    if (!started || result || !quiz?.time_limit_minutes) return;
    const interval = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev === null) return prev;
        if (prev <= 1) {
          clearInterval(interval);
          submit({ auto: true });
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [started, result, quiz, submit]);

  const handleStart = async () => {
    if (!quiz) return;
    setStarted(true);
    setStartedAt(Date.now());
    if (quiz.time_limit_minutes) setTimeLeft(quiz.time_limit_minutes * 60);
    await enterFullscreen(containerRef.current ?? document.documentElement);
  };

  const reEnterFullscreen = async () => {
    setShowWarning(false);
    if (!isFullscreen() && !submittedRef.current) {
      await enterFullscreen(containerRef.current ?? document.documentElement);
    }
  };

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };
  const formatDuration = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}m ${sec}s`;
  };

  // ---------- Loading / not found ----------
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
        <Button variant="ghost" onClick={() => navigate("/quizzes")}>
          <ArrowLeft className="h-4 w-4 mr-1" /> {t("quiz.backToList")}
        </Button>
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

  // ---------- Result screen ----------
  if (result) {
    const passed = result.score >= quiz.passing_score && !result.autoSubmitted;
    return (
      <div className="mx-auto max-w-3xl px-6 py-12 animate-fade-up">
        <Card className="p-8 mb-6 glass">
          <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1">{t("quiz.results")}</div>
          <h1 className="text-2xl font-display font-semibold tracking-tight">{quiz.title}</h1>
          <div className="mt-6 grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <div className="text-xs text-muted-foreground">{t("quiz.yourScore")}</div>
              <div className="text-3xl font-semibold mt-1">
                {result.score}
                <span className="text-base text-muted-foreground">/100</span>
              </div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">{t("quiz.levelAchieved")}</div>
              <div className="mt-2">
                <SkillBadge level={result.level} />
              </div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">{t("quiz.timeSpent")}</div>
              <div className="mt-1 text-lg font-medium">{formatDuration(result.timeSpentSec)}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">{t("quiz.suspiciousActivity")}</div>
              <div className={`mt-1 text-lg font-medium ${result.violationsCount > 0 ? "text-amber-600 dark:text-amber-400" : ""}`}>
                {result.violationsCount}
              </div>
            </div>
          </div>
          <div className="mt-6">
            <div
              className={`inline-flex items-center gap-1.5 text-sm font-medium ${
                passed ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"
              }`}
            >
              {passed ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
              {result.autoSubmitted ? t("quiz.terminated") : passed ? t("quiz.passed") : t("quiz.failed")}
            </div>
          </div>
        </Card>

        {result.weakDocs.length > 0 && (
          <Card className="p-6 mb-6">
            <div className="text-sm font-semibold mb-3">{t("quiz.reviewSuggested")}</div>
            <div className="flex flex-wrap gap-2">
              {result.weakDocs.map((d) => (
                <Link
                  key={d.id}
                  to={`/docs/${d.slug}`}
                  className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md bg-accent text-accent-foreground hover:bg-primary-soft transition-colors"
                >
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
                {d.correct ? (
                  <CheckCircle2 className="h-5 w-5 text-emerald-500 shrink-0 mt-0.5" />
                ) : (
                  <XCircle className="h-5 w-5 text-rose-500 shrink-0 mt-0.5" />
                )}
                <div className="flex-1 min-w-0">
                  <div className="text-xs text-muted-foreground mb-1">
                    {t("quiz.question")} {i + 1}
                  </div>
                  <div className="font-medium">{d.question.question_text}</div>
                  <div className="mt-3 space-y-1 text-sm">
                    <div>
                      <span className="text-muted-foreground">{t("quiz.yourAnswer")}: </span>
                      {d.userAnswer ? d.question.options.find((o) => o.key === d.userAnswer)?.text ?? d.userAnswer : "—"}
                    </div>
                    {!d.correct && (
                      <div>
                        <span className="text-muted-foreground">{t("quiz.correctAnswer")}: </span>
                        {d.question.options.find((o) => o.key === d.question.correct_answer)?.text ?? d.question.correct_answer}
                      </div>
                    )}
                    {d.question.explanation && (
                      <div className="mt-2 text-muted-foreground">
                        <span className="font-medium text-foreground">{t("quiz.explanation")}: </span>
                        {d.question.explanation}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </Card>
          ))}
        </div>

        <div className="mt-8 flex gap-3">
          <Button variant="outline" asChild>
            <Link to="/quizzes">{t("quiz.backToList")}</Link>
          </Button>
          <Button asChild>
            <Link to="/skills">{t("nav.skills")}</Link>
          </Button>
        </div>
      </div>
    );
  }

  // ---------- Pre-start instructions ----------
  if (!started) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-12">
        <Button variant="ghost" size="sm" asChild className="mb-4 -ml-2">
          <Link to="/quizzes">
            <ArrowLeft className="h-4 w-4 mr-1" /> {t("quiz.backToList")}
          </Link>
        </Button>
        <Card className="p-8 animate-fade-up">
          <Badge variant="outline" className="mb-3 text-[10px] uppercase tracking-wider">
            {t(`docs.categories.${quiz.category}`, quiz.category)}
          </Badge>
          <h1 className="text-3xl font-display font-semibold tracking-tight">{quiz.title}</h1>
          <div className="mt-6 grid grid-cols-3 gap-4 text-sm">
            <div>
              <div className="text-xs text-muted-foreground">{t("quiz.questions")}</div>
              <div className="text-lg font-semibold">{total}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">{t("quiz.passing")}</div>
              <div className="text-lg font-semibold">{quiz.passing_score}%</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">{t("quiz.timeLimit")}</div>
              <div className="text-lg font-semibold">{quiz.time_limit_minutes ?? "—"} {t("quiz.minutes")}</div>
            </div>
          </div>

          <div className="mt-8 p-5 rounded-lg border border-amber-500/30 bg-amber-500/5">
            <div className="flex items-center gap-2 text-sm font-semibold text-amber-700 dark:text-amber-400 mb-3">
              <ShieldAlert className="h-4 w-4" /> {t("quiz.rulesTitle")}
            </div>
            <ul className="space-y-1.5 text-sm text-muted-foreground">
              <li>• {t("quiz.ruleFullscreen")}</li>
              <li>• {t("quiz.ruleNoCopy")}</li>
              <li>• {t("quiz.ruleNoSwitch")}</li>
              <li>• {t("quiz.ruleViolations")}</li>
              <li>• {t("quiz.ruleAutoSave")}</li>
            </ul>
          </div>

          <Button onClick={handleStart} size="lg" className="mt-6 w-full">
            <Maximize className="h-4 w-4 mr-2" /> {t("quiz.startSecure")}
          </Button>
        </Card>
      </div>
    );
  }

  // ---------- Active assessment (full viewport) ----------
  const q = questions[current];

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 z-[100] bg-background overflow-y-auto select-none"
      style={{ userSelect: "none", WebkitUserSelect: "none" } as any}
    >
      {/* Top bar */}
      <div className="sticky top-0 z-10 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="mx-auto max-w-4xl px-6 py-3">
          <div className="flex items-center justify-between gap-4 mb-2">
            <div className="min-w-0 flex items-center gap-3">
              <Lock className="h-4 w-4 text-primary shrink-0" />
              <h1 className="text-sm font-semibold truncate">{quiz.title}</h1>
              <Badge variant="outline" className="text-[10px] hidden sm:inline-flex">
                {t(`docs.categories.${quiz.category}`, quiz.category)}
              </Badge>
            </div>
            <div className="flex items-center gap-3 text-sm shrink-0">
              {timeLeft !== null && (
                <div
                  className={`inline-flex items-center gap-1.5 font-mono tabular-nums ${
                    timeLeft < 60 ? "text-rose-500 animate-pulse" : "text-foreground"
                  }`}
                >
                  <Clock className="h-4 w-4" /> {formatTime(timeLeft)}
                </div>
              )}
              {violations > 0 && (
                <Badge variant="destructive" className="gap-1">
                  <ShieldAlert className="h-3 w-3" /> {violations}/{VIOLATION_LIMIT}
                </Badge>
              )}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-muted-foreground tabular-nums shrink-0">
              {current + 1}/{total}
            </span>
            <Progress value={progress} className="h-1.5 flex-1" />
            <span className="text-xs text-muted-foreground tabular-nums shrink-0">
              {answeredCount} {t("quiz.answered")}
            </span>
          </div>
        </div>
      </div>

      {/* Question body */}
      <div className="mx-auto max-w-3xl px-6 py-8">
        <Card className="p-8 animate-fade-up">
          {q.question_type === "scenario" && (
            <Badge variant="secondary" className="mb-3 text-[10px] uppercase tracking-wider">
              {t("quiz.scenario")}
            </Badge>
          )}
          <div className="text-xs text-muted-foreground mb-2">
            {t("quiz.question")} {current + 1} {t("quiz.of")} {total}
          </div>
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
                className="flex items-start gap-3 p-4 rounded-lg border border-border hover:border-primary/40 hover:bg-accent/50 cursor-pointer transition-colors has-[:checked]:border-primary has-[:checked]:bg-primary-soft"
              >
                <RadioGroupItem id={`${q.id}-${opt.key}`} value={opt.key} className="mt-0.5" />
                <span className="text-sm font-normal leading-relaxed">{opt.text}</span>
              </Label>
            ))}
          </RadioGroup>
        </Card>

        <div className="mt-6 flex items-center justify-between gap-3">
          <Button variant="outline" disabled={current === 0} onClick={() => setCurrent((c) => c - 1)}>
            <ArrowLeft className="h-4 w-4 mr-1" /> {t("quiz.previous")}
          </Button>
          <div className="flex items-center gap-2">
            {current < total - 1 ? (
              <Button onClick={() => setCurrent((c) => c + 1)}>
                {t("quiz.next")} <ArrowRight className="h-4 w-4 ml-1" />
              </Button>
            ) : (
              <Button onClick={() => submit()} disabled={submitting}>
                {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
                {submitting ? t("quiz.submitting") : t("quiz.submit")}
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Violation warning dialog */}
      <AlertDialog open={showWarning} onOpenChange={setShowWarning}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-amber-600 dark:text-amber-400">
              <ShieldAlert className="h-5 w-5" /> {t("quiz.warningTitle")}
            </AlertDialogTitle>
            <AlertDialogDescription>{warningMsg}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction onClick={reEnterFullscreen}>{t("quiz.understood")}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
