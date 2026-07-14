// Edge function: ask-stream
// Streams responses via Lovable AI Gateway (fast TTFT) with optional RAG + multimodal attachments.
// Falls back to NVIDIA if LOVABLE_API_KEY is unavailable.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
const LOVABLE_MODEL = Deno.env.get("LOVABLE_MODEL") ?? "google/gemini-3-flash-preview";
const NVIDIA_API_KEY = Deno.env.get("NVIDIA_API_KEY");
const NVIDIA_MODEL = Deno.env.get("NVIDIA_MODEL") ?? "meta/llama-3.1-8b-instruct";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

interface Attachment {
  name: string;
  type: string;
  kind: "image" | "text";
  data: string;
}

async function embed(text: string): Promise<number[] | null> {
  if (!LOVABLE_API_KEY) return null;
  try {
    const r = await fetch("https://ai.gateway.lovable.dev/v1/embeddings", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: "openai/text-embedding-3-small", input: text }),
    });
    if (!r.ok) return null;
    const j = await r.json();
    return j.data[0].embedding;
  } catch { return null; }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { question, attachments = [], history = [] } = await req.json() as {
      question: string;
      attachments?: Attachment[];
      history?: { role: "user" | "assistant"; content: string }[];
    };

    if (!question || typeof question !== "string" || question.length > 8000) {
      return new Response(JSON.stringify({ error: "Invalid question" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // RAG context (best-effort, fast: 3 chunks)
    let context = "";
    let sources: any[] = [];
    const queryEmbedding = await embed(question);
    if (queryEmbedding) {
      const admin = createClient(SUPABASE_URL, SERVICE_KEY);
      const { data: matches } = await admin.rpc("match_document_chunks", {
        query_embedding: queryEmbedding, match_count: 3,
      });
      if (matches?.length) {
        context = matches.map((m: any, i: number) =>
          `[Source ${i + 1}: ${m.document_title}]\n${m.content}`).join("\n\n---\n\n");
        sources = Array.from(new Map(matches.map((m: any) => [m.document_id, {
          document_id: m.document_id, document_title: m.document_title,
          document_slug: m.document_slug, document_category: m.document_category,
        }])).values());
      }
    }

    const textAttachments = attachments.filter(a => a.kind === "text");
    const imageAttachments = attachments.filter(a => a.kind === "image");
    const fileContext = textAttachments.length
      ? "\n\n--- Attached files ---\n" + textAttachments.map(a =>
          `[File: ${a.name}]\n${a.data.slice(0, 20000)}`).join("\n\n")
      : "";

    const sysPrompt = `You are the Grepsys AI Knowledge assistant — a read-only documentation assistant for the Grepsys enterprise platform.
You explain, guide, and teach. You NEVER execute actions or commands.
Use the provided documentation context and any attached files/images to answer.
If the answer is not present, say so honestly. Format in clean markdown.`;

    const userText = (context ? `Documentation context:\n\n${context}\n\n---\n\n` : "")
      + (fileContext ? `${fileContext}\n\n---\n\n` : "")
      + `User question: ${question}`;

    const userContent: any = imageAttachments.length
      ? [
          { type: "text", text: userText },
          ...imageAttachments.map(a => ({ type: "image_url", image_url: { url: a.data } })),
        ]
      : userText;

    const messages = [
      { role: "system", content: sysPrompt },
      ...history.slice(-10),
      { role: "user", content: userContent },
    ];

    // Prefer Lovable AI Gateway (faster TTFT), fall back to NVIDIA.
    const useLovable = !!LOVABLE_API_KEY;
    const upstreamUrl = useLovable
      ? "https://ai.gateway.lovable.dev/v1/chat/completions"
      : "https://integrate.api.nvidia.com/v1/chat/completions";
    const apiKey = useLovable ? LOVABLE_API_KEY! : NVIDIA_API_KEY!;
    const model = useLovable ? LOVABLE_MODEL : NVIDIA_MODEL;

    const upstream = await fetch(upstreamUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        Accept: "text/event-stream",
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: 0.4,
        stream: true,
      }),
    });

    if (!upstream.ok || !upstream.body) {
      const errText = await upstream.text();
      console.error("Upstream error:", upstream.status, errText);
      const status = upstream.status === 429 ? 429 : upstream.status === 402 ? 402 : 500;
      const msg = upstream.status === 429
        ? "Rate limit reached, please try again shortly."
        : upstream.status === 402
        ? "AI credits exhausted. Please add credits in Settings → Workspace → Usage."
        : `Upstream ${upstream.status}: ${errText.slice(0, 300)}`;
      return new Response(JSON.stringify({ error: msg }), {
        status, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        // Send sources event up-front so citations render alongside the streaming answer.
        controller.enqueue(encoder.encode(`event: sources\ndata: ${JSON.stringify(sources)}\n\n`));
        const reader = upstream.body!.getReader();
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            controller.enqueue(value);
          }
        } catch (e) {
          console.error("stream pipe err", e);
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        ...corsHeaders,
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        "Connection": "keep-alive",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (e) {
    console.error("ask-stream error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
