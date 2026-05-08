# Plan 5 — Admin Requests, Admin-Direct Subscription Create, Cron Expiry, Revoke, Reattach, E2E

- **Date:** 2026-05-08
- **Status:** Approved for plan-write
- **Branch:** `feat/admin-client-roles`
- **Parent specs:**
  - `2026-05-06-admin-client-roles-design.md` (the roles spec — sections §5–§9 bind)
  - `2026-05-08-plan5-scope-note-admin-form-rework.md` (admin form rework — folded in here)

This is a Plan-5-specific addendum. It resolves the open questions from the parent specs and pins the design decisions for the implementation plan that follows. Where this document and the parent spec disagree, **this document wins for Plan 5**.

## 1. Scope

Plan 5 closes the roles series. It ships six pieces of work, plus the supporting schema migration, email senders, and Playwright suite:

1. **Admin pending-requests management** — dedicated `/admin/requests` page with approve/reject UI + API.
2. **Admin-direct subscription create** — new `/admin/subscriptions/new` page replacing `/admin/licenses/new`.
3. **Schema migration (Option A)** — move `push_interval_seconds` and `propfirm_rule_id` from `licenses` to `subscriptions`.
4. **Admin revoke** — Revoke button on active subscriptions, confirmation dialog, email to user.
5. **Cron-driven natural expiry** — Supabase pg_cron daily job; trigger cascades to child licenses.
6. **Reattach legacy license UI** — section on `/admin/licenses/[id]` for licenses currently owned by the synthetic legacy admin.

Plus: inline edit of per-subscription policy fields on `/admin/users/[id]`, two new email senders, wiring of the two existing-but-unwired senders, and the full 6-spec Playwright E2E suite.

## 2. Decisions resolving open questions

| Question (source) | Decision |
|---|---|
| Schema for `push_interval_seconds` / `propfirm_rule_id` (scope note §"Schema follow-ups") | **Option A** — move to `subscriptions`; drop from `licenses`. |
| `/admin/licenses/new` after the rework (scope note open Q) | **307 redirect** to `/admin/subscriptions/new`. The old page file is replaced with a server-side redirect call. |
| Send a "subscription granted" email on admin-direct create (scope note open Q) | **Optional** — checkbox on the admin form, default checked. New `sendSubscriptionGrantedEmail` sender. |
| User picker control style (scope note open Q) | **Typeahead** — debounced search-as-you-type from `public.users`. |
| Editing policy fields on existing subscriptions | **Inline edit on `/admin/users/[id]`** — each subscription card gets a `<SubscriptionPolicyForm>` editor. |
| Pending-requests panel placement (parent spec §6.5 said "beside the licenses table") | **Override:** dedicated `/admin/requests` page. Cleaner separation; nav badge surfaces the pending count. |
| Cron for natural expiry (parent spec §6.6 said "Supabase scheduled function") | **pg_cron daily job at 00:00 UTC**. `scripts/expire-subscriptions.ts` runs the same SQL for manual / test triggers. |
| Reattach legacy license UI (Plan 4 carve-out) | **Section on `/admin/licenses/[id]`** shown only when `license.user_id == LEGACY_ADMIN_ID`. |
| Playwright cadence | **All 6 specs** from parent §9.2, run locally pre-deploy. CI hookup remains deferred per parent §9.3. |

## 3. Architecture

### 3.1 Route changes

```
app/
  admin/
    layout.tsx                      MODIFY (Requests nav link + count badge)
    requests/
      page.tsx                      NEW
    subscriptions/
      new/page.tsx                  NEW
    licenses/
      new/page.tsx                  REWRITE — server-side redirect to /admin/subscriptions/new (HTTP 307)
      [id]/page.tsx                 EXTEND — Reattach-to-user section (legacy-owned only)
    users/
      [id]/page.tsx                 EXTEND — per-card policy edit + Revoke
  api/
    subscriptions/
      admin-create/route.ts         NEW
      [id]/route.ts                 EXTEND (PATCH for policy fields)
      [id]/approve/route.ts         NEW
      [id]/reject/route.ts          NEW
      [id]/revoke/route.ts          NEW
    licenses/
      [id]/reattach/route.ts        NEW
      route.ts                      MODIFY — delete POST handler (admin-direct license insert path)
```

