# Zabbix Auth Migration + Seamless Hub Handoff

## Goals
- Sign-in uses only Zabbix username/password.
- No more Supabase email/password or Google sign-in on the UI.
- Existing app data (documents, quizzes, chats, roles) keeps working via a profile row keyed to the Zabbix `userid`.
- A "Go to Poulina AI Hub" button switches platforms without re-login, using a short-lived one-time code (no raw Zabbix token in the URL).

## What changes for the user
- Login screen: only Username + Password + Sign In. Error message references Zabbix credentials.
- Top bar everywhere: a "Poulina AI Hub ↗" switcher button with hover tooltip "Switch to AI Hub — stay logged in".
- Session expires when the Zabbix token expires; user is sent back to login with a clear message. Background ping every 10 minutes keeps the session validated.
- Admin user CRUD (create / edit / disable / assign group / assign role) writes through to Zabbix.

## Architecture (technical section)

### Secrets (server-only)
- `ZABBIX_API_URL` = `https://zabbix.younesblg.com/api_jsonrpc.php`
- `ZABBIX_ADMIN_TOKEN` = rotated Zabbix admin API token (used only for admin actions like `user.create`/`user.update` and SSO code validation lookups)
- `SSO_SIGNING_SECRET` = random 32-byte secret for HMAC-signing the handoff code (auto-generated, shared with the Hub project later)

### New edge functions (all CORS-enabled, `verify_jwt = false` in code)
1. `zabbix-login` — `POST { username, password }`
   - Calls Zabbix `user.login` server-side.
   - On success: calls `user.get` to fetch profile/role/groups.
   - Upserts a row in `public.profiles` keyed by `zabbix_userid`; ensures a matching `auth.users` row exists (created via service-role admin API with a random unguessable password and email `<userid>@zabbix.local`); writes role into `public.user_roles` mapped from Zabbix role.
   - Mints a Supabase session for that user (admin `generateLink` → exchange, or `admin.createSession`) and returns `{ access_token, refresh_token, zabbix_token, zabbix_token_expiry, user }` to the browser.
   - The browser calls `supabase.auth.setSession(...)` so existing RLS keeps working unchanged.

2. `zabbix-ping` — `POST { zabbix_token }`
   - Calls Zabbix `user.checkAuthentication`. Returns `{ valid: boolean }`.
   - Called from the client every 10 minutes; on `false` we sign out and redirect to login.

3. `sso-issue` — `POST` (requires logged-in Supabase JWT)
   - Generates a 32-byte random `code`, stores `{ code_hash, zabbix_userid, zabbix_token, expires_at = now()+60s, used=false }` in a new `public.sso_handoff_codes` table.
   - Returns `{ code, redirect_url: "https://poulinaaihub.younesblg.com/auth/sso?code=..." }`.
   - The browser does `window.location.href = redirect_url`. The Zabbix token never appears in the URL.

4. `sso-redeem` — `POST { code }` (will be called by the Hub project later)
   - Looks up the code, checks not expired and not used, marks used, returns the Zabbix token + user info so the Hub can mint its own session.
   - (We build this now so the Hub side can integrate later without touching this project again.)

5. `zabbix-admin-users` — `POST { action, payload }` (admin only)
   - Action one of `create | update | disable | set_groups | set_role`. Proxies to Zabbix `user.create` / `user.update` using `ZABBIX_ADMIN_TOKEN`.
   - Verifies caller is platform admin via `has_role(auth.uid(), 'admin')`.

### Database migration
- `profiles`: add `zabbix_userid text unique`, `zabbix_username text`, `zabbix_role_id text`, `zabbix_groups jsonb`. Existing rows stay.
- New table `public.sso_handoff_codes` with `code_hash text primary key`, `user_id uuid`, `zabbix_userid text`, `zabbix_token text`, `expires_at timestamptz`, `used_at timestamptz`. Service-role only (no anon/auth grants, no policies for end users).
- `user_roles`: no schema change. Role mapping done in `zabbix-login`:
  - Zabbix Super Admin (roleid 3) → `admin`
  - Zabbix Admin (roleid 2) → `editor` (closest existing app_role; will rename if you want)
  - Zabbix User (roleid 1) → `viewer`

### Frontend changes
- `src/pages/Auth.tsx`: replace entire form with username + password only; on submit call `zabbix-login` edge function, then `supabase.auth.setSession`. Remove Google button and signup tab.
- `src/contexts/AuthContext.tsx`: add `zabbixToken`, `zabbixUser`, `signOut()` clears both. Add 10-minute `zabbix-ping` interval.
- New `src/components/HubSwitcher.tsx`: button in top bar; on click calls `sso-issue` and navigates to returned URL. Shows tooltip and external-link icon.
- Mount `HubSwitcher` in `src/components/AppLayout.tsx` top bar.
- Reset password page / forgot password: removed (Zabbix owns credentials).

### Future compatibility
- All Zabbix calls live inside `zabbix-login` / `zabbix-ping` / `zabbix-admin-users`. Swapping Zabbix for LDAP/SAML/OIDC later means changing only those three functions; the frontend, profile mirror, and SSO handoff stay the same.

## Step order
1. You rotate the Zabbix admin token and paste the new one in the secrets prompt I'll send.
2. Run the migration (profiles columns + sso_handoff_codes table).
3. Create the 5 edge functions + `SSO_SIGNING_SECRET` secret.
4. Rewrite `Auth.tsx`, update `AuthContext.tsx`, add `HubSwitcher`.
5. Replace user-admin UI calls in `src/pages/Admin.tsx` with `zabbix-admin-users`.
6. Smoke test: login → dashboard → click Hub button → confirm `/auth/sso?code=…` URL is generated (Hub-side receiver comes later in the Hub project).

## Out of scope (confirmed)
- Building `/auth/sso` receiver on the Hub — you'll ask me to do that in the Hub project later. `sso-redeem` is ready for it.
- Migrating existing Supabase-only users — they will need to log in fresh via Zabbix; their old `auth.users` rows are orphaned until a matching Zabbix login creates the link, at which point we can optionally merge by email.

Reply "go" to start, or tell me what to change.