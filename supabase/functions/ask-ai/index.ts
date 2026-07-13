// Edge function: ask-ai
// RAG: embed user question -> match document_chunks via pgvector -> ask Gemini for an answer
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

async function embed(text: string): Promise<number[]> {
  // Lovable AI gateway: text-embedding-3-small (1536 dims)
  const r = await fetch("https://ai.gateway.lovable.dev/v1/embeddings", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model: "openai/text-embedding-3-small", input: text }),
  });
  if (!r.ok) throw new Error(`embedding failed: ${r.status} ${await r.text()}`);
  const j = await r.json();
  return j.data[0].embedding;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const auth = req.headers.get("Authorization");
    if (!auth) return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: auth } },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const { question } = await req.json();
    if (!question || typeof question !== "string" || question.length > 2000) {
      return new Response(JSON.stringify({ error: "Invalid question" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    // 1. Embed
    const queryEmbedding = await embed(question);

    // 2. Vector search
    const { data: matches, error: matchErr } = await admin.rpc("match_document_chunks", {
      query_embedding: queryEmbedding,
      match_count: 5,
    });
    if (matchErr) throw matchErr;

    const context = (matches ?? [])
      .map((m: any, i: number) => `[Source ${i + 1}: ${m.document_title}]\n${m.content}`)
      .join("\n\n---\n\n");

    const sources = Array.from(
      new Map(
        (matches ?? []).map((m: any) => [
          m.document_id,
          { document_id: m.document_id, document_title: m.document_title, document_slug: m.document_slug, document_category: m.document_category },
        ])
      ).values()
    );

    // 3. Ask LLM
    const sysPrompt = `You are the Poulina AI Knowledge assistant — a read-only documentation assistant for the Poulina Group enterprise platform.
You explain, guide, and teach. You NEVER execute actions or commands.
Answer ONLY based on the provided documentation context. If the answer is not in the context, say so honestly and suggest related topics.
Format answers in clean markdown with headings, bullet points, and code blocks where helpful. Keep responses concise and professional.`;

    const userPrompt = context.length === 0
      ? `Question: ${question}\n\nNo documentation is currently indexed. Tell the user no documentation is available yet and to add some via the admin tools.`
      : `Documentation context:\n\n${context}\n\n---\n\nUser question: ${question}\n\nAnswer based strictly on the context above.`;

    const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: sysPrompt },
          { role: "user", content: userPrompt },
        ],
      }),
    });

    if (aiResp.status === 429) return new Response(JSON.stringify({ error: "Rate limited, please try again shortly." }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    if (aiResp.status === 402) return new Response(JSON.stringify({ error: "AI credits exhausted. Add funds to your Lovable AI workspace." }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    if (!aiResp.ok) throw new Error(`AI error: ${aiResp.status} ${await aiResp.text()}`);

    const aiJson = await aiResp.json();
    const answer = aiJson.choices?.[0]?.message?.content ?? "";

    return new Response(JSON.stringify({ answer, sources: context.length === 0 ? [] : sources }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("ask-ai error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
