# Admin / Client Roles Design

- **Date:** 2026-05-06
- **Branch:** `feat/admin-client-roles`
- **Status:** Draft for review

## Amendments

- **2026-05-06 — Multi-product support added.** Originally the spec assumed Impulse-only licenses. The codebase already has multi-EA awareness on the journal side (`EaSource` enum in `lib/types.ts`), but the `licenses` table did not carry a product dimension and the license-key prefix was hardcoded `IMPX-`. This amendment introduces a `product` column on `subscriptions` and `licenses`, per-product license-key prefixes, and a product picker in the Request New License modal. See §3.5 (new) and references throughout §5–§6.

## 1. Problem

CopyTraderX-License is currently a single-admin tool with no authentication. Every visitor implicitly has full control: create licenses, edit any license, see every account's journal. To deploy this beyond a single operator we need:

- Real authentication.
- Two roles — **Administrator** and **User** — with different capabilities.
- A model that maps to how subscriptions are actually sold (paid out-of-band; admin provisions accounts manually).
- Strict scoping of journal data so a user can only see their own accounts.

## 2. Goals

- Add Supabase-Auth-backed login with email + password.
- Admin can create users, see all licenses, see all journals, manage propfirm rules, and approve/reject license requests.
- Each new paid subscription entitles the user to **one live license + one demo license** as a bundle, **for one specific product** (Impulse, CTX-Core, CTX-Live, CTX-Prop-Passer, or CTX-Prop-Funded).
- User can self-serve **claim** their slot(s) by entering an MT5 account number, and can view the journal for accounts they own — and only those.
- User can request additional license bundles for any supported product; admin approves or rejects.
- Existing license-row contract with the EA (`license_key`, `mt5_account`, `tier`, `expires_at`, `status`, `account_type`) is preserved; a new `product` column is added that the EA can read to verify it's the intended product for that license.
- Default seed admin (`help.copytraderx@gmail.com`) is provisioned automatically at first deploy.

## 3. Non-Goals (v1)

- Public self-signup (admin creates all users).
- Two-factor auth.
- Audit log beyond `created_by` / `approved_by` columns.
- In-app payment processing (handled out-of-band on another platform).
- Bulk user import.
- Self-service tier upgrades or proration.
- E2E tests in CI (run locally for v1).
- Multi-org / team accounts.
- "Forgot password" — already provided by Supabase Auth, no custom design.

## 3.5 Products / EAs

The system supports multiple Expert Advisors as distinct **products**. Each license is scoped to exactly one product. A single MT5 account may hold multiple licenses if and only if each license is for a different product (e.g., one Impulse license + one CTX-Live license on the same account is allowed).

Canonical product codes (matches existing `EaSource` enum in `lib/types.ts`):

| Code | Display name | License-key prefix |
|---|---|---|
| `impulse` | Impulse | `IMPX-` |
| `ctx-core` | CTX Core | `CTXC-` |
| `ctx-live` | CTX Live | `CTXL-` |
| `ctx-prop-passer` | CTX Prop Passer | `CTXP-` |
| `ctx-prop-funded` | CTX Prop Funded | `CTXF-` |

Each product gets a unique 4-character license-key prefix so keys are visually self-identifying. The license-key generator takes a `product` argument (`generateLicenseKey(product)`) and returns the matching prefix. The validation regex becomes a per-product map; the EA validates that the prefix it received matches the product it ships as.

Adding a new product later = a single config addition (DB enum/check value + a row in the prefix map + per-product rendering). No schema migration beyond extending the check constraint.

## 4. Architecture

### 4.1 Route layout (Next.js App Router)

Three route trees, separated by real path segment so middleware rules are unambiguous:

- `/login`, `/auth/change-password` — public.
- `/admin/*` — admin only. Existing pages move here:
  - `/admin/licenses` (the licenses dashboard, now with a Pending Requests panel)
  - `/admin/licenses/new`, `/admin/licenses/[id]`
  - `/admin/users`, `/admin/users/new`, `/admin/users/[id]`
  - `/admin/propfirm-rules`, `/admin/propfirm-rules/new`, `/admin/propfirm-rules/[id]`
  - `/admin/settings`
