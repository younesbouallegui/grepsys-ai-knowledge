// Edge function: seed-docs (admin only)
// Seeds initial Poulina documentation with embeddings into pgvector.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

interface SeedDoc { slug: string; title: string; category: string; summary: string; content: string; }

const docs: SeedDoc[] = [
  {
    slug: "monitoring-overview",
    title: "Monitoring Overview",
    category: "monitoring",
    summary: "Architecture, metrics, dashboards, and alerting for the Poulina platform.",
    content: `# Monitoring Overview\n\nThe Poulina platform uses a layered observability stack covering infrastructure, application, and business metrics.\n\n## Components\n- **Prometheus** for metrics collection\n- **Grafana** for dashboards\n- **Loki** for centralized logs\n- **Alertmanager** for routing notifications\n\n## Key Dashboards\n1. Cluster health\n2. API latency (p50/p95/p99)\n3. Error budgets per service\n4. Database connection pools\n\n## Best Practices\n- Always include service, environment, and version labels on metrics\n- Use SLO-based alerts rather than threshold-based ones\n- Page only on user-facing impact\n\n## Common Issues\n- **High cardinality**: avoid putting user IDs in label keys\n- **Missing data**: check the scrape target and network policies first`,
  },
  {
    slug: "proxy-configuration",
    title: "Proxy Configuration",
    category: "proxy",
    summary: "Reverse proxy, load balancing, TLS termination, and routing rules.",
    content: `# Proxy Configuration\n\nThe edge layer uses **NGINX** as a reverse proxy with TLS termination and rate limiting.\n\n## Routing\n- \`/api/*\` → backend services\n- \`/static/*\` → CDN cache\n- \`/health\` → health check endpoint\n\n## TLS\n- Certificates managed via cert-manager\n- Automatic renewal every 60 days\n- TLS 1.2+ only\n\n## Rate Limiting\n\`\`\`\nlimit_req_zone $binary_remote_addr zone=api:10m rate=100r/s;\n\`\`\`\n\n## Troubleshooting\n- **502 Bad Gateway**: upstream service is down or overloaded\n- **504 Gateway Timeout**: increase \`proxy_read_timeout\``,
  },
  {
    slug: "user-management",
    title: "User Management",
    category: "users",
    summary: "Roles, permissions, onboarding, and access control policies.",
    content: `# User Management\n\nThe platform uses **role-based access control (RBAC)** with three roles:\n\n| Role | Permissions |\n|------|-------------|\n| **Admin** | Full access, manage users and content |\n| **Engineer** | Read all docs, take quizzes, view dashboards |\n| **Viewer** | Read-only access |\n\n## Onboarding\n1. New users sign up via the login page\n2. They are auto-assigned the Viewer role\n3. An admin promotes them as needed\n\n## Best Practices\n- Review user roles quarterly\n- Use the least-privilege principle\n- Disable rather than delete inactive accounts`,
  },
  {
    slug: "database-operations",
    title: "Database Operations",
    category: "database",
    summary: "PostgreSQL administration: backups, migrations, performance tuning.",
    content: `# Database Operations\n\nThe platform runs on **PostgreSQL 15** with read replicas for analytics workloads.\n\n## Backups\n- Continuous WAL archiving to object storage\n- Daily snapshots retained for 30 days\n- Point-in-time recovery available within retention window\n\n## Migrations\n- All schema changes go through versioned migrations\n- Always test migrations in staging first\n- Avoid long locks on large tables — use \`CONCURRENTLY\` for indexes\n\n## Performance\n- Use \`EXPLAIN ANALYZE\` to inspect query plans\n- Add indexes for frequent WHERE/JOIN columns\n- Vacuum and analyze regularly\n\n## Common Issues\n- **Connection exhaustion**: tune the pooler (PgBouncer)\n- **Slow queries**: check \`pg_stat_statements\``,
  },
  {
    slug: "ai-engine-rag",
    title: "AI Engine — RAG Architecture",
    category: "ai",
    summary: "How the retrieval-augmented assistant indexes and answers questions.",
    content: `# AI Engine — RAG Architecture\n\nThe AI Ask assistant is **read-only** and grounded in your documentation.\n\n## Pipeline\n1. **Ingestion**: markdown documents are chunked\n2. **Embedding**: each chunk is embedded with \`text-embedding-3-small\` (1536 dims)\n3. **Storage**: vectors stored in PostgreSQL via pgvector\n4. **Retrieval**: cosine similarity search returns top-k chunks\n5. **Generation**: an LLM composes an answer from the retrieved context\n\n## Important\n- The assistant **never executes actions**\n- It only explains, guides, and teaches\n- Answers always cite their sources\n\n## Best Practices for Authors\n- Write clear, self-contained sections\n- Use headings to break up topics\n- Include examples and "common issues" sections`,
  },
  {
    slug: "troubleshooting-playbook",
    title: "Troubleshooting Playbook",
    category: "troubleshooting",
    summary: "Step-by-step incident response and common failure patterns.",
    content: `# Troubleshooting Playbook\n\nWhen something is broken, work the layers from outside-in.\n\n## Step-by-step\n1. **Check status page** — is it a known incident?\n2. **Check dashboards** — error rate, latency, saturation\n3. **Check logs** — filter by request ID\n4. **Reproduce locally** if possible\n5. **Roll back** the most recent deployment if symptoms started after it\n\n## Common Patterns\n- **Cascading failures**: usually a downstream timeout — add circuit breakers\n- **Memory leaks**: rolling restart while you investigate the root cause\n- **Database deadlocks**: check transaction ordering and lock granularity\n\n## Escalation\nIf the issue is not resolved in 30 minutes, escalate to the on-call lead.`,
  },
];

