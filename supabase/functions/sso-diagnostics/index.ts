// Read-only token inspector. Does NOT consume nonces.
import { createClient } from "npm:@supabase/supabase-js@2";
import {
  AUDIENCE_KNOWLEDGE,
  ISSUER_HUB,
  jsonResponse,
  ssoCors,
  SSO_VERSION,
  verifyJwt,
} from "../_shared/sso.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: ssoCors });
  const url = new URL(req.url);
  if (req.method === "GET" && url.pathname.endsWith("/health")) {
    return jsonResponse({ ok: true, fn: "sso-diagnostics", version: SSO_VERSION });
  }
  try {
    const { token, expected_issuer, expected_audience } = await req.json();
    if (!token) return jsonResponse({ error: "Missing token" }, 400);

    const v = await verifyJwt(token, {
      expectedIssuer: expected_issuer ?? ISSUER_HUB,
      expectedAudience: expected_audience ?? AUDIENCE_KNOWLEDGE,
      maxAgeSec: 120,
    });

    let nonce_used = false;
    if (v.claims?.nonce) {
      const sb = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      );
      const { data } = await sb.from("sso_nonces").select("nonce").eq("nonce", v.claims.nonce).maybeSingle();
      nonce_used = !!data;
    }

    return jsonResponse({
      version: SSO_VERSION,
      signature_valid: v.signature_valid,
      expired: v.expired,
      issuer_ok: v.issuer_ok,
      audience_ok: v.audience_ok,
      nonce_used,
      claims: v.claims,
      error: v.error ?? null,
    });
  } catch (e) {
    return jsonResponse({ error: String((e as Error).message ?? e) }, 500);
  }
});