- `/dashboard/*` — user only.
  - `/dashboard` — subscriptions + slots
  - `/dashboard/licenses/[id]` — journal scoped to one license

`/` redirects by role: admin → `/admin/licenses`, user → `/dashboard`, anonymous → `/login`.

### 4.2 Three-layer enforcement

1. **Middleware** (`middleware.ts`) — checks Supabase session, reads role from JWT custom claim (`app_metadata.role`), routes the request: anonymous → `/login`, mismatched role → role's home page. No DB query per request.
2. **Server-side route guards** — every Server Component and API route under `/admin/*` calls `requireAdmin(session)`; every route under `/dashboard/*` calls `requireUser(session)` and filters all queries by `user_id`. The role is re-read from the session, not trusted from the JWT alone.
3. **RLS policies** — final safety net on `users`, `subscriptions`, `licenses`, and journal tables. Service role bypasses RLS for server-rendered pages (current model). RLS is the safety net for any future direct-from-browser queries; not the primary enforcement in v1.

### 4.3 Email

- Supabase Auth handles its own emails (welcome with temp password, password reset).
- Application-triggered emails (request submitted, request approved, request rejected) go through `lib/email.ts`, which wraps Supabase's built-in SMTP. The wrapper makes it trivial to swap to Resend/Postmark later.
- Email failures are logged but do not block the underlying DB transaction. Each email-bearing row gets a `notification_sent_at` column where useful, so the admin can see whether delivery succeeded and resend if needed.

## 5. Data Model

### 5.1 New table: `public.users`

Application-level projection of `auth.users`. We do not duplicate credentials.

```sql
create table public.users (
  id                    uuid primary key references auth.users(id) on delete cascade,
  email                 text not null unique,
  role                  text not null default 'user' check (role in ('admin', 'user')),
  full_name             text,
  must_change_password  boolean not null default true,
  created_at            timestamptz not null default now(),
  created_by            uuid references public.users(id)
);
```

A trigger on `auth.users` insert mirrors a row here. A second trigger keeps `auth.users.app_metadata.role` synchronized with `public.users.role` so middleware can read role from the JWT.

### 5.2 New table: `public.subscriptions`

One row = one paid bundle = entitles the user to one live license + one demo license **for one product**.

```sql
create table public.subscriptions (
  id                bigserial primary key,
  user_id           uuid not null references public.users(id) on delete cascade,
  product           text not null check (product in (
                       'impulse', 'ctx-core', 'ctx-live',
                       'ctx-prop-passer', 'ctx-prop-funded'
                    )),
  tier              text not null check (tier in ('monthly', 'quarterly', 'yearly')),
  status            text not null check (status in ('pending', 'active', 'rejected', 'expired', 'revoked')),
  requested_at      timestamptz not null default now(),
  approved_at       timestamptz,
  approved_by       uuid references public.users(id),
  expires_at        timestamptz,
  rejection_reason  text,
  notes             text,
  created_at        timestamptz not null default now()
);

create index idx_subscriptions_user on public.subscriptions(user_id, status);
create index idx_subscriptions_pending on public.subscriptions(status) where status = 'pending';
create index idx_subscriptions_user_product on public.subscriptions(user_id, product, status);
```

A `pending` row IS the request; on approval it flips to `active` with `approved_at = now()` and `expires_at = approved_at + tier_duration`. Revoke and natural expiry also operate at the subscription level and cascade to child licenses via trigger.

The `product` is chosen by the user when they request a new license (mandatory field in the Request modal, see §6.4). On renewal the product is **inherited from the source subscription** and is shown read-only in the Renew modal (see §6.6).

### 5.3 Modified table: `public.licenses`

