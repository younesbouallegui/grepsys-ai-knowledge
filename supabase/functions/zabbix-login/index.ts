import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { AUDIENCE_KNOWLEDGE_APP, ISSUER_KNOWLEDGE, signJwt } from "../_shared/sso.ts";
import { zabbixRpc, mapZabbixRole, zabbixUserIdToUuid } from "../_shared/zabbix.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { username, password } = await req.json();
    if (!username || !password) {
      return new Response(JSON.stringify({ error: "Username and password required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 1) Authenticate against Zabbix
    let zabbixToken: string;
    try {
      zabbixToken = await zabbixRpc("user.login", { username, password });
    } catch (e) {
      const msg = String((e as Error).message ?? e);
      console.error("Zabbix login failed", msg);
      // Surface configuration errors clearly; only mask true credential errors.
      const isCredError = /login|password|incorrect|permission/i.test(msg) &&
        !/non-JSON|ZABBIX_API_URL/i.test(msg);
      return new Response(
        JSON.stringify({
          error: isCredError
            ? "Invalid username or password. Please check your Zabbix credentials."
            : `Zabbix configuration error: ${msg}`,
        }),
        { status: isCredError ? 401 : 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // 2) Fetch user profile (with role + groups)
    const users = await zabbixRpc(
      "user.get",
      { output: "extend", selectRole: "extend", selectUsrgrps: "extend", filter: { username: [username] } },
      zabbixToken,
    );
    const zu = users?.[0];
    if (!zu) {
      return new Response(JSON.stringify({ error: "User not found in Zabbix" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const platformUserId = await zabbixUserIdToUuid(zu.userid);
    const role = mapZabbixRole(zu.roleid);
    const email = zu.email || `${zu.userid}@zabbix.local`;
    const displayName = [zu.name, zu.surname].filter(Boolean).join(" ").trim() || zu.username;

    // 3) Mirror into profiles + user_roles (best effort)
    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    await sb.from("profiles").upsert(
      {
        id: platformUserId,
        display_name: displayName,
        zabbix_userid: String(zu.userid),
        zabbix_username: zu.username,
        zabbix_role_id: String(zu.roleid ?? ""),
        zabbix_groups: zu.usrgrps ?? [],
        zabbix_email: email,
        zabbix_name: zu.name ?? null,
        zabbix_surname: zu.surname ?? null,
      },
      { onConflict: "id" },
    );

    // role rows: keep one row per role; ensure mapped role exists
    await sb.from("user_roles").upsert(
      { user_id: platformUserId, role },
      { onConflict: "user_id,role" },
    );

    const now = Math.floor(Date.now() / 1000);
    const sessionToken = await signJwt({
      iss: ISSUER_KNOWLEDGE,
      aud: AUDIENCE_KNOWLEDGE_APP,
      sub: String(zu.userid),
      username: zu.username,
      display_name: displayName,
      email,
      roles: [role],
      platform_user_id: platformUserId,
      iat: now,
      exp: now + 60 * 60 * 24,
    });

    return new Response(
      JSON.stringify({
        zabbix_token: zabbixToken,
        session_token: sessionToken,
        platform_user_id: platformUserId,
        role,
        user: {
          userid: zu.userid,
          username: zu.username,
          name: zu.name ?? "",
          surname: zu.surname ?? "",
          email,
          roleid: String(zu.roleid ?? ""),
          usrgrps: zu.usrgrps ?? [],
        },
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: String((e as Error).message ?? e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
