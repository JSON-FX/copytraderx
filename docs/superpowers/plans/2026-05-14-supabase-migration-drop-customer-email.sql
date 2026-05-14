-- Migration deliverable for the Supabase repo.
-- Suggested filename in the Supabase repo:
--   supabase/migrations/YYYYMMDDHHMMSS_drop_license_customer_email.sql
--
-- Pairs with the application changes on branch `feat/admin-subscriptions-page`
-- (Tasks 1-12). Deploy together: ship the app code + run this migration in the
-- same release so neither side references a column the other has removed.

begin;

-- Pre-flight: confirm orphan count before deletion.
-- Run this as a separate query in staging first; expected: a small number (0-3).
--
--   select count(*) from public.licenses
--   where user_id is null and subscription_id is null;

-- Delete pre-users-era orphan licenses (rows with no owner path at all).
-- Half-orphans (one of user_id / subscription_id null) are retained for forensics.
delete from public.licenses
where user_id is null
  and subscription_id is null;

-- Drop the legacy column.
alter table public.licenses
  drop column customer_email;

commit;
