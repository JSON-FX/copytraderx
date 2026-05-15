-- Migration deliverable for the Supabase repo.
-- Suggested filename in the EA repo:
--   supabase/migrations/YYYYMMDDHHMMSS_create_user_preferences.sql
--
-- Pairs with the application changes on branch `feat/journal-redesign`.
-- Idempotent / additive — safe to apply before app code rolls out.

begin;

create table public.user_preferences (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  pnl_display text not null default 'percent'
              check (pnl_display in ('percent', 'dollar')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create or replace function public.touch_user_preferences_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger user_preferences_set_updated_at
  before update on public.user_preferences
  for each row execute function public.touch_user_preferences_updated_at();

alter table public.user_preferences enable row level security;

-- Self-select.
create policy user_preferences_select_self on public.user_preferences
  for select to authenticated
  using (auth.uid() = user_id);

-- Self-upsert (insert + update).
create policy user_preferences_insert_self on public.user_preferences
  for insert to authenticated
  with check (auth.uid() = user_id);

create policy user_preferences_update_self on public.user_preferences
  for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

commit;
