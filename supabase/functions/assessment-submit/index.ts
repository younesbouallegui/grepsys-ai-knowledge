import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { mapZabbixRole, zabbixRpc, zabbixUserIdToUuid } from "../_shared/zabbix.ts";

async function resolveUser(zabbix_token: string): Promise<{ id: string; role: "admin" | "editor" | "viewer" }> {
  const users = await zabbixRpc("user.get", { output: ["userid", "roleid"] }, zabbix_token);
  const u = users?.[0];
  if (!u?.userid) throw new Error("Invalid Zabbix session");
  return { id: await zabbixUserIdToUuid(String(u.userid)), role: mapZabbixRole(u.roleid) };
}

function sb() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json();
    const { action, zabbix_token } = body ?? {};
    if (!action || !zabbix_token) return json({ error: "Missing fields" }, 400);

    const { id: platformUserId, role: userRole } = await resolveUser(String(zabbix_token));
    const client = sb();

    if (action === "submit") {
      if (!body.quiz_id) return json({ error: "Missing quiz_id" }, 400);
      const { data, error } = await client.rpc("score_quiz_attempt_as", {
        p_user_id: platformUserId,
        p_quiz_id: body.quiz_id,
        p_answers: body.answers ?? [],
        p_auto: !!body.auto,
        p_violations_count: body.violations_count ?? 0,
      });
      if (error) throw error;

      // Persist a durable record in assessment_results for full history
      try {
        const result = (data ?? {}) as any;
        const { data: quizMeta } = await client
          .from("quizzes")
          .select("category, title")
          .eq("id", body.quiz_id)
          .maybeSingle();
        const skills = {
          category: quizMeta?.category ?? null,
          title: quizMeta?.title ?? null,
          level: result.level ?? null,
          weak_doc_ids: result.weak_doc_ids ?? [],
        };
        await client.from("assessment_results").insert({
          user_id: platformUserId,
          assessment_id: body.quiz_id,
          attempt_id: result.attempt_id ?? null,
          score: result.score ?? 0,
          level: result.level ?? "beginner",
          skills,
        });
      } catch (persistErr) {
        console.error("assessment_results insert failed", persistErr);
      }

      return json({ data });
    }


    if (action === "violation") {
      if (!body.quiz_id) return json({ error: "Missing quiz_id" }, 400);
      const { error } = await client.rpc("record_assessment_violation_as", {
        p_user_id: platformUserId,
        p_quiz_id: body.quiz_id,
        p_violation_type: String(body.violation_type ?? "unknown"),
        p_details: body.details ?? {},
      });
      if (error) throw error;
      return json({ ok: true });
    }

    if (action === "history") {
      const [{ data: certs, error: cErr }, { data: attempts, error: aErr }] = await Promise.all([
        client.from("certifications").select("*").eq("user_id", platformUserId),
        client
          .from("quiz_attempts")
          .select("id, score, level, completed_at, weak_areas, quizzes(title, category)")
          .eq("user_id", platformUserId)
          .order("completed_at", { ascending: false })
          .limit(20),
      ]);
      if (cErr) throw cErr;
      if (aErr) throw aErr;
      return json({ certs: certs ?? [], attempts: attempts ?? [] });
    }

    if (action === "admin_data") {
      if (userRole !== "admin") {
        return json({ error: "forbidden" }, 403);
      }

      const [{ data: certs }, { data: attempts }, { data: violations }, { data: quizzes }] = await Promise.all([
        client.from("certifications").select("user_id, category, level, best_score, awarded_at"),
        client
          .from("quiz_attempts")
          .select("id, user_id, quiz_id, score, completed_at, weak_areas, quizzes(title, category)")
          .order("completed_at", { ascending: false })
          .limit(200),
        client
          .from("assessment_violations")
          .select("id, user_id, quiz_id, violation_type, details, created_at")
          .order("created_at", { ascending: false })
          .limit(100),
        client.from("quizzes").select("id, title, passing_score"),
      ]);

      const userIds = Array.from(new Set([
        ...(certs ?? []).map((r: any) => r.user_id),
        ...(attempts ?? []).map((r: any) => r.user_id),
        ...(violations ?? []).map((r: any) => r.user_id),
      ]));
      let profiles: any[] = [];
      if (userIds.length) {
        const { data: profs } = await client.from("profiles").select("id, display_name").in("id", userIds);
        profiles = profs ?? [];
      }

      const { data: results } = await client
        .from("assessment_results")
        .select("id, user_id, assessment_id, score, level, skills, submitted_at")
        .order("submitted_at", { ascending: false });

      const allUserIds = Array.from(new Set([
        ...userIds,
        ...((results ?? []).map((r: any) => r.user_id)),
      ]));
      if (allUserIds.length > userIds.length) {
        const { data: profs } = await client.from("profiles").select("id, display_name").in("id", allUserIds);
        profiles = profs ?? [];
      }

      return json({
        certs: certs ?? [],
        attempts: attempts ?? [],
        violations: violations ?? [],
        quizzes: quizzes ?? [],
        profiles,
        results: results ?? [],
      });
    }


    return json({ error: "Unknown action" }, 400);
  } catch (e) {
    console.error("assessment-submit error", e);
    return json({ error: String((e as Error).message ?? e) }, 500);
  }
});