```sql
alter table public.licenses
  add column subscription_id bigint references public.subscriptions(id) on delete cascade,
  add column user_id         uuid   references public.users(id),
  add column product         text   check (product in (
                                'impulse', 'ctx-core', 'ctx-live',
                                'ctx-prop-passer', 'ctx-prop-funded'
                             ));

-- Drop the old single-column unique on mt5_account (one EA per account) and
-- replace it with (mt5_account, product). One MT5 account may now hold one
-- license per product simultaneously.
alter table public.licenses drop constraint if exists licenses_mt5_account_key;
create unique index idx_licenses_mt5_product on public.licenses (mt5_account, product)
  where product is not null;

create unique index idx_licenses_one_per_slot
  on public.licenses (subscription_id, intended_account_type)
  where subscription_id is not null;

create index idx_licenses_user on public.licenses(user_id);
create index idx_licenses_product on public.licenses(product);
```

`subscription_id`, `user_id`, and `product` are nullable during the migration window only. After the backfill (see §10), all three flip to NOT NULL. Every backfilled legacy row is assigned `product='impulse'` because that's what the existing system was implicitly licensing.

`tier`, `expires_at`, and `product` live on the license row because the EA reads them directly. On license creation, `product` is copied from the parent subscription (which is bound to one product) and `tier`/`expires_at` are also copied. The subscription remains the source of truth for status; the trigger described in §5.5 keeps child licenses in sync when the subscription's status changes.

The license-key prefix encodes the product: a license with `product='ctx-live'` has a key shaped `CTXL-XXXX-XXXX-XXXX-XXXX`. See §3.5 for the prefix table.

### 5.4 Quota is derived, not stored

A user's quota = `count(subscriptions where user_id = U and status = 'active')` for live, and the same for demo. There is no `live_slots_total` / `demo_slots_total` column. The unique index `(subscription_id, intended_account_type)` guarantees at most one live + one demo license per subscription.

### 5.5 Subscription-status cascade trigger

When `subscriptions.status` changes to `expired`, `revoked`, or `rejected`, a trigger sets all child `licenses.status` to the same value. The EA already treats non-`active` licenses as deactivated, so behavior is automatic.

### 5.6 RLS policies (sketch)

| Table | User | Admin |
|---|---|---|
| `users` | select own row | select all, insert/update/delete |
| `subscriptions` | select own; insert with `status='pending'` and `user_id = self`; delete own where `status='pending'` | full |
| `licenses` | select own; insert (claim) where `subscription.user_id = self` and `subscription.status='active'` and no existing license for that `(subscription_id, intended_account_type)` pair | full |
| `positions`, `deals`, `orders`, `account_snapshots_*` | select where `mt5_account` is in `(select mt5_account from licenses where user_id = self)` | full |
| `propfirm_rules` | none | full |

Service role keeps bypassing RLS for the server-rendered current flow.

## 6. User Flows

### 6.1 Admin creates a user

1. Admin → `/admin/users/new`. Form fields: `email`, `full_name`, optional initial subscription (tier picker).
2. Submit → server route:
   - Calls Supabase Auth admin API to create `auth.users` with a generated 12-char temp password and `app_metadata.role = 'user'`.
   - Trigger inserts `public.users` row with `must_change_password = true`.
   - If admin chose to issue an initial subscription, inserts a `subscriptions` row with `status='active'`, `approved_at = now()`, `expires_at = now() + tier_duration`.
   - Sends welcome email with temp password and login URL.
3. New user appears in `/admin/users`.

### 6.2 First login + forced password change

1. User clicks the link in the welcome email → `/login`.
2. Logs in → middleware sees `must_change_password=true` → redirects to `/auth/change-password`.
3. User sets new password → server flips the flag to `false` → redirects to `/dashboard`.

### 6.3 User dashboard and claiming a slot

1. `/dashboard` lists the user's **active subscriptions**. Each subscription card shows the product name (e.g. "CTX Live — Monthly"), the expiry, and two slots: Live and Demo. Each slot is either:
   - **Empty** — "Add MT5 account" button.
   - **Claimed** — MT5 number, status badge, "Open journal" link.
