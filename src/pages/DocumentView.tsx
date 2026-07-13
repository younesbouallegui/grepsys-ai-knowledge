import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ArrowLeft } from "lucide-react";

interface Doc { id: string; title: string; category: string; content: string; updated_at: string; }

export default function DocumentView() {
  const { slug } = useParams();
  const { t } = useTranslation();
  const [doc, setDoc] = useState<Doc | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!slug) return;
    supabase.from("documents").select("id, title, category, content, updated_at").eq("slug", slug).maybeSingle().then(({ data }) => {
      setDoc(data as Doc | null);
      setLoading(false);
    });
  }, [slug]);

  if (loading) return <div className="p-10 text-muted-foreground text-sm">{t("common.loading")}</div>;
  if (!doc) return <div className="p-10 text-muted-foreground">Not found</div>;

  return (
    <article className="mx-auto max-w-3xl px-6 py-10 animate-fade-in">
      <Link to="/docs" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-6">
        <ArrowLeft className="h-4 w-4" /> {t("docs.backToDocs")}
      </Link>
      <div className="text-xs uppercase tracking-wider text-primary font-medium mb-2">
        {t(`docs.categories.${doc.category}`)}
      </div>
      <h1 className="text-3xl md:text-4xl font-display font-semibold tracking-tight mb-8">{doc.title}</h1>
      <div className="prose prose-base dark:prose-invert max-w-none prose-headings:font-display prose-headings:tracking-tight prose-a:text-primary prose-code:text-primary prose-code:bg-primary-soft prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:text-sm prose-code:before:hidden prose-code:after:hidden">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{doc.content}</ReactMarkdown>
      </div>
    </article>
  );
}
