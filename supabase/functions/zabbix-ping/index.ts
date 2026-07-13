import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { zabbixRpc } from "../_shared/zabbix.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const { zabbix_token } = await req.json();
    if (!zabbix_token) {
      return new Response(JSON.stringify({ valid: false }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    try {
      const result = await zabbixRpc("user.checkAuthentication", { sessionid: zabbix_token });
      return new Response(JSON.stringify({ valid: !!result }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    } catch {
      return new Response(JSON.stringify({ valid: false }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  } catch (e) {
    return new Response(JSON.stringify({ valid: false, error: String((e as Error).message ?? e) }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