2. Clicking "Add MT5 account" → modal with one field (MT5 number). The product is shown read-only at the top of the modal so the user knows which product they're claiming the slot for.
3. Submit → server validates (positive int; not already in use **for this product**: an MT5 number can hold one license per product, so the uniqueness check is `(mt5_account, product)`), inserts a `licenses` row with `subscription_id`, `user_id`, `product` (copied from the subscription), `intended_account_type`, `tier` and `expires_at` (copied from the subscription), auto-generated `license_key` using the product's prefix, `status='active'`.
4. The unique index `(subscription_id, intended_account_type)` prevents double-claim of a slot. The unique index `(mt5_account, product)` prevents double-issuing a license for the same product to the same MT5 account.
5. "Open journal" → `/dashboard/licenses/[id]` — existing journal UI scoped to that license's MT5 account. (Journal data is per-MT5-account but EA-tagged via `ea_source`, so journal pages can show all activity on the account regardless of which license is being viewed; that's an existing behavior and not changed by this work.)

### 6.4 User requests a new license bundle

1. On `/dashboard`, "Request New License" → modal with two pickers and an optional notes field:
   - **Product** (mandatory): dropdown of the 5 supported products (Impulse, CTX Core, CTX Live, CTX Prop Passer, CTX Prop Funded).
   - **Tier** (mandatory): monthly / quarterly / yearly.
   - **Notes** (optional): free-text passed to the admin (e.g. "renewing my prop firm challenge").
2. Submit → inserts a `subscriptions` row with `status='pending'`, the chosen `product`, the chosen `tier` (no `approved_at` / `expires_at`).
3. `lib/email.ts` sends notification email to admin: "New license request from `<user>` — product: `<product>`, tier: `<tier>`."
4. User dashboard shows the pending request with a "Pending approval" badge that includes the product and tier, plus a **Cancel request** button (deletes the row while still pending; no admin action required).

### 6.5 Admin approves or rejects a request

1. `/admin/licenses` shows the licenses table with a **Pending Requests** panel beside it (responsive: stacks below on small screens). Each request shows user, tier, requested_at, notes, plus Approve / Reject buttons.
2. **Approve** → server flips `status='active'`, sets `approved_at = now()`, `expires_at = approved_at + tier_duration`, `approved_by = <admin>`. Email to user: "Your `<tier>` license has been approved."
3. **Reject** → modal asks for `rejection_reason` → server flips `status='rejected'`, stores reason, emails user.
4. After approval, the user's dashboard shows the new active subscription with two empty slots ready to claim.

### 6.6 Subscription expiry, revoke, and renewal

- **Natural expiry** — a daily cron (Supabase scheduled function) flips `subscriptions.status` from `active` to `expired` when `now() > expires_at`. The trigger from §5.5 cascades to child licenses.
- **Admin revoke** — admin clicks Revoke on an active subscription → confirmation dialog → server flips `status='revoked'`. Trigger cascades.
- **Renewal** — when a subscription is expired, the user sees an "Expired — please renew" banner on the dashboard and a **Renew** button on that subscription card. Renew opens the Request New License modal with the **product field locked** to the source subscription's product (rendered read-only / disabled in the UI; the server also rejects any attempt to change it) and the tier pre-filled with the previous tier (the user may change the tier). Submit creates a **new** pending subscription with the inherited product. The expired one stays as immutable history. On approval, the user has a fresh active subscription with two empty slots for that product.
- Expired subscriptions and their licenses remain visible on the dashboard with read-only journal access.

## 7. Default Admin Seed

Email is fixed to `help.copytraderx@gmail.com`; password is read from `.env` as `INITIAL_ADMIN_PASSWORD` and never committed.

A one-shot script `scripts/seed-admin.ts`:

1. Looks for `auth.users` with email `help.copytraderx@gmail.com`. If exists, no-op.
2. Otherwise calls Supabase Auth admin API: create user with `email`, password from `INITIAL_ADMIN_PASSWORD`, `email_confirmed=true`, `app_metadata.role='admin'`.
3. Inserts `public.users` with `role='admin'`, `must_change_password=true`.

Run once after first `docker compose up`:

```bash
pnpm seed:admin
```

The seed admin is forced to change password on first login (consistent with all other users; reduces blast radius if the env-file value leaks).

## 8. Error Handling and Edge Cases

### Auth / session