### 3.2 lib changes

```
lib/
  email.ts                          EXTEND — sendSubscriptionGrantedEmail, sendSubscriptionRevokedEmail
  schemas.ts                        EXTEND — 5 new schemas (§4.4)
  subscription-state.ts             EXTEND — canApprove(s), canReject(s), canRevoke(s)
  users.ts                          EXTEND — LEGACY_ADMIN_ID export, isLegacyAdmin(id) helper
```

### 3.3 Components

```
components/admin/
  pending-requests-table.tsx        NEW — used by /admin/requests
  reject-request-dialog.tsx         NEW — collects rejection_reason
  revoke-dialog.tsx                 NEW — confirmation
  user-typeahead.tsx                NEW — debounced search of public.users
  admin-create-subscription-form.tsx   NEW — used by /admin/subscriptions/new
  reattach-legacy-license-section.tsx  NEW — used inside /admin/licenses/[id]
  subscription-policy-form.tsx      NEW — inline edit for push_interval + propfirm_rule
```

The existing `components/admin/user-subscriptions-panel.tsx` is extended in place to render `<SubscriptionPolicyForm>` and a Revoke button on each card; no new wrapper component.

### 3.4 Scripts and tests

```
scripts/expire-subscriptions.ts     NEW — manual cron trigger for tests
e2e/                                NEW — 6 specs (parent §9.2)
playwright.config.ts                NEW
.env.test                           NEW (gitignored)
```

## 4. Data model and migrations

Migrations live in the EA repo (`~/Documents/development/EA/JSONFX-IMPULSE/supabase/migrations/`) per existing convention.

### 4.1 `20260508000001_move_policy_fields_to_subscriptions.sql`

```sql
-- Adds push_interval_seconds + propfirm_rule_id to subscriptions, backfills
-- from licenses (per-subscription deterministic pick), then drops the columns
-- from licenses.

alter table public.subscriptions
  add column push_interval_seconds integer,
  add column propfirm_rule_id      bigint references public.propfirm_rules(id);

update public.subscriptions s
set push_interval_seconds = sub.push_interval_seconds,
    propfirm_rule_id      = sub.propfirm_rule_id
from (
  select subscription_id,
         min(push_interval_seconds) as push_interval_seconds,
         min(propfirm_rule_id)      as propfirm_rule_id
  from public.licenses
  where subscription_id is not null
  group by subscription_id
) sub
where s.id = sub.subscription_id;

update public.subscriptions
set push_interval_seconds = 10
where push_interval_seconds is null;

alter table public.subscriptions
  alter column push_interval_seconds set not null,
  alter column push_interval_seconds set default 10;

alter table public.licenses
  drop column push_interval_seconds,
  drop column propfirm_rule_id;
```

**Rollback** (documented in the migration header comment):

```sql
alter table public.licenses
  add column push_interval_seconds integer not null default 10,
  add column propfirm_rule_id      bigint references public.propfirm_rules(id);

update public.licenses l
set push_interval_seconds = s.push_interval_seconds,
    propfirm_rule_id      = s.propfirm_rule_id
from public.subscriptions s
where l.subscription_id = s.id;

alter table public.subscriptions
  drop column push_interval_seconds,
  drop column propfirm_rule_id;
```

### 4.2 `20260508000002_install_expiry_cron.sql`

```sql
-- Requires pg_cron (enabled on Supabase Pro+ by default).
select cron.schedule(
  'subscriptions-expire-daily',
  '0 0 * * *',  -- 00:00 UTC daily
  $$
    update public.subscriptions
       set status = 'expired'
     where status = 'active'
       and expires_at <= now();
  $$
);
```

