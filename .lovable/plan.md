# Knowledge ↔ Hub SSO (Zabbix-only identity)

Build a fully independent SSO bridge on the Knowledge side. No shared Supabase, no shared auth — only a signed token contract and shared `SSO_SIGNING_SECRET`.

## Shared SSO contract (must match Hub)

Signed JWT-like token (HS256) passed via `?code=<TOKEN>`:

```
Header:  { "alg": "HS256", "typ": "JWT" }
Payload: {
  "iss":  "poulina-hub" | "poulina-knowledge",
  "aud":  "poulina-knowledge" | "poulina-hub",
  "sub":  "<zabbix_user_id>",
  "username": "...",
  "display_name": "...",
  "roles": ["admin"|"editor"|"viewer"],
  "email": "...",
  "nonce": "<random 32 bytes hex>",
  "iat":  <unix>,
  "exp":  <iat + 120>
}
Signature: HMAC-SHA256(SSO_SIGNING_SECRET)
```

## Edge functions (Knowledge side)

1. `sso-accept` (POST, public) — receives `{ token }` from `/auth/sso` page.
   - Verify signature, `exp` (≤120s), `iss=poulina-hub`, `aud=poulina-knowledge`.
   - Enforce nonce uniqueness via `sso_nonces` table (insert; unique index → reject on conflict).
   - Upsert `profiles` from claims.
   - Issue a Knowledge session: signed HS256 app token (24h) returned to the SPA, stored in localStorage as the existing `zabbix_auth_session` shape (no Zabbix password required).
   - Returns `{ session, profile }`.

2. `sso-issue` (replace existing) — POST `{ knowledge_session_token }`.
   - Verify local session token, mint outbound SSO JWT with `iss=poulina-knowledge`, `aud=poulina-hub`.
   - Return `redirect_url = https://poulinaaihub.younesblg.com/auth/sso?code=<jwt>`.

3. `sso-health` (GET, public) — returns:
   ```json
   { "ok": true, "version": "<git sha or build id>",
     "signing_secret_present": true,
     "last_successful_exchange_at": "...",
     "nonce_store": "ok" }
   ```

4. `sso-diagnostics` (POST, public) — body `{ token }`:
   ```json
   { "signature_valid": bool, "expired": bool, "nonce_used": bool,
     "issuer_ok": bool, "audience_ok": bool, "claims": {...} }
   ```
   Never mutates nonce store.

All four also respond to `GET /health` with `{ ok: true, fn: "<name>" }`.

## Frontend (Knowledge)

- `src/pages/AuthSso.tsx` mounted at `/auth/sso`:
  - On mount, read `?code`, POST to `sso-accept`.
  - On success, store returned session, redirect to `/` (dashboard).
  - On failure, show inline error + "Return to Hub" link. No login form, no password.
- `src/contexts/AuthContext.tsx`:
  - Accept the SSO-minted session shape (same `StoredSession`) — keep Zabbix password login as fallback for direct Knowledge sign-in.
  - Add `signInFromSso(payload)` that persists the session.
- `src/components/HubSwitcher.tsx`:
  - Call new `sso-issue` with the stored session token (not raw zabbix token), then redirect.
- Add `src/pages/SsoDiagnostics.tsx` at `/admin/sso` (admin-only) showing live `sso-health` output and a token tester calling `sso-diagnostics`.

## Database

Migration adds:

```sql
create table public.sso_nonces (
  nonce text primary key,
  issuer text not null,
  audience text not null,
  consumed_at timestamptz not null default now(),
  expires_at timestamptz not null
);
create index on public.sso_nonces (expires_at);

create table public.sso_exchange_log (
  id uuid primary key default gen_random_uuid(),
  direction text not null,            -- 'inbound' | 'outbound'
  zabbix_user_id text,
  username text,
  succeeded boolean not null,
  error text,
  created_at timestamptz not null default now()
);
```

Both tables service_role only (no public grants — edge functions only).

## Secrets

Reuse existing `SSO_SIGNING_SECRET`. Verify it exists; if not, prompt to add.

## Verification

After deploy:
1. `curl sso-health` → 200 with `signing_secret_present: true`.
2. Mint a test token locally via `sso-diagnostics` flow and confirm all validations pass.
3. Walk the full Hub → Knowledge → Hub round trip in the live preview, confirming no login page and a stable Zabbix identity.

## Out of scope

- Hub-side code (separate Lovable account/Supabase).
- Replacing Zabbix password login on Knowledge — it stays as a direct-entry fallback.
