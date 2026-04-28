import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card } from "@/components/ui/card";
import { SkillBadge } from "@/components/SkillBadge";
import { Badge } from "@/components/ui/badge";
import { Loader2, ShieldCheck, Users, Activity, Target, ShieldAlert, TrendingUp, Award } from "lucide-react";
import { SkillLevel, levelOrder } from "@/lib/skill";
import { BarChart, Bar, ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid, Cell, PieChart, Pie, Legend } from "recharts";

interface CertRow {
  user_id: string;
  category: string;
  level: SkillLevel;
  best_score: number;
  awarded_at: string;
  profiles?: { display_name: string | null } | null;
}

interface AttemptRow {
  id: string;
  user_id: string;
  score: number;
  completed_at: string;
  weak_areas: { id: string; title: string; slug: string }[];
  quizzes: { title: string; category: string } | null;
  profiles?: { display_name: string | null } | null;
}

export default function Admin() {
  const { t } = useTranslation();
  const { isAdmin, loading: authLoading } = useAuth();
  const [certs, setCerts] = useState<CertRow[]>([]);
  const [attempts, setAttempts] = useState<AttemptRow[]>([]);
  const [violations, setViolations] = useState<any[]>([]);
  const [quizzesMap, setQuizzesMap] = useState<Map<string, { title: string; passing_score: number }>>(new Map());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isAdmin) return;
    (async () => {
      const [{ data: c }, { data: a }, { data: v }, { data: qz }] = await Promise.all([
        supabase.from("certifications").select("user_id, category, level, best_score, awarded_at"),
        supabase
          .from("quiz_attempts")
          .select("id, user_id, quiz_id, score, completed_at, weak_areas, quizzes(title, category)")
          .order("completed_at", { ascending: false })
          .limit(200),
        supabase
          .from("assessment_violations")
          .select("id, user_id, quiz_id, violation_type, details, created_at")
          .order("created_at", { ascending: false })
          .limit(100),
        supabase.from("quizzes").select("id, title, passing_score"),
      ]);

      setQuizzesMap(new Map((qz ?? []).map((q: any) => [q.id, { title: q.title, passing_score: q.passing_score }])));

      // Resolve profile names
      const userIds = Array.from(
        new Set([
          ...(c ?? []).map((r: any) => r.user_id),
          ...(a ?? []).map((r: any) => r.user_id),
          ...(v ?? []).map((r: any) => r.user_id),
        ])
      );
      let profileMap = new Map<string, string | null>();
      if (userIds.length) {
        const { data: profs } = await supabase.from("profiles").select("id, display_name").in("id", userIds);
        profileMap = new Map((profs ?? []).map((p: any) => [p.id, p.display_name]));
      }

      setCerts((c ?? []).map((r: any) => ({ ...r, profiles: { display_name: profileMap.get(r.user_id) ?? null } })));
      setAttempts((a ?? []).map((r: any) => ({ ...r, profiles: { display_name: profileMap.get(r.user_id) ?? null } })));
      setViolations((v ?? []).map((r: any) => ({ ...r, display_name: profileMap.get(r.user_id) ?? null })));
      setLoading(false);
    })();
  }, [isAdmin]);

  if (authLoading) return null;
  if (!isAdmin) return <Navigate to="/" replace />;

  // Aggregate distribution by level (highest cert per user)
  const byUser = new Map<string, SkillLevel>();
  certs.forEach((c) => {
    const cur = byUser.get(c.user_id);
    if (!cur || levelOrder[c.level] > levelOrder[cur]) byUser.set(c.user_id, c.level);
  });

  const levels: SkillLevel[] = ["beginner", "intermediate", "advanced", "production_ready"];
  const distribution = levels.map((lvl) => ({
    name: t(`skills.levels.${lvl}`),
    level: lvl,
    count: Array.from(byUser.values()).filter((l) => l === lvl).length,
  }));

  const productionReadyCount = distribution.find((d) => d.level === "production_ready")?.count ?? 0;
  const totalAttempts = attempts.length;
  const avgScore = totalAttempts ? Math.round(attempts.reduce((s, a) => s + a.score, 0) / totalAttempts) : 0;

  // Pass / fail rates
  let passed = 0;
  attempts.forEach((a) => {
    const p = quizzesMap.get((a as any).quiz_id)?.passing_score ?? 70;
    if (a.score >= p) passed += 1;
  });
  const passRate = totalAttempts ? Math.round((passed / totalAttempts) * 100) : 0;
  const passFailData = [
    { name: t("quiz.passed"), value: passed, fill: "hsl(160 84% 39%)" },
    { name: t("quiz.failed"), value: Math.max(totalAttempts - passed, 0), fill: "hsl(0 72% 60%)" },
  ];

  // Aggregate weak areas
  const weakMap = new Map<string, { id: string; title: string; slug: string; count: number }>();
  attempts.forEach((a) => {
    (a.weak_areas ?? []).forEach((w) => {
      const ex = weakMap.get(w.id);
      weakMap.set(w.id, { ...w, count: (ex?.count ?? 0) + 1 });
    });
  });
  const weakAreas = Array.from(weakMap.values()).sort((a, b) => b.count - a.count).slice(0, 8);

  const fraudCount = violations.length;
  const usersWithViolations = new Set(violations.map((v) => v.user_id)).size;

  const levelColors: Record<SkillLevel, string> = {
    beginner: "hsl(var(--muted-foreground))",
    intermediate: "hsl(217 91% 60%)",
    advanced: "hsl(258 90% 66%)",
    production_ready: "hsl(160 84% 39%)",
  };

  if (loading) {
    return (
      <div className="mx-auto max-w-6xl px-6 py-12 flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> {t("common.loading")}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-6 py-12">
      <div className="mb-8 animate-fade-in">
        <h1 className="text-3xl font-display font-semibold tracking-tight">{t("admin.title")}</h1>
        <p className="mt-2 text-muted-foreground">{t("admin.subtitle")}</p>
      </div>

      {/* KPIs */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5 mb-8 animate-fade-up">
        <Card className="p-5">
          <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground mb-2">
            <ShieldCheck className="h-3.5 w-3.5" /> {t("admin.productionReady")}
          </div>
          <div className="text-2xl font-semibold">{productionReadyCount}</div>
          <div className="text-xs text-muted-foreground mt-1">/ {byUser.size} assessed</div>
        </Card>
        <Card className="p-5">
          <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground mb-2">
            <Activity className="h-3.5 w-3.5" /> {t("admin.totalAttempts")}
          </div>
          <div className="text-2xl font-semibold">{totalAttempts}</div>
        </Card>
        <Card className="p-5">
          <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground mb-2">
            <Target className="h-3.5 w-3.5" /> {t("admin.avgScore")}
          </div>
          <div className="text-2xl font-semibold">
            {avgScore}
            <span className="text-sm text-muted-foreground">/100</span>
          </div>
        </Card>
        <Card className="p-5">
          <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground mb-2">
            <TrendingUp className="h-3.5 w-3.5" /> {t("admin.passRate")}
          </div>
          <div className="text-2xl font-semibold">
            {passRate}
            <span className="text-sm text-muted-foreground">%</span>
          </div>
        </Card>
        <Card className={`p-5 ${fraudCount > 0 ? "border-amber-500/40 bg-amber-500/5" : ""}`}>
          <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground mb-2">
            <ShieldAlert className="h-3.5 w-3.5" /> {t("admin.fraudDetected")}
          </div>
          <div className={`text-2xl font-semibold ${fraudCount > 0 ? "text-amber-600 dark:text-amber-400" : ""}`}>{fraudCount}</div>
          <div className="text-xs text-muted-foreground mt-1">{usersWithViolations} users</div>
        </Card>
      </div>

      {/* Charts row: distribution + pass/fail */}
      <div className="grid gap-4 lg:grid-cols-3 mb-8 animate-fade-up">
        <Card className="p-6 lg:col-span-2">
          <div className="flex items-center gap-2 text-sm font-semibold mb-4">
            <Users className="h-4 w-4 text-primary" /> {t("admin.teamDistribution")}
          </div>
          {byUser.size === 0 ? (
            <div className="text-sm text-muted-foreground py-12 text-center">{t("admin.noData")}</div>
          ) : (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={distribution}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="name" stroke="hsl(var(--muted-foreground))" fontSize={11} />
                  <YAxis allowDecimals={false} stroke="hsl(var(--muted-foreground))" fontSize={11} />
                  <Tooltip
                    contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: "8px", fontSize: "12px" }}
                  />
                  <Bar dataKey="count" radius={[6, 6, 0, 0]}>
                    {distribution.map((d) => (
                      <Cell key={d.level} fill={levelColors[d.level]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>

        <Card className="p-6">
          <div className="flex items-center gap-2 text-sm font-semibold mb-4">
            <Award className="h-4 w-4 text-primary" /> {t("admin.certificationReadiness")}
          </div>
          {totalAttempts === 0 ? (
            <div className="text-sm text-muted-foreground py-12 text-center">{t("admin.noData")}</div>
          ) : (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={passFailData} dataKey="value" nameKey="name" innerRadius={50} outerRadius={80} paddingAngle={2}>
                    {passFailData.map((d, i) => (
                      <Cell key={i} fill={d.fill} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: "8px", fontSize: "12px" }}
                  />
                  <Legend wrapperStyle={{ fontSize: "11px" }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>
      </div>

      {/* Monitoring panel */}
      <Card className="p-6 mb-8 animate-fade-up">
        <div className="flex items-center gap-2 text-sm font-semibold mb-4">
          <ShieldAlert className="h-4 w-4 text-amber-500" /> {t("admin.monitoringTitle")} — {t("admin.violationLog")}
        </div>
        {violations.length === 0 ? (
          <div className="text-sm text-muted-foreground py-8 text-center">{t("admin.noViolations")}</div>
        ) : (
          <div className="divide-y divide-border max-h-[420px] overflow-y-auto -mx-6">
            {violations.map((v) => (
              <div key={v.id} className="flex items-center justify-between gap-4 px-6 py-3">
                <div className="min-w-0">
                  <div className="font-medium text-sm truncate">{v.display_name ?? v.user_id.slice(0, 8)}</div>
                  <div className="text-xs text-muted-foreground truncate">
                    {quizzesMap.get(v.quiz_id)?.title ?? "—"} · {new Date(v.created_at).toLocaleString()}
                  </div>
                </div>
                <Badge
                  variant={v.violation_type === "auto_submit" ? "destructive" : "secondary"}
                  className="text-[10px] shrink-0"
                >
                  {v.violation_type}
                </Badge>
              </div>
            ))}
          </div>
        )}
      </Card>
        {byUser.size === 0 ? (
          <div className="text-sm text-muted-foreground py-12 text-center">{t("admin.noData")}</div>
        ) : (
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={distribution}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="name" stroke="hsl(var(--muted-foreground))" fontSize={11} />
                <YAxis allowDecimals={false} stroke="hsl(var(--muted-foreground))" fontSize={11} />
                <Tooltip
                  contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: "8px", fontSize: "12px" }}
                />
                <Bar dataKey="count" radius={[6, 6, 0, 0]}>
                  {distribution.map((d) => <Cell key={d.level} fill={levelColors[d.level]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </Card>

      {/* Weak areas */}
      {weakAreas.length > 0 && (
        <Card className="p-6 mb-8 animate-fade-up">
          <div className="text-sm font-semibold mb-3">{t("admin.weakAreas")}</div>
          <div className="space-y-2">
            {weakAreas.map((w) => (
              <div key={w.id} className="flex items-center justify-between text-sm">
                <span className="truncate">{w.title}</span>
                <Badge variant="secondary">{w.count}</Badge>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Recent activity */}
      <div className="animate-fade-up">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3">{t("admin.lastActivity")}</h2>
        {attempts.length === 0 ? (
          <Card className="p-8 text-center text-sm text-muted-foreground">{t("admin.noData")}</Card>
        ) : (
          <Card>
            <div className="divide-y divide-border">
              {attempts.slice(0, 15).map((a) => (
                <div key={a.id} className="flex items-center justify-between gap-4 px-5 py-3">
                  <div className="min-w-0">
                    <div className="font-medium text-sm truncate">{a.profiles?.display_name ?? a.user_id.slice(0, 8)}</div>
                    <div className="text-xs text-muted-foreground truncate">
                      {a.quizzes?.title} · {new Date(a.completed_at).toLocaleString()}
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="text-sm font-medium">{a.score}/100</span>
                    {a.quizzes?.category && (
                      <Badge variant="outline" className="text-[10px]">{t(`docs.categories.${a.quizzes.category}`, a.quizzes.category)}</Badge>
                    )}
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
