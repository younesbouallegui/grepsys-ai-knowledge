// Called by the Poulina AI Hub project to redeem a one-time SSO handoff code.
// Returns the underlying Zabbix token + user identity exactly once.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { zabbixRpc } from "../_shared/zabbix.ts";

async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf)).map((x) => x.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const { code } = await req.json();
    if (!code || typeof code !== "string") {
      return new Response(JSON.stringify({ error: "Missing code" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const code_hash = await sha256Hex(code);
    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: row, error } = await sb
      .from("sso_handoff_codes")
      .select("*")
      .eq("code_hash", code_hash)
      .maybeSingle();
    if (error) throw error;
    if (!row) {
      return new Response(JSON.stringify({ error: "Invalid code" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (row.used_at) {
      return new Response(JSON.stringify({ error: "Code already used" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (new Date(row.expires_at).getTime() < Date.now()) {
      return new Response(JSON.stringify({ error: "Code expired" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Mark used immediately to make this strictly one-time.
    await sb.from("sso_handoff_codes").update({ used_at: new Date().toISOString() }).eq("code_hash", code_hash);

    // Re-fetch fresh user info from Zabbix using the stored token.
    let zu: any = null;
    try {
      const users = await zabbixRpc(
        "user.get",
        { output: "extend", selectRole: "extend", selectUsrgrps: "extend", userids: [row.zabbix_userid] },
        row.zabbix_token,
      );
      zu = users?.[0] ?? null;
    } catch {
      // token may have expired between issue and redeem
    }
    if (!zu) {
      return new Response(JSON.stringify({ error: "Zabbix session expired" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(
      JSON.stringify({
        zabbix_token: row.zabbix_token,
        user: {
          userid: zu.userid,
          username: zu.username,
          name: zu.name ?? "",
          surname: zu.surname ?? "",
          email: zu.email ?? `${zu.userid}@zabbix.local`,
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