The cascade trigger from parent spec §5.5 (already shipped in Plan 1) flips child `licenses.status` to `'expired'` automatically. No app-side cron handler.

### 4.3 EA-side query change (out-of-repo, callout)

The EA reads license rows and currently pulls `push_interval_seconds` / `propfirm_rule_id` directly from `licenses`. After Plan 5 those fields live on `subscriptions`. The EA query becomes a join:

```sql
select l.license_key, l.mt5_account, l.tier, l.expires_at, l.status,
       l.intended_account_type, l.product,
       s.push_interval_seconds, s.propfirm_rule_id
  from public.licenses l
  join public.subscriptions s on s.id = l.subscription_id
 where l.mt5_account = :mt5
   and l.product = :product;
```

The EA repo lives outside this codebase. Its update lands in lockstep with the Plan 5 schema migration; the implementation plan flags this as a coordination step and gates the migration deploy on the EA-side query change being ready.

### 4.4 New `lib/schemas.ts` schemas

```ts
adminCreateSubscriptionSchema    // user_id (uuid), product, tier, push_interval_seconds (>=1, default 10), propfirm_rule_id? (bigint | null), notes?, send_grant_email (bool, default true)
approveSubscriptionSchema        // no body — id is path param
rejectSubscriptionSchema         // rejection_reason (1..500 chars)
revokeSubscriptionSchema         // no body
updateSubscriptionPolicySchema   // push_interval_seconds? (>=1), propfirm_rule_id? (bigint | null)
reattachLicenseSchema            // target_user_id (uuid)
```

### 4.5 State-machine extensions (`lib/subscription-state.ts`)

Three new pure-function guards, each returning `GuardResult`:

- `canApprove(s)` — allows iff `s.status === 'pending'`.
- `canReject(s)` — allows iff `s.status === 'pending'`.
- `canRevoke(s)` — allows iff `s.status === 'active'`.

Disallowed transitions return `{ allowed: false, reason }` and the API routes return 409 Conflict with the reason in the body.

## 5. Admin pages — behavior

### 5.1 `/admin/requests`

Server component. Reads `subscriptions where status='pending' order by requested_at asc` joined to `users`. Renders one row per request: user (email + full_name), product label, tier, requested_at (relative), notes, **Approve** + **Reject** buttons. Empty state: "No pending requests." A nav link "Requests" with a count badge appears in `app/admin/layout.tsx`; the count comes from a server-side `count(*) where status='pending'` evaluated on each layout render (no caching needed — single admin, low traffic).

**Approve** = single click → `POST /api/subscriptions/[id]/approve` → page revalidates.
**Reject** = opens `<RejectRequestDialog>` for `rejection_reason` → `POST /api/subscriptions/[id]/reject` → revalidates.

### 5.2 `/admin/subscriptions/new`

Server-rendered shell wrapping the client `<AdminCreateSubscriptionForm>`. Fields:

- **User** — `<UserTypeahead>` (debounced 250ms, queries `public.users` by email or full_name). "Create new user" link opens `/admin/users/new` in a new tab.
- **Product** — `<select>` of the 5 products from parent spec §3.5.
- **Tier** — `<select>` monthly / quarterly / yearly.
- **Push interval (seconds)** — `<input type="number" min={1} defaultValue={10}>`.
- **Propfirm rule** — `<select>` of all rules with a `(none)` option mapping to `null`.
- **Notes** — optional `<textarea>`.
- **Send welcome email to user** — `<input type="checkbox" defaultChecked>`.

Submit → `POST /api/subscriptions/admin-create` → 201 → `redirect('/admin/users/' + user_id)`.

### 5.3 `/admin/licenses/new` retirement

The file `app/admin/licenses/new/page.tsx` is rewritten to a server component that immediately calls `redirect('/admin/subscriptions/new')`. Next.js issues a 307. The file is not deleted (kept as a permanent redirect stub) so any in-flight bookmarks land somewhere sensible. Inbound links from the admin layout / list pages are updated to point at the new path directly.

### 5.4 `/admin/licenses/[id]` — Reattach section