async function embed(text: string): Promise<number[]> {
  const r = await fetch("https://ai.gateway.lovable.dev/v1/embeddings", {
    method: "POST",
    headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: "openai/text-embedding-3-small", input: text }),
  });
  if (!r.ok) throw new Error(`embed: ${r.status} ${await r.text()}`);
  const j = await r.json();
  return j.data[0].embedding;
}

function chunkMarkdown(md: string, target = 600): string[] {
  const paras = md.split(/\n\n+/).map((p) => p.trim()).filter(Boolean);
  const out: string[] = [];
  let buf = "";
  for (const p of paras) {
    if ((buf + "\n\n" + p).length > target && buf) { out.push(buf); buf = p; }
    else buf = buf ? buf + "\n\n" + p : p;
  }
  if (buf) out.push(buf);
  return out;
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

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data: roleRow } = await admin.from("user_roles").select("role").eq("user_id", user.id).eq("role", "admin").maybeSingle();
    if (!roleRow) {
      // First-run convenience: if no admin exists yet, promote this caller.
      const { count } = await admin.from("user_roles").select("*", { count: "exact", head: true }).eq("role", "admin");
      if ((count ?? 0) === 0) {
        await admin.from("user_roles").insert({ user_id: user.id, role: "admin" });
      } else {
        return new Response(JSON.stringify({ error: "admin only" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    }

    let inserted = 0;
    for (const d of docs) {
      const { data: doc, error } = await admin
        .from("documents")
        .upsert({ slug: d.slug, title: d.title, category: d.category, summary: d.summary, content: d.content, created_by: user.id }, { onConflict: "slug" })
        .select("id")
        .single();
      if (error) throw error;

      await admin.from("document_chunks").delete().eq("document_id", doc.id);
      const chunks = chunkMarkdown(d.content);
      for (let i = 0; i < chunks.length; i++) {
        const e = await embed(chunks[i]);
        const { error: ce } = await admin.from("document_chunks").insert({
          document_id: doc.id,
          content: chunks[i],
          embedding: e as any,
          chunk_index: i,
        });
        if (ce) throw ce;
      }
      inserted++;
    }

    return new Response(JSON.stringify({ ok: true, documents: inserted }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("seed-docs error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
