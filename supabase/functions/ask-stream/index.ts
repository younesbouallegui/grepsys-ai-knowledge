// Edge function: ask-stream
// Streams responses from NVIDIA-hosted Gemma model with optional RAG context + multimodal attachments.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const NVIDIA_API_KEY = Deno.env.get("NVIDIA_API_KEY")!;
const NVIDIA_MODEL = Deno.env.get("NVIDIA_MODEL") ?? "meta/llama-3.1-8b-instruct";
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

interface Attachment {
  name: string;
  type: string; // mime
  kind: "image" | "text"; // already-processed: image (data url) or extracted text
  data: string; // image: data:...;base64,xxx | text: extracted plain text
}

async function embed(text: string): Promise<number[] | null> {
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

    // RAG context (best-effort)
    let context = "";
    let sources: any[] = [];
    const queryEmbedding = await embed(question);
    if (queryEmbedding) {
      const admin = createClient(SUPABASE_URL, SERVICE_KEY);
      const { data: matches } = await admin.rpc("match_document_chunks", {
        query_embedding: queryEmbedding, match_count: 5,
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

    // Build attachment context
    const textAttachments = attachments.filter(a => a.kind === "text");
    const imageAttachments = attachments.filter(a => a.kind === "image");
    const fileContext = textAttachments.length
      ? "\n\n--- Attached files ---\n" + textAttachments.map(a =>
          `[File: ${a.name}]\n${a.data.slice(0, 20000)}`).join("\n\n")
      : "";

    const sysPrompt = `You are the Poulina AI Knowledge assistant — a read-only documentation assistant for the Poulina Group enterprise platform.
You explain, guide, and teach. You NEVER execute actions or commands.
Use the provided documentation context and any attached files/images to answer.
If the answer is not present, say so honestly. Format in clean markdown.`;

    const userText = (context ? `Documentation context:\n\n${context}\n\n---\n\n` : "")
      + (fileContext ? `${fileContext}\n\n---\n\n` : "")
      + `User question: ${question}`;

    // Gemma via NVIDIA expects OpenAI-compatible chat completions
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

    const upstream = await fetch("https://integrate.api.nvidia.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${NVIDIA_API_KEY}`,
        "Content-Type": "application/json",
        Accept: "text/event-stream",
      },
      body: JSON.stringify({
        model: NVIDIA_MODEL,
        messages,
        temperature: 0.4,
        top_p: 0.9,
        max_tokens: 1024,
        stream: true,
      }),
    });

    if (!upstream.ok || !upstream.body) {
      const errText = await upstream.text();
      console.error("NVIDIA error:", upstream.status, errText);
      return new Response(JSON.stringify({ error: `Upstream ${upstream.status}: ${errText.slice(0, 500)}` }), {
        status: upstream.status === 429 ? 429 : 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Pipe upstream SSE → client, prepending a "sources" event so the UI can render citations.
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        // Send sources first as a custom SSE event line
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
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
      },
    });
  } catch (e) {
    console.error("ask-stream error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