A new section on the existing edit page, rendered conditionally:

- Visible iff `license.user_id === LEGACY_ADMIN_ID`.
- Header: "Reattach legacy license".
- Body: `<UserTypeahead>` + Confirm button.
- Submit → `POST /api/licenses/[id]/reattach { target_user_id }`.

The reattach API (see §6) creates a new active subscription on the target user inheriting the license's `tier` and `expires_at`, then re-points `licenses.subscription_id` and `licenses.user_id`. Inheriting via *new* subscription keeps the audit trail clean and avoids slot-collision logic against the target user's existing subscriptions.

### 5.5 `/admin/users/[id]` — policy edit + Revoke

Each subscription card in `<UserSubscriptionsPanel>` gets:

- **Inline `<SubscriptionPolicyForm>`** — two fields (`push_interval_seconds`, `propfirm_rule_id`), Save button → `PATCH /api/subscriptions/[id]`.
- **Revoke button** (active subscriptions only) → `<RevokeDialog>` confirms → `POST /api/subscriptions/[id]/revoke`.

Pending-status cards do not show the policy form (policy fields are admin-set on approval, not on pending requests). Expired/revoked/rejected cards show the policy values read-only.

## 6. API surface

| Method | Path | Body | Notes |
|---|---|---|---|
| `POST` | `/api/subscriptions/admin-create` | `adminCreateSubscriptionSchema` | Admin-only. Inserts `subscriptions{status='active', approved_at=now(), approved_by=admin, expires_at=calculateExpiresAt(tier, now()), push_interval_seconds, propfirm_rule_id, notes}`. If `send_grant_email`, calls `sendSubscriptionGrantedEmail`. Returns 201 with the row. |
| `POST` | `/api/subscriptions/[id]/approve` | `{}` | Admin-only. Validates `canApprove(s)`. Flips `status='active'`, sets `approved_at = now()`, `expires_at = calculateExpiresAt(s.tier, now())`, `approved_by = admin`. Calls `sendRequestApprovedEmail`. |
| `POST` | `/api/subscriptions/[id]/reject` | `rejectSubscriptionSchema` | Admin-only. Validates `canReject(s)`. Flips `status='rejected'`, stores `rejection_reason`. Calls `sendRequestRejectedEmail`. |
| `POST` | `/api/subscriptions/[id]/revoke` | `{}` | Admin-only. Validates `canRevoke(s)`. Flips `status='revoked'`. Cascade trigger handles licenses. Calls `sendSubscriptionRevokedEmail`. |
| `PATCH` | `/api/subscriptions/[id]` | `updateSubscriptionPolicySchema` | Admin-only. Updates `push_interval_seconds` and/or `propfirm_rule_id`. No status change. No email. |
| `POST` | `/api/licenses/[id]/reattach` | `reattachLicenseSchema` | Admin-only. Validates `license.user_id === LEGACY_ADMIN_ID` and target user exists. Creates a new `subscriptions{status='active', user_id=target, product=license.product, tier=license.tier, expires_at=license.expires_at, approved_at=now(), approved_by=admin, push_interval_seconds=10, propfirm_rule_id=null, notes='Reattached from legacy backfill'}` row, then updates `licenses.subscription_id` and `licenses.user_id`. Single transaction. |

`POST /api/licenses` (the existing route) — the admin-direct insert handler is **deleted**. The route file itself stays only if it has a GET handler; otherwise it's removed.

All routes follow the existing pattern: `requireAdmin()` at the top, parsed body via the new schemas, typed errors → 4xx, success → JSON. Disallowed state-machine transitions return 409 with `{ error: reason }`.

## 7. Email senders (`lib/email.ts`)

Two new senders, plus wiring of two existing ones.

