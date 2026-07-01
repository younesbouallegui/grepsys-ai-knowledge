import { createClient } from "npm:@supabase/supabase-js@2";
import { jsonResponse, ssoCorsHeaders, SSO_VERSION } from "../_shared/sso.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: ssoCorsHeaders(req) });
  const signing_secret_present = !!Deno.env.get("SSO_SHARED_SECRET");
  let nonce_store: "ok" | "error" = "ok";
  let last_inbound: string | null = null;
  let last_outbound: string | null = null;
  try {
    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const { error } = await sb.from("sso_nonces").select("nonce").limit(1);
    if (error) nonce_store = "error";
    const { data: ins } = await sb
      .from("sso_exchange_log")
      .select("created_at")
      .eq("direction", "inbound").eq("succeeded", true)
      .order("created_at", { ascending: false }).limit(1).maybeSingle();
    last_inbound = ins?.created_at ?? null;
    const { data: outs } = await sb
      .from("sso_exchange_log")
      .select("created_at")
      .eq("direction", "outbound").eq("succeeded", true)
      .order("created_at", { ascending: false }).limit(1).maybeSingle();
    last_outbound = outs?.created_at ?? null;
  } catch (e) {
    nonce_store = "error";
    console.error(e);
  }

  return jsonResponse({
    ok: signing_secret_present && nonce_store === "ok",
    fn: "sso-health",
    version: SSO_VERSION,
    signing_secret_present,
    shared_secret_present: signing_secret_present,
    nonce_store,
    last_successful_inbound_at: last_inbound,
    last_successful_outbound_at: last_outbound,
    hub_sso_url: Deno.env.get("HUB_SSO_URL") ?? "https://poulinaaihub.younesblg.com/auth/sso",
  }, 200, req);
});