- **Expired session mid-action** — middleware redirects to `/login`; success returns to original URL.
- **Direct hit on disallowed route** — middleware bounces; server route also re-checks role and returns 403.
- **Role tampering** — JWT claim is the fast check; server-side re-read of role from the session is the authoritative check.
- **Role change drift** — when admin changes a user's role in the DB, that user's session is invalidated via the Supabase admin API so the next request re-issues a JWT with the new claim.

### Slot / license claiming

- **MT5 already in use for this product** — DB unique on `(licenses.mt5_account, licenses.product)` blocks; server returns "this account is already registered for this product." A different product on the same MT5 account is allowed and will not trigger this error.
- **Claiming on a non-active subscription** — server validates `subscriptions.status='active'` before insert.
- **Concurrent claim of the same slot** — unique index `(subscription_id, intended_account_type)` makes one insert fail; client surfaces "slot already claimed."

### Subscription state machine

Allowed transitions:

- `pending → active` (admin approve)
- `pending → rejected` (admin reject)
- `pending → deleted` (user cancel — row removed)
- `active → expired` (cron)
- `active → revoked` (admin)

The state machine lives in `lib/subscription-state.ts` (pure functions) so it can be exhaustively unit-tested. Disallowed transitions return a typed error before the DB write.

### Email

- All transactional email goes through `lib/email.ts`. SMTP failures are logged; the underlying DB transaction commits regardless. A "Resend email" button is available on the admin user/subscription detail page.

### Migration safety

Backfill plan in §10 is reversible: legacy rows attach to a synthetic legacy admin user + synthetic legacy subscription. If the migration goes wrong, drop the new tables and the synthetic rows; the original `licenses` table is untouched.

## 9. Testing

### 9.1 Unit tests (Jest, pure logic)

- `lib/schemas.ts` — extend `lib/schemas.test.ts` with `createUserSchema`, `createSubscriptionSchema`, `approveSubscriptionSchema`, `rejectSubscriptionSchema`, `claimSlotSchema`.
- `lib/expiry.ts` — verify `expires_at` math for each tier.
- `lib/subscription-state.ts` (new) — exhaustive state-transition tests.
- `lib/role.ts` (new) — `requireAdmin` / `requireUser` against fake sessions.

### 9.2 Playwright E2E

- Dependency: `@playwright/test`.
- Lives in `e2e/` at repo root. Runs via `pnpm e2e`.
- Test data isolation: a dedicated test Supabase project, configured via `.env.test` (gitignored). `globalSetup` truncates the new tables and seeds a known admin + a known user before each run. **We never test against the production Supabase project.**
- Auth in tests bypasses email by minting sessions through the Supabase Auth admin API and attaching the cookie directly. We do not click magic links or read inboxes.
- Cron-driven natural expiry is simulated by directly updating `expires_at` in test DB, not by waiting.

Specs:

- `admin-creates-user.spec.ts`
- `user-claims-slot.spec.ts`
- `user-requests-and-admin-approves.spec.ts`
- `user-cancels-request.spec.ts`
- `admin-revokes-subscription.spec.ts`
- `role-boundary.spec.ts` — anon → `/login`, user → `/admin/*` blocked, admin → `/dashboard` blocked (or redirected to admin home).

CI hookup is a v2 concern; for v1, run locally before deploys.

### 9.3 Not in v1

- E2E in CI.
- Email-delivery tests (verify visually).
- Load / concurrency tests.

## 10. Migration Plan

Migrations live in the EA repo (`~/Documents/development/EA/JSONFX-IMPULSE/supabase/migrations/`) per existing convention.

1. `20260506000001_create_users_table.sql` — `public.users`, mirror trigger from `auth.users`.
2. `20260506000002_create_subscriptions_table.sql` — `public.subscriptions` + indexes.
3. `20260506000003_alter_licenses_add_user_subscription.sql` — add nullable `subscription_id`, `user_id`, and `product`. Drop the old single-column unique on `mt5_account`; create the new unique `(mt5_account, product)`. Create `idx_licenses_user`, `idx_licenses_product`, and `idx_licenses_one_per_slot`.
4. `20260506000004_add_role_jwt_trigger.sql` — keeps `auth.users.app_metadata.role` synced with `public.users.role`.
5. `20260506000005_subscription_expiry_trigger.sql` — cascades subscription status to child licenses.
6. `20260506000006_rls_policies.sql` — policies per §5.6.
7. `20260506000007_backfill_legacy_licenses.sql` — creates a synthetic legacy admin user and a synthetic legacy subscription (`product='impulse'`, `tier='yearly'`, `status='active'`, far-future `expires_at`); attaches all existing license rows to it and stamps `product='impulse'` on every legacy license. Then sets `subscription_id`, `user_id`, and `product` to NOT NULL.

