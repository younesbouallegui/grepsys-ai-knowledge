import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, BookOpen, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";

interface Doc { id: string; slug: string; title: string; category: string; summary: string | null; }

const categoryKeys = ["monitoring", "proxy", "users", "database", "ai", "troubleshooting"];

export default function Documentation() {
  const { t } = useTranslation();
  const [params, setParams] = useSearchParams();
  const [docs, setDocs] = useState<Doc[]>([]);
  const [query, setQuery] = useState("");
  const [seeding, setSeeding] = useState(false);
  const activeCat = params.get("category");

  const load = () =>
    supabase.from("documents").select("id, slug, title, category, summary").order("title").then(({ data }) => {
      setDocs((data as Doc[]) ?? []);
    });

  useEffect(() => { load(); }, []);

  const seed = async () => {
    setSeeding(true);
    const { error } = await supabase.functions.invoke("seed-docs");
    if (error) toast.error(error.message);
    else { toast.success("Sample documentation indexed."); await load(); }
    setSeeding(false);
  };

  const filtered = useMemo(() => {
    let list = docs;
    if (activeCat) list = list.filter((d) => d.category === activeCat);
    if (query.trim()) {
      const q = query.toLowerCase();
      list = list.filter((d) => d.title.toLowerCase().includes(q) || (d.summary ?? "").toLowerCase().includes(q));
    }
    return list;
  }, [docs, activeCat, query]);

  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      <div className="mb-8">
        <h1 className="text-3xl font-display font-semibold tracking-tight">{t("docs.title")}</h1>
        <p className="mt-1 text-muted-foreground">{t("docs.subtitle")}</p>
      </div>

      <div className="mb-6 relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder={t("common.search")}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="pl-9 h-11"
        />
      </div>

      <div className="flex flex-wrap gap-2 mb-8">
        <button
          onClick={() => setParams({})}
          className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${!activeCat ? "bg-primary text-primary-foreground border-primary" : "border-border hover:bg-accent"}`}
        >
          All
        </button>
        {categoryKeys.map((k) => (
          <button
            key={k}
            onClick={() => setParams({ category: k })}
            className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${activeCat === k ? "bg-primary text-primary-foreground border-primary" : "border-border hover:bg-accent"}`}
          >
            {t(`docs.categories.${k}`)}
          </button>
        ))}
      </div>

      {docs.length === 0 ? (
        <Card className="p-10 text-center">
          <Sparkles className="h-6 w-6 mx-auto text-primary mb-3" />
          <h3 className="font-display font-semibold mb-1">No documentation indexed yet</h3>
          <p className="text-sm text-muted-foreground mb-4">Seed the platform with sample Grepsys documentation to get started.</p>
          <Button onClick={seed} disabled={seeding}>
            {seeding ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Sparkles className="h-4 w-4 mr-2" />}
            Seed sample documentation
          </Button>
          <p className="text-xs text-muted-foreground mt-3">The first user to seed becomes the platform admin.</p>
        </Card>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground text-sm">{t("docs.empty")}</div>
      ) : (
        <div className="grid md:grid-cols-2 gap-4">
          {filtered.map((d) => (
            <Link key={d.id} to={`/docs/${d.slug}`}>
              <Card className="p-5 h-full hover:shadow-[var(--shadow-elegant)] transition-all hover:-translate-y-0.5">
                <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-primary font-medium mb-2">
                  <BookOpen className="h-3 w-3" />
                  {t(`docs.categories.${d.category}`)}
                </div>
                <h3 className="font-display font-semibold tracking-tight mb-1">{d.title}</h3>
                {d.summary && <p className="text-sm text-muted-foreground line-clamp-2">{d.summary}</p>}
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
