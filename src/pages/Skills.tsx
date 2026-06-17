import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card } from "@/components/ui/card";
import { SkillBadge } from "@/components/SkillBadge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { GraduationCap, Loader2, ShieldCheck, TrendingUp, BookOpen, ArrowRight } from "lucide-react";
import { highestLevel, SkillLevel, levelOrder } from "@/lib/skill";
import { LineChart, Line, ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";

interface Cert {
  category: string;
  level: SkillLevel;
  best_score: number;
  attempts_count: number;
  awarded_at: string;
}

interface Attempt {
  id: string;
  score: number;
  level: SkillLevel;
  completed_at: string;
  weak_areas: { id: string; title: string; slug: string }[];
  quizzes: { title: string; category: string } | null;
}

export default function Skills() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [certs, setCerts] = useState<Cert[]>([]);
  const [attempts, setAttempts] = useState<Attempt[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    (async () => {
      // The Supabase auth user id may differ from the AuthContext platform id
      // (e.g. when signing in via Zabbix SSO). quiz_attempts/certifications
      // are stored against auth.uid(), so use that for the queries.
      const { data: authData } = await supabase.auth.getUser();
      const uid = authData?.user?.id ?? user.id;
      const [{ data: c }, { data: a }] = await Promise.all([
        supabase.from("certifications").select("*").eq("user_id", uid),
        supabase
          .from("quiz_attempts")
          .select("id, score, level, completed_at, weak_areas, quizzes(title, category)")
          .eq("user_id", uid)
          .order("completed_at", { ascending: false })
          .limit(20),
      ]);
      setCerts((c ?? []) as unknown as Cert[]);
      setAttempts((a ?? []) as unknown as Attempt[]);
      setLoading(false);
    })();
  }, [user]);

  const overallLevel: SkillLevel = certs.length
    ? certs.reduce<SkillLevel>((acc, c) => highestLevel(acc, c.level), "beginner")
    : "beginner";
  const productionReady = certs.some((c) => c.level === "production_ready");
  const avgScore = attempts.length
    ? Math.round(attempts.reduce((s, a) => s + a.score, 0) / attempts.length)
    : 0;

  const chartData = [...attempts]
    .reverse()
    .map((a, i) => ({ name: `#${i + 1}`, score: a.score }));

  // Aggregate weak areas across recent attempts
  const weakAreaMap = new Map<string, { id: string; title: string; slug: string; count: number }>();
  attempts.forEach((a) => {
    (a.weak_areas ?? []).forEach((w) => {
      const ex = weakAreaMap.get(w.id);
      weakAreaMap.set(w.id, { ...w, count: (ex?.count ?? 0) + 1 });
    });
  });
  const weakAreas = Array.from(weakAreaMap.values()).sort((a, b) => b.count - a.count).slice(0, 6);

  if (loading) {
    return (
      <div className="mx-auto max-w-5xl px-6 py-12 flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> {t("common.loading")}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-6 py-12">
      <div className="mb-8 animate-fade-in">
        <h1 className="text-3xl font-display font-semibold tracking-tight">{t("skills.title")}</h1>
        <p className="mt-2 text-muted-foreground">{t("skills.subtitle")}</p>
      </div>

      {/* Overview */}
      <div className="grid gap-4 md:grid-cols-3 mb-8 animate-fade-up">
        <Card className="p-6">
          <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground mb-3">
            <GraduationCap className="h-3.5 w-3.5" /> {t("skills.yourLevel")}
          </div>
          <SkillBadge level={overallLevel} className="text-sm px-3 py-1.5" />
          {productionReady && (
            <div className="mt-3 inline-flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400">
              <ShieldCheck className="h-3.5 w-3.5" /> {t("skills.productionReady")}
            </div>
          )}
        </Card>
        <Card className="p-6">
          <div className="text-xs uppercase tracking-wider text-muted-foreground mb-3">{t("skills.averageScore")}</div>
          <div className="text-3xl font-semibold">{avgScore}<span className="text-base text-muted-foreground">/100</span></div>
          <div className="text-xs text-muted-foreground mt-1">{attempts.length} {t("skills.attempts")}</div>
        </Card>
        <Card className="p-6">
          <div className="text-xs uppercase tracking-wider text-muted-foreground mb-3">{t("skills.certifications")}</div>
          <div className="text-3xl font-semibold">{certs.length}</div>
          <div className="text-xs text-muted-foreground mt-1">{certs.filter((c) => c.level === "production_ready").length} production-ready</div>
        </Card>
      </div>

      {/* Certifications grid */}
      {certs.length > 0 && (
        <div className="mb-8 animate-fade-up">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3">{t("skills.certifications")}</h2>
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {certs.sort((a, b) => levelOrder[b.level] - levelOrder[a.level]).map((c) => (
              <Card key={c.category} className="p-4">
                <Badge variant="outline" className="mb-2 text-[10px] uppercase tracking-wider">
                  {t(`docs.categories.${c.category}`, c.category)}
                </Badge>
                <div className="flex items-center justify-between">
                  <SkillBadge level={c.level} />
                  <span className="text-sm text-muted-foreground">{c.best_score}/100</span>
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Progress chart */}
      {chartData.length > 1 && (
        <Card className="p-6 mb-8 animate-fade-up">
          <div className="flex items-center gap-2 text-sm font-semibold mb-4">
            <TrendingUp className="h-4 w-4 text-primary" /> {t("skills.progress")}
          </div>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="name" stroke="hsl(var(--muted-foreground))" fontSize={11} />
                <YAxis domain={[0, 100]} stroke="hsl(var(--muted-foreground))" fontSize={11} />
                <Tooltip
                  contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: "8px", fontSize: "12px" }}
                />
                <Line type="monotone" dataKey="score" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ r: 3, fill: "hsl(var(--primary))" }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>
      )}

      {/* Weak areas */}
      {weakAreas.length > 0 && (
        <Card className="p-6 mb-8 animate-fade-up">
          <div className="text-sm font-semibold mb-3">{t("skills.weakAreas")}</div>
          <div className="flex flex-wrap gap-2">
            {weakAreas.map((w) => (
              <Link key={w.id} to={`/docs/${w.slug}`} className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md bg-accent text-accent-foreground hover:bg-primary-soft transition-colors">
                <BookOpen className="h-3 w-3" /> {w.title}
              </Link>
            ))}
          </div>
        </Card>
      )}

      {/* History */}
      <div className="animate-fade-up">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3">{t("skills.history")}</h2>
        {attempts.length === 0 ? (
          <Card className="p-8 text-center text-sm text-muted-foreground">
            {t("skills.noHistory")}
            <div className="mt-4">
              <Button asChild size="sm"><Link to="/quizzes">{t("nav.quizzes")} <ArrowRight className="h-3.5 w-3.5 ml-1" /></Link></Button>
            </div>
          </Card>
        ) : (
          <Card>
            <div className="divide-y divide-border">
              {attempts.slice(0, 10).map((a) => (
                <div key={a.id} className="flex items-center justify-between gap-4 px-5 py-3">
                  <div className="min-w-0">
                    <div className="font-medium text-sm truncate">{a.quizzes?.title ?? "—"}</div>
                    <div className="text-xs text-muted-foreground">
                      {new Date(a.completed_at).toLocaleDateString()} · {a.quizzes?.category && t(`docs.categories.${a.quizzes.category}`, a.quizzes.category)}
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="text-sm font-medium">{a.score}/100</span>
                    <SkillBadge level={a.level} showIcon={false} />
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
