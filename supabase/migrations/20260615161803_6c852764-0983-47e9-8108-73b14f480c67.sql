-- 1) Extend profiles with Zabbix mirror columns
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS zabbix_userid text UNIQUE,
  ADD COLUMN IF NOT EXISTS zabbix_username text,
  ADD COLUMN IF NOT EXISTS zabbix_role_id text,
  ADD COLUMN IF NOT EXISTS zabbix_groups jsonb,
  ADD COLUMN IF NOT EXISTS zabbix_email text,
  ADD COLUMN IF NOT EXISTS zabbix_name text,
  ADD COLUMN IF NOT EXISTS zabbix_surname text;

CREATE INDEX IF NOT EXISTS profiles_zabbix_userid_idx ON public.profiles(zabbix_userid);

-- 2) SSO handoff codes (server-only; redeemed by sibling Hub project via edge function)
CREATE TABLE public.sso_handoff_codes (
  code_hash text PRIMARY KEY,
  user_id uuid NOT NULL,
  zabbix_userid text NOT NULL,
  zabbix_username text,
  zabbix_token text NOT NULL,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Service-role only. No grants to anon/authenticated — only edge functions touch this.
GRANT ALL ON public.sso_handoff_codes TO service_role;

ALTER TABLE public.sso_handoff_codes ENABLE ROW LEVEL SECURITY;

-- Deny-all policy for non-service roles (RLS on with no policies = no access for anon/auth)
CREATE POLICY "service role only" ON public.sso_handoff_codes
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE INDEX sso_handoff_codes_expires_idx ON public.sso_handoff_codes(expires_at);