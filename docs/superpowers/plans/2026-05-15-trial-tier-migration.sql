-- Migration deliverable for the Supabase repo.
-- Suggested filename in the EA repo:
--   supabase/migrations/YYYYMMDDHHMMSS_create_trial_tier.sql
--
-- Pairs with the application changes on branch `feat/trial-tier`.
-- Ship the migration first (idempotent, additive), then the app code.

begin;

-- ── Enums ────────────────────────────────────────────────────────────────────
create type public.trial_lead_status as enum ('active', 'converted', 'abandoned');
create type public.trial_license_status as enum ('active', 'revoked');

-- ── Tables ───────────────────────────────────────────────────────────────────
create extension if not exists citext;

create table public.trial_leads (
  id                  bigserial primary key,
  email               citext       not null,
  telegram_handle     text         null,
  discord_handle      text         null,
  notes               text         null,
  status              public.trial_lead_status not null default 'active',
  converted_user_id   uuid         null references auth.users(id) on delete set null,
  created_at          timestamptz  not null default now(),
  created_by          uuid         null references auth.users(id)
);

create table public.trial_licenses (
  id                  bigserial primary key,
  trial_lead_id       bigint       not null references public.trial_leads(id) on delete cascade,
  product             text         not null,
  license_key         text         not null,
  mt5_account         bigint       not null,
  expires_at          timestamptz  not null,
  activated_at        timestamptz  null,
  last_validated_at   timestamptz  null,
  status              public.trial_license_status not null default 'active',
  broker_name         text         null,
  account_type        text         null check (account_type in ('demo','live','contest')),
  created_at          timestamptz  not null default now()
);

-- ── Dedupe indexes (hard-block) ──────────────────────────────────────────────
create unique index trial_leads_email_key
  on public.trial_leads (lower(email::text));
create unique index trial_leads_telegram_key
  on public.trial_leads (lower(telegram_handle))
  where telegram_handle is not null;
create unique index trial_leads_discord_key
  on public.trial_leads (lower(discord_handle))
  where discord_handle is not null;

create unique index trial_licenses_license_key_key
  on public.trial_licenses (license_key);
create unique index trial_licenses_mt5_account_key
  on public.trial_licenses (mt5_account);

-- Helper index for the validate function on the trial side.
create index trial_licenses_lookup_idx
  on public.trial_licenses (license_key, mt5_account);

-- ── RLS ──────────────────────────────────────────────────────────────────────
alter table public.trial_leads    enable row level security;
alter table public.trial_licenses enable row level security;

-- Admin-only direct access. The EA's anon key never touches these tables
-- directly; it calls validate_license() which runs as security definer.
create policy "trial_leads_admin_all" on public.trial_leads
  for all to authenticated
  using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
  with check ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

create policy "trial_licenses_admin_all" on public.trial_licenses
  for all to authenticated
  using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
  with check ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

-- ── Validate function (RPC) ──────────────────────────────────────────────────
-- Checks licenses first (hot path; preserves paid precedence during
-- conversion overlap), then falls back to trial_licenses. Returns a
-- unified row shape so EA result-parsing code stays uniform.
create or replace function public.validate_license(
  p_license_key text,
  p_mt5_account bigint
) returns table (
  source        text,
  id            bigint,
  product       text,
  license_key   text,
  mt5_account   bigint,
  status        text,
  expires_at    timestamptz,
  activated_at  timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
    select 'license'::text,
           l.id,
           l.product::text,
           l.license_key,
           l.mt5_account,
           l.status::text,
           l.expires_at,
           l.activated_at
    from public.licenses l
    where l.license_key = p_license_key
      and l.mt5_account = p_mt5_account
    limit 1;
  if found then return; end if;

  return query
    select 'trial'::text,
           t.id,
           t.product,
           t.license_key,
           t.mt5_account,
           case
             when t.status = 'revoked'   then 'revoked'
             when t.expires_at < now()   then 'expired'
             else 'active'
           end::text,
           t.expires_at,
           t.activated_at
    from public.trial_licenses t
    where t.license_key = p_license_key
      and t.mt5_account = p_mt5_account
    limit 1;
end;
$$;

grant execute on function public.validate_license(text, bigint) to anon, authenticated;

-- ── Stamp function (RPC) ─────────────────────────────────────────────────────
-- Called by EAs after a successful validate() to record activation +
-- last-seen + broker metadata. Branches by source so the EA does not need
-- to know which table the license came from.
create or replace function public.stamp_license_validated(
  p_source       text,
  p_id           bigint,
  p_broker_name  text,
  p_account_type text
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_source = 'license' then
    update public.licenses
       set last_validated_at = now(),
           activated_at      = coalesce(activated_at, now()),
           broker_name       = coalesce(p_broker_name, broker_name),
           account_type      = coalesce(p_account_type, account_type)
     where id = p_id;
  elsif p_source = 'trial' then
    update public.trial_licenses
       set last_validated_at = now(),
           activated_at      = coalesce(activated_at, now()),
           broker_name       = coalesce(p_broker_name, broker_name),
           account_type      = coalesce(p_account_type, account_type)
     where id = p_id;
  else
    raise exception 'unknown source: %', p_source;
  end if;
end;
$$;

grant execute on function public.stamp_license_validated(text, bigint, text, text) to anon, authenticated;

commit;
