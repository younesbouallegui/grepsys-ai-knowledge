
create table if not exists public.sso_nonces (
  nonce text primary key,
  issuer text not null,
  audience text not null,
  consumed_at timestamptz not null default now(),
  expires_at timestamptz not null
);
create index if not exists sso_nonces_expires_at_idx on public.sso_nonces (expires_at);
grant all on public.sso_nonces to service_role;
alter table public.sso_nonces enable row level security;

create table if not exists public.sso_exchange_log (
  id uuid primary key default gen_random_uuid(),
  direction text not null check (direction in ('inbound','outbound')),
  zabbix_user_id text,
  username text,
  succeeded boolean not null,
  error text,
  created_at timestamptz not null default now()
);
create index if not exists sso_exchange_log_created_at_idx on public.sso_exchange_log (created_at desc);
grant all on public.sso_exchange_log to service_role;
alter table public.sso_exchange_log enable row level security;
