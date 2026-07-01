// Read-only token inspector. Does NOT consume nonces.
import { createClient } from "npm:@supabase/supabase-js@2";
import {
  AUDIENCE_KNOWLEDGE,
  ISSUER_HUB,
  jsonResponse,
  ssoCorsHeaders,
  SSO_VERSION,
  verifyJwt,
} from "../_shared/sso.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: ssoCorsHeaders(req) });
  const url = new URL(req.url);
  if (req.method === "GET" && url.pathname.endsWith("/health")) {
    return jsonResponse({ ok: true, fn: "sso-diagnostics", version: SSO_VERSION }, 200, req);
  }
  try {
    const { code, token, expected_issuer, expected_audience } = await req.json();
    const ssoCode = code ?? token;
    if (!ssoCode) return jsonResponse({ error: "Missing SSO code" }, 400, req);

    const v = await verifyJwt(ssoCode, {
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
    }, 200, req);
  } catch (e) {
    return jsonResponse({ error: String((e as Error).message ?? e) }, 500, req);
  }
});
