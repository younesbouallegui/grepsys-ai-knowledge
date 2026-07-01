// Inbound SSO: Hub → Knowledge. Verifies a signed token, consumes its nonce,
// upserts the local profile, and mints a Knowledge app-session JWT.
import { createClient } from "npm:@supabase/supabase-js@2";
import {
  AUDIENCE_KNOWLEDGE,
  AUDIENCE_KNOWLEDGE_APP,
  ISSUER_HUB,
  ISSUER_KNOWLEDGE,
  jsonResponse,
  signJwt,
  ssoCors,
  SSO_VERSION,
  verifyJwt,
  ssoCorsHeaders,
} from "../_shared/sso.ts";
import { mapZabbixRole, zabbixUserIdToUuid } from "../_shared/zabbix.ts";

function admin() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: ssoCorsHeaders(req) });
  const url = new URL(req.url);
  if (req.method === "GET" && url.pathname.endsWith("/health")) {
    return jsonResponse({ ok: true, fn: "sso-accept", version: SSO_VERSION }, 200, req);
  }

  try {
    const { code, token } = await req.json();
    const ssoCode = code ?? token;
    if (!ssoCode || typeof ssoCode !== "string") {
      return jsonResponse({ error: "Missing SSO code" }, 400, req);
    }

    const v = await verifyJwt(ssoCode, {
      expectedIssuer: ISSUER_HUB,
      expectedAudience: AUDIENCE_KNOWLEDGE,
      maxAgeSec: 120,
    });
    if (!v.signature_valid || v.expired || !v.issuer_ok || !v.audience_ok || !v.claims) {
      await admin().from("sso_exchange_log").insert({
        direction: "inbound",
        succeeded: false,
        error: v.error ?? JSON.stringify({
          sig: v.signature_valid, exp: v.expired, iss: v.issuer_ok, aud: v.audience_ok,
        }),
      });
      return jsonResponse({ error: "Invalid SSO code", detail: v }, 401, req);
    }

    const c = v.claims;
    const sb = admin();

    // Nonce uniqueness — single-use, 5 min retention beyond exp.
    const { error: nonceErr } = await sb.from("sso_nonces").insert({
      nonce: c.nonce,
      issuer: c.iss,
      audience: c.aud,
      expires_at: new Date((c.exp + 300) * 1000).toISOString(),
    });
    if (nonceErr) {
      await sb.from("sso_exchange_log").insert({
        direction: "inbound",
        zabbix_user_id: c.sub,
        username: c.username,
        succeeded: false,
        error: `nonce_replay: ${nonceErr.message}`,
      });
      return jsonResponse({ error: "SSO code already used" }, 409, req);
    }

    // Upsert local profile (local mirror only; not an auth source).
    const platformUserId = await zabbixUserIdToUuid(c.sub);
    await sb.from("profiles").upsert(
      {
        id: platformUserId,
        display_name: c.display_name || c.username,
        zabbix_userid: String(c.sub),
        zabbix_username: c.username,
        zabbix_email: c.email ?? null,
      },
      { onConflict: "id" },
    );
    const role = c.roles?.[0] ?? mapZabbixRole(undefined);
    await sb.from("user_roles").upsert(
      { user_id: platformUserId, role },
      { onConflict: "user_id,role" },
    );

    // Mint local app session token (24h).
    const now = Math.floor(Date.now() / 1000);
    const sessionToken = await signJwt({
      iss: ISSUER_KNOWLEDGE,
      aud: AUDIENCE_KNOWLEDGE_APP,
      sub: c.sub,
      username: c.username,
      display_name: c.display_name,
      email: c.email,
      roles: c.roles ?? [role],
      platform_user_id: platformUserId,
      iat: now,
      exp: now + 60 * 60 * 24,
    });

    await sb.from("sso_exchange_log").insert({
      direction: "inbound",
      zabbix_user_id: c.sub,
      username: c.username,
      succeeded: true,
    });

    return jsonResponse({
      session_token: sessionToken,
      user: {
        userid: c.sub,
        username: c.username,
        name: c.display_name,
        surname: "",
        email: c.email ?? `${c.sub}@zabbix.local`,
        roleid: "",
        usrgrps: [],
      },
      platform_user_id: platformUserId,
      role,
      display_name: c.display_name || c.username,
    }, 200, req);
  } catch (e) {
    console.error(e);
    return jsonResponse({ error: String((e as Error).message ?? e) }, 500, req);
  }
});
