// Admin proxy: lets platform admins create/update/disable Zabbix users.
// Authorization: caller must present a valid Zabbix session token whose user
// has Super Admin role (roleid 3). All writes go through the server-side
// ZABBIX_ADMIN_TOKEN so we never trust the client to call user.create directly.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { zabbixRpc } from "../_shared/zabbix.ts";

const ADMIN_TOKEN = Deno.env.get("ZABBIX_ADMIN_TOKEN")!;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const { zabbix_token, action, payload } = await req.json();
    if (!zabbix_token || !action) {
      return new Response(JSON.stringify({ error: "Missing zabbix_token or action" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verify caller identity + role via their own token
    let me: any;
    try {
      const users = await zabbixRpc("user.get", { output: ["userid", "roleid", "username"] }, zabbix_token);
      me = users?.[0];
    } catch {
      return new Response(JSON.stringify({ error: "Invalid session" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!me || String(me.roleid) !== "3") {
      return new Response(JSON.stringify({ error: "Forbidden: admin only" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let result: unknown;
    switch (action) {
      case "create":
        result = await zabbixRpc("user.create", payload, ADMIN_TOKEN);
        break;
      case "update":
        result = await zabbixRpc("user.update", payload, ADMIN_TOKEN);
        break;
      case "disable":
        // Zabbix disables a user by moving them to a disabled user group;
        // simplest portable approach is user.update with usrgrps containing
        // only the "Disabled" group (caller passes its groupid).
        result = await zabbixRpc("user.update", payload, ADMIN_TOKEN);
        break;
      case "set_groups":
        result = await zabbixRpc("user.update", payload, ADMIN_TOKEN);
        break;
      case "set_role":
        result = await zabbixRpc("user.update", payload, ADMIN_TOKEN);
        break;
      case "list":
        result = await zabbixRpc(
          "user.get",
          { output: "extend", selectRole: "extend", selectUsrgrps: "extend", ...(payload ?? {}) },
          ADMIN_TOKEN,
        );
        break;
      default:
        return new Response(JSON.stringify({ error: `Unknown action: ${action}` }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }

    return new Response(JSON.stringify({ result }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: String((e as Error).message ?? e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