| Sender | Status | Trigger | Subject (sketch) | Body (sketch) |
|---|---|---|---|---|
| `sendRequestSubmittedEmail` | shipped (Plan 4), wired | user submits a pending request | "New license request from `<email>`" | product + tier + notes + admin URL |
| `sendRequestApprovedEmail` | shipped (Plan 4), **wired in Plan 5** | admin approves | "Your `<product>` `<tier>` license has been approved" | dashboard URL |
| `sendRequestRejectedEmail` | shipped (Plan 4), **wired in Plan 5** | admin rejects | "Your `<product>` `<tier>` license request was declined" | rejection_reason + dashboard URL |
| `sendSubscriptionGrantedEmail` | **NEW** | admin-direct create with checkbox on | "An admin has granted you a `<product>` `<tier>` subscription" | dashboard URL + claim instructions |
| `sendSubscriptionRevokedEmail` | **NEW** | admin revoke | "Your `<product>` `<tier>` subscription has been revoked" | revocation explanation + support contact |

All senders follow the existing best-effort contract: failures are logged, the underlying DB transaction commits regardless. The `subscriptions.notification_sent_at` column is updated on success where applicable. Exact subject/body copy is finalized during implementation, not at spec-time.

## 8. Cron and test simulation

- **Production cron**: `pg_cron` daily at 00:00 UTC (§4.2).
- **Manual trigger / tests**: `scripts/expire-subscriptions.ts` runs the same SQL via the service-role Supabase client. Used by the Playwright suite where natural expiry needs to be triggered without waiting for midnight.
- **Test data**: Playwright sets `expires_at` directly to a past timestamp on a known subscription, then runs the script (or calls the SQL through the test Supabase client) to flip the row.

No application code reads or writes the cron schedule beyond the install migration.

## 9. Testing

### 9.1 Unit (Jest)

- `lib/subscription-state.test.ts` — 3 new guards (`canApprove`, `canReject`, `canRevoke`).
- `lib/schemas.test.ts` — 5 new schemas (admin-create, approve, reject, revoke, update-policy, reattach).
- `lib/email.test.ts` — 2 new senders (rendered subject + body, mock transport).

### 9.2 E2E (Playwright)

All 6 specs from parent spec §9.2:

- `admin-creates-user.spec.ts`
- `user-claims-slot.spec.ts`
- `user-requests-and-admin-approves.spec.ts`
- `user-cancels-request.spec.ts`
- `admin-revokes-subscription.spec.ts`
- `role-boundary.spec.ts`

Test infra per parent spec:

- Dedicated test Supabase project, `.env.test` (gitignored).
- `globalSetup` truncates the new tables and seeds a known admin + a known user.
- Auth bypassed via Supabase Auth admin API; cookies attached directly.
- Cron expiry simulated by direct DB update.
- **Never tested against production Supabase.**

CI hookup remains deferred per parent §9.3. The README will document `pnpm e2e` as a pre-deploy local step.

### 9.3 Not in v1

- E2E in CI.
- Email-delivery tests (verified visually in the admin UI via `notification_sent_at`).
- Load / concurrency tests.
- Bulk reattach screen.
- Admin "resend email" button (column exists; UI deferred).

## 10. Out of scope

- Bulk admin create / CSV import (parent spec §3 non-goal).
- Self-service tier upgrades or proration (parent spec §3 non-goal; partly addressed by Plan 6's extension flow).
- Payment integration (parent spec §3 non-goal).
- Public self-signup (parent spec §3 non-goal).
- Two-factor auth (parent spec §3 non-goal).
- Audit log beyond `created_by` / `approved_by` columns.

## 11. Spec relationships

- **Parent (binding):** `2026-05-06-admin-client-roles-design.md` §3.5, §4, §5, §6.4–§6.6, §8, §9, §10.
- **Folded in:** `2026-05-08-plan5-scope-note-admin-form-rework.md` (admin form rework).
- **Sibling (not blocked by this plan):** `2026-05-08-subscription-extensions-design.md` (Plan 6 — pre-expiry extensions).
- **Predecessor plans (shipped):** Plans 1–4 (foundation, schema, admin users, user dashboard).

After Plan 5 ships, the roles series is complete. Run `/update-kb` to backfill the vault.
