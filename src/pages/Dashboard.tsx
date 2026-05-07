import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { ArrowUp, BookOpen, Sparkles, Loader2, ExternalLink, Plus, Paperclip, X, FileText, Image as ImageIcon } from "lucide-react";
import { Link } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { parseAttachment, type ParsedAttachment } from "@/lib/fileParser";

interface Source {
  document_id: string;
  document_title: string;
  document_slug: string;
  document_category: string;
}

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  sources?: Source[];
  streaming?: boolean;
  attachments?: { name: string; kind: "image" | "text"; preview?: string }[];
}

const suggestions = [
  "How do I monitor production database health?",
  "Explain the proxy failover strategy",
  "What are common troubleshooting steps?",
  "Walk me through user provisioning",
];

const STREAM_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ask-stream`;

export default function Dashboard() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [name, setName] = useState("");
  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [busy, setBusy] = useState(false);
  const [attachments, setAttachments] = useState<ParsedAttachment[]>([]);
  const [parsingFiles, setParsingFiles] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!user) return;
    supabase.from("profiles").select("display_name").eq("id", user.id).maybeSingle().then(({ data }) => {
      if (data?.display_name) setName(data.display_name);
    });
  }, [user]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages]);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 200) + "px";
  }, [question]);

  const handleFiles = async (files: FileList | File[]) => {
    const arr = Array.from(files).slice(0, 10);
    if (!arr.length) return;
    setParsingFiles(true);
    try {
      const parsed = await Promise.all(
        arr.map(async (f) => {
          try { return await parseAttachment(f); }
          catch (e: any) { toast.error(`${f.name}: ${e.message}`); return null; }
        })
      );
      setAttachments((prev) => [...prev, ...parsed.filter(Boolean) as ParsedAttachment[]]);
    } finally {
      setParsingFiles(false);
    }
  };

  const removeAttachment = (idx: number) =>
    setAttachments((prev) => prev.filter((_, i) => i !== idx));

  const ask = async (text?: string) => {
    const q = (text ?? question).trim();
    if ((!q && attachments.length === 0) || busy) return;
    const currentAttachments = attachments;
    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: q || "(see attached files)",
      attachments: currentAttachments.map(a => ({
        name: a.name, kind: a.kind, preview: a.kind === "image" ? a.data : undefined,
      })),
    };
    const assistantId = crypto.randomUUID();
    const placeholder: ChatMessage = { id: assistantId, role: "assistant", content: "", streaming: true };
    const history = messages.filter(m => !m.streaming).map(m => ({
      role: m.role, content: m.content,
    }));

    setMessages((prev) => [...prev, userMsg, placeholder]);
    setQuestion("");
    setAttachments([]);
    setBusy(true);

    const controller = new AbortController();
    abortRef.current = controller;

    // Smooth typewriter renderer: drains a buffer char-by-char so big chunks feel natural.
    let displayed = "";
    let pending = "";
    let streamFinished = false;
    let rafId: number | null = null;
    const tick = () => {
      if (pending.length === 0) {
        rafId = null;
        if (streamFinished) {
          setMessages((prev) => prev.map(m =>
            m.id === assistantId ? { ...m, streaming: false } : m));
        }
        return;
      }
      // Adaptive speed: drain faster when buffer is large so we never lag behind.
      const take = Math.max(1, Math.min(pending.length, Math.ceil(pending.length / 8)));
      displayed += pending.slice(0, take);
      pending = pending.slice(take);
      setMessages((prev) => prev.map(m =>
        m.id === assistantId ? { ...m, content: displayed } : m));
      rafId = requestAnimationFrame(tick);
    };
    const enqueue = (chunk: string) => {
      pending += chunk;
      if (rafId == null) rafId = requestAnimationFrame(tick);
    };

    try {
      const resp = await fetch(STREAM_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({
          question: q || "Please analyze the attached files.",
          attachments: currentAttachments.map(a => ({
            name: a.name, type: a.type, kind: a.kind, data: a.data,
          })),
          history,
        }),
        signal: controller.signal,
      });

      if (!resp.ok || !resp.body) {
        if (resp.status === 429) throw new Error("Rate limited, please try again shortly.");
        if (resp.status === 402) throw new Error("AI credits exhausted.");
        const err = await resp.text();
        throw new Error(err || `Request failed (${resp.status})`);
      }

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let done = false;

      while (!done) {
        const { done: streamDone, value } = await reader.read();
        if (streamDone) break;
        buffer += decoder.decode(value, { stream: true });

        let nl: number;
        while ((nl = buffer.indexOf("\n")) !== -1) {
          let line = buffer.slice(0, nl);
          buffer = buffer.slice(nl + 1);
          if (line.endsWith("\r")) line = line.slice(0, -1);
          if (!line) continue;

          if (line.startsWith("event: sources")) continue;
          if (line.startsWith("data: ")) {
            const payload = line.slice(6).trim();
            if (payload === "[DONE]") { done = true; break; }
            try {
              const parsed = JSON.parse(payload);
              if (Array.isArray(parsed)) {
                setMessages((prev) => prev.map(m =>
                  m.id === assistantId ? { ...m, sources: parsed as Source[] } : m));
                continue;
              }
              const delta = parsed.choices?.[0]?.delta?.content;
              if (typeof delta === "string" && delta) enqueue(delta);
            } catch {
              buffer = line + "\n" + buffer;
              break;
            }
          }
        }
      }

      streamFinished = true;
      if (rafId == null) {
        setMessages((prev) => prev.map(m =>
          m.id === assistantId ? { ...m, streaming: false } : m));
      }
    } catch (err: any) {
      if (err.name === "AbortError") {
        setMessages((prev) => prev.map(m =>
          m.id === assistantId ? { ...m, streaming: false, content: m.content || "(stopped)" } : m));
      } else {
        setMessages((prev) => prev.map(m =>
          m.id === assistantId ? { ...m, content: err.message || t("ai.error"), streaming: false } : m));
        toast.error(err.message || t("ai.error"));
      }
    } finally {
      setBusy(false);
      abortRef.current = null;
    }
  };

  const newChat = () => setMessages([]);
  const isEmpty = messages.length === 0;

  const onPaste = (e: React.ClipboardEvent) => {
    const files = Array.from(e.clipboardData.files);
    if (files.length) { e.preventDefault(); handleFiles(files); }
  };

  return (
    <div
      className="flex flex-col h-[calc(100vh-3.5rem)] relative"
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={(e) => { if (e.currentTarget === e.target) setDragOver(false); }}
      onDrop={(e) => {
        e.preventDefault(); setDragOver(false);
        if (e.dataTransfer.files.length) handleFiles(e.dataTransfer.files);
      }}
    >
      {dragOver && (
        <div className="absolute inset-0 z-50 bg-primary/10 border-2 border-dashed border-primary rounded-lg flex items-center justify-center pointer-events-none">
          <div className="text-primary font-medium">Drop files to attach</div>
        </div>
      )}

      {!isEmpty && (
        <div className="flex items-center justify-between px-4 sm:px-6 py-2 border-b border-border/60">
          <div className="text-sm font-medium text-muted-foreground">AI Assistant</div>
          <Button size="sm" variant="ghost" onClick={newChat} className="gap-1.5 text-xs">
            <Plus className="h-3.5 w-3.5" /> New chat
          </Button>
        </div>
      )}

      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        {isEmpty ? (
          <div className="hero-glow min-h-full flex items-center justify-center px-6 py-16">
            <div className="w-full max-w-2xl text-center animate-fade-in">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary-soft text-primary text-xs font-medium mb-6">
                <Sparkles className="h-3 w-3" />
                AI Knowledge Assistant
              </div>
              <h1 className="text-3xl md:text-4xl font-display font-semibold tracking-tight">
                {t("dashboard.greeting")}{name ? `, ${name.split(" ")[0]}` : ""}.
              </h1>
              <p className="mt-3 text-muted-foreground">{t("dashboard.askHint")}</p>

              <div className="mt-10 grid grid-cols-1 sm:grid-cols-2 gap-2 text-left">
                {suggestions.map((s) => (
                  <button key={s} onClick={() => ask(s)}
                    className="group px-4 py-3 rounded-xl border border-border/60 bg-card/40 hover:bg-accent transition-colors text-sm">
                    <span className="text-foreground/90 group-hover:text-foreground">{s}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="mx-auto max-w-3xl px-4 sm:px-6 py-8 space-y-8">
            {messages.map((m) => <MessageBubble key={m.id} msg={m} />)}
          </div>
        )}
      </div>

      <div className="border-t border-border/60 bg-background/80 backdrop-blur-sm">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 py-4">
          {attachments.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-2">
              {attachments.map((a, i) => (
                <div key={i} className="group flex items-center gap-2 px-2.5 py-1.5 rounded-lg border border-border/60 bg-card text-xs">
                  {a.kind === "image" ? (
                    <img src={a.data} alt={a.name} className="h-6 w-6 object-cover rounded" />
                  ) : (
                    <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                  )}
                  <span className="max-w-[160px] truncate">{a.name}</span>
                  <button onClick={() => removeAttachment(i)} className="opacity-60 hover:opacity-100" aria-label="Remove">
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
              {parsingFiles && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
            </div>
          )}

          <form onSubmit={(e) => { e.preventDefault(); ask(); }}
            className="relative flex items-end gap-2 rounded-2xl border border-border bg-card shadow-[var(--shadow-elegant)] focus-within:border-primary/50 focus-within:ring-2 focus-within:ring-primary/15 transition-all">
            <button type="button" onClick={() => fileInputRef.current?.click()}
              className="ml-2 mb-2 h-9 w-9 inline-flex items-center justify-center rounded-xl text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
              aria-label="Attach files" title="Attach files / images">
              <Paperclip className="h-4 w-4" />
            </button>
            <input ref={fileInputRef} type="file" multiple hidden
              accept="image/*,.pdf,.docx,.txt,.md,.csv,.json,.log"
              onChange={(e) => { if (e.target.files) handleFiles(e.target.files); e.target.value = ""; }} />
            <textarea
              ref={textareaRef}
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              onPaste={onPaste}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); ask(); } }}
              placeholder={t("dashboard.askPlaceholder")}
              rows={1}
              className="flex-1 resize-none bg-transparent px-1 py-3.5 text-sm outline-none placeholder:text-muted-foreground max-h-[200px]"
            />
            <div className="p-2">
              {busy ? (
                <Button type="button" size="icon" variant="secondary"
                  onClick={() => abortRef.current?.abort()}
                  className="h-9 w-9 rounded-xl" aria-label="Stop">
                  <span className="h-3 w-3 bg-current rounded-sm" />
                </Button>
              ) : (
                <Button type="submit" size="icon"
                  disabled={!question.trim() && attachments.length === 0}
                  className="h-9 w-9 rounded-xl" aria-label={t("dashboard.submit")}>
                  <ArrowUp className="h-4 w-4" />
                </Button>
              )}
            </div>
          </form>
          <p className="mt-2 text-[11px] text-center text-muted-foreground">
            AI can make mistakes. Verify important information against the documentation.
          </p>
        </div>
      </div>
    </div>
  );
}

function MessageBubble({ msg }: { msg: ChatMessage }) {
  const { t } = useTranslation();
  const isUser = msg.role === "user";

  return (
    <div className={cn("flex gap-3 animate-fade-up", isUser ? "justify-end" : "justify-start")}>
      {!isUser && (
        <div className="h-8 w-8 shrink-0 rounded-full bg-gradient-to-br from-primary to-primary-glow flex items-center justify-center text-primary-foreground">
          <Sparkles className="h-4 w-4" />
        </div>
      )}
      <div className={cn("flex flex-col gap-2 min-w-0", isUser ? "items-end max-w-[85%]" : "flex-1")}>
        {msg.attachments && msg.attachments.length > 0 && (
          <div className={cn("flex flex-wrap gap-1.5", isUser ? "justify-end" : "")}>
            {msg.attachments.map((a, i) => a.preview ? (
              <img key={i} src={a.preview} alt={a.name}
                className="h-20 w-20 object-cover rounded-lg border border-border" />
            ) : (
              <div key={i} className="inline-flex items-center gap-1.5 text-xs px-2 py-1 rounded-md bg-muted">
                <FileText className="h-3 w-3" /> {a.name}
              </div>
            ))}
          </div>
        )}
        {isUser ? (
          <div className="rounded-2xl rounded-tr-sm bg-primary text-primary-foreground px-4 py-2.5 text-sm whitespace-pre-wrap break-words">
            {msg.content}
          </div>
        ) : msg.streaming ? (
          <div className="text-sm leading-relaxed whitespace-pre-wrap break-words text-foreground/90">
            {msg.content || <TypingDots />}
            {msg.content && <span className="inline-block w-1.5 h-4 ml-0.5 bg-primary/70 animate-pulse align-middle" />}
          </div>
        ) : (
          <div className="prose prose-sm dark:prose-invert max-w-none prose-headings:font-display prose-pre:bg-muted prose-pre:text-foreground">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
          </div>
        )}
        {!isUser && msg.sources && msg.sources.length > 0 && !msg.streaming && (
          <div className="pt-2">
            <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground mb-1.5">
              {t("ai.sourcesLabel")}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {msg.sources.map((s) => (
                <Link key={s.document_id} to={`/docs/${s.document_slug}`}
                  className="inline-flex items-center gap-1.5 text-xs px-2 py-1 rounded-md bg-accent text-accent-foreground hover:bg-primary-soft transition-colors">
                  <BookOpen className="h-3 w-3" />
                  {s.document_title}
                  <ExternalLink className="h-3 w-3 opacity-60" />
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function TypingDots() {
  return (
    <div className="flex items-center gap-1 py-1">
      <span className="h-2 w-2 rounded-full bg-muted-foreground/60 animate-bounce [animation-delay:-0.3s]" />
      <span className="h-2 w-2 rounded-full bg-muted-foreground/60 animate-bounce [animation-delay:-0.15s]" />
      <span className="h-2 w-2 rounded-full bg-muted-foreground/60 animate-bounce" />
    </div>
  );
}
