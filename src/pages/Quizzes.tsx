import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ClipboardCheck, Clock, Loader2, Target } from "lucide-react";

interface Quiz {
  id: string;
  title: string;
  description: string | null;
  category: string;
  passing_score: number;
  time_limit_minutes: number | null;
  question_count?: number;
}

export default function Quizzes() {
  const { t } = useTranslation();
  const [quizzes, setQuizzes] = useState<Quiz[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data, error } = await (supabase.rpc as any)("list_assessments");
      if (error) {
        console.error("Failed to load assessments", error);
        setQuizzes([]);
      } else {
        setQuizzes((data ?? []) as Quiz[]);
      }
      setLoading(false);
    })();
  }, []);

  return (
    <div className="mx-auto max-w-5xl px-6 py-12">
      <div className="mb-8 animate-fade-in">
        <h1 className="text-3xl font-display font-semibold tracking-tight">{t("quiz.title")}</h1>
        <p className="mt-2 text-muted-foreground">{t("quiz.subtitle")}</p>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> {t("common.loading")}
        </div>
      ) : quizzes.length === 0 ? (
        <Card className="p-12 text-center text-muted-foreground">{t("quiz.empty")}</Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {quizzes.map((q) => (
            <Card key={q.id} className="p-6 hover:shadow-[var(--shadow-elegant)] transition-all hover:-translate-y-0.5 animate-fade-up">
              <div className="flex items-start justify-between gap-3 mb-3">
                <div className="min-w-0">
                  <Badge variant="outline" className="mb-2 text-[10px] uppercase tracking-wider">
                    {t(`docs.categories.${q.category}`, q.category)}
                  </Badge>
                  <h3 className="font-semibold tracking-tight">{q.title}</h3>
                </div>
                <ClipboardCheck className="h-5 w-5 text-primary shrink-0" />
              </div>
              {q.description && <p className="text-sm text-muted-foreground line-clamp-2 mb-4">{q.description}</p>}
              <div className="flex items-center gap-4 text-xs text-muted-foreground mb-4">
                <span>{q.question_count} {t("quiz.questions")}</span>
                <span className="flex items-center gap-1"><Target className="h-3 w-3" /> {q.passing_score}%</span>
                {q.time_limit_minutes && (
                  <span className="flex items-center gap-1"><Clock className="h-3 w-3" /> {q.time_limit_minutes} {t("quiz.minutes")}</span>
                )}
              </div>
              <Button asChild size="sm" className="w-full">
                <Link to={`/quizzes/${q.id}`}>{t("quiz.start")}</Link>
              </Button>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