After migrations, run `pnpm seed:admin` to provision `help.copytraderx@gmail.com`.

## 11. File Layout

### New / moved app routes

```
app/
  login/page.tsx                                NEW
  auth/change-password/page.tsx                 NEW
  admin/
    layout.tsx                                  NEW (requireAdmin)
    licenses/                                   MOVED from app/licenses (+ pending requests panel)
    users/                                      NEW
      page.tsx
      new/page.tsx
      [id]/page.tsx
    propfirm-rules/                             MOVED from app/propfirm-rules
    settings/                                   MOVED from app/settings
  dashboard/
    layout.tsx                                  NEW (requireUser)
    page.tsx                                    NEW
    licenses/[id]/page.tsx                      NEW
  api/
    licenses/                                   EXISTING — guards updated
    journal/                                    EXISTING — guards updated
    propfirm-rules/                             EXISTING — admin-only guard
    users/                                      NEW
      route.ts
      [id]/route.ts
    subscriptions/                              NEW
      route.ts
      [id]/route.ts
    auth/change-password/route.ts               NEW
  page.tsx                                      CHANGED (redirect by role)
middleware.ts                                   NEW
```

### Lib

```
lib/
  schemas.ts                                    EXTEND
  expiry.ts                                     EXTEND
  subscription-state.ts                         NEW
  role.ts                                       NEW
  email.ts                                      NEW
  supabase/
    server.ts                                   EXTEND (getSessionUser, getSessionRole)
    admin.ts                                    NEW (admin API client)
```

### Components

```
components/
  admin/
    pending-requests-panel.tsx                  NEW
    user-form.tsx                               NEW
    revoke-dialog.tsx                           NEW
    reject-request-dialog.tsx                   NEW
  user/
    subscription-card.tsx                       NEW
    slot-card.tsx                               NEW
    claim-slot-dialog.tsx                       NEW
    request-license-dialog.tsx                  NEW
  shared/
    expired-banner.tsx                          NEW
    role-badge.tsx                              NEW
  journal/                                      EXISTING — unchanged
  propfirm-rules/                               EXISTING — unchanged
  ui/                                           EXISTING — unchanged
```

### Scripts and tests

```
scripts/seed-admin.ts                           NEW
e2e/                                            NEW (specs listed in §9.2)
playwright.config.ts                            NEW
.env.test                                       NEW (gitignored)
```

### Things explicitly NOT changing

- EA-side license-row column meanings (`license_key`, `mt5_account`, `tier`, `expires_at`, `status`, `account_type`, `push_interval_seconds`, `propfirm_rule_id`). A new `product` column is added but that's additive — no rename or repurpose of existing columns.
- Journal data model (`positions`, `deals`, `orders`, `account_snapshots_*`). Note: journal rows already carry `ea_source` so the journal side of multi-product is already supported; nothing to change there.
- Propfirm-rules CRUD.

### Things that DO change vs. the original draft

- License-key generation: `generateLicenseKey()` becomes `generateLicenseKey(product)` and returns the per-product prefix from §3.5. The single `LICENSE_KEY_PATTERN` regex becomes a per-product map (`LICENSE_KEY_PATTERNS`), keyed by product code.
- License-row uniqueness on `mt5_account` becomes `(mt5_account, product)`.

## 12. Open Questions

None blocking. Items deferred to implementation:

- Exact email body copy.
- Visual treatment of the "Expired — please renew" banner (color, placement).
- Whether the admin's pending-requests panel goes beside or below the licenses table on desktop (responsive design call during implementation).
