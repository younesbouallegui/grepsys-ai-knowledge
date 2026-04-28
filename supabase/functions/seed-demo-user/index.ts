// Dev seeder: creates a demo admin user you can log in with.
// Call once from the browser console or a button. No auth required.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.58.0";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });

  try {
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const body = await req.json().catch(() => ({}));
    const email = body.email ?? "admin@poulina.local";
    const password = body.password ?? "poulina2026";
    const displayName = body.displayName ?? "Poulina Admin";
    const role = body.role ?? "admin";

    // Create or fetch user (email_confirm = true so they can log in immediately)
    let userId: string | null = null;
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { display_name: displayName, preferred_language: "en" },
    });

    if (createErr) {
      // If already exists, look it up
      const { data: list } = await admin.auth.admin.listUsers();
      const existing = list?.users.find((u) => u.email === email);
      if (!existing) throw createErr;
      userId = existing.id;
      // Reset password so caller-provided password works
      await admin.auth.admin.updateUserById(existing.id, { password });
    } else {
      userId = created.user!.id;
    }

    // Ensure profile + role exist (in case trigger isn't installed)
    await admin.from("profiles").upsert({
      id: userId!,
      display_name: displayName,
      preferred_language: "en",
    });

    await admin.from("user_roles").upsert(
      { user_id: userId!, role },
      { onConflict: "user_id,role" },
    );

    return new Response(
      JSON.stringify({
        ok: true,
        message: "Demo user ready. You can now sign in.",
        credentials: { email, password },
      }),
      { headers: { ...cors, "Content-Type": "application/json" } },
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ ok: false, error: e instanceof Error ? e.message : String(e) }),
      { status: 500, headers: { ...cors, "Content-Type": "application/json" } },
    );
  }
});
