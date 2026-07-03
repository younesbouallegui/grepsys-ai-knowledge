// Outbound SSO: Knowledge → Hub. Verifies the caller's Knowledge app-session
// token, mints a signed Hub-bound SSO JWT, and returns the Hub redirect URL.
import { createClient } from "npm:@supabase/supabase-js@2";
import {
  AUDIENCE_HUB,
  AUDIENCE_KNOWLEDGE_APP,
  ISSUER_KNOWLEDGE,
  jsonResponse,
  newNonce,
  signJwt,
  ssoCorsHeaders,
  SSO_VERSION,
  verifyJwt,
} from "../_shared/sso.ts";

const HUB_SSO_URL = Deno.env.get("HUB_SSO_URL") ?? "https://poulinaaihub.younesblg.com/auth/sso";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: ssoCorsHeaders(req) });
  const url = new URL(req.url);
  if (req.method === "GET" && url.pathname.endsWith("/health")) {
    return jsonResponse({ ok: true, fn: "sso-issue", version: SSO_VERSION, hub_sso_url: HUB_SSO_URL }, 200, req);
  }

  try {
    const { session_token } = await req.json();
    if (!session_token) return jsonResponse({ error: "Missing session_token" }, 400, req);

    const v = await verifyJwt(session_token, {
      expectedIssuer: ISSUER_KNOWLEDGE,
      expectedAudience: AUDIENCE_KNOWLEDGE_APP,
    });
    if (!v.signature_valid || v.expired || !v.issuer_ok || !v.audience_ok || !v.claims) {
      const primary = v.failure_reasons[0] ?? v.error ?? "Invalid session";
      console.error("sso-issue session validation failed", JSON.stringify({
        primary,
        failure_reasons: v.failure_reasons,
        expected_issuer: v.expected_issuer,
        actual_issuer: v.actual_issuer,
        expected_audience: v.expected_audience,
        actual_audience: v.actual_audience,
        token_length: v.token_length,
        token_segments: v.token_segments,
        segment_lengths: v.segment_lengths,
        token_sha256_prefix: v.token_sha256_prefix,
      }));
      return jsonResponse({ error: primary, code: "session_validation_failed", validation: v }, 401, req);
    }
    const c = v.claims as any;

    const now = Math.floor(Date.now() / 1000);
    const token = await signJwt({
      iss: ISSUER_KNOWLEDGE,
      aud: AUDIENCE_HUB,
      sub: c.sub,
      username: c.username,
      display_name: c.display_name,
      email: c.email,
      roles: c.roles ?? [],
      nonce: newNonce(),
      iat: now,
      exp: now + 60,
    });

    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    await sb.from("sso_exchange_log").insert({
      direction: "outbound",
      zabbix_user_id: String(c.sub ?? ""),
      username: c.username ?? null,
      succeeded: true,
    });

    return jsonResponse({
      redirect_url: `${HUB_SSO_URL}?code=${encodeURIComponent(token)}`,
      version: SSO_VERSION,
    }, 200, req);
  } catch (e) {
    console.error(e);
    return jsonResponse({ error: String((e as Error).message ?? e) }, 500, req);
  }
});
