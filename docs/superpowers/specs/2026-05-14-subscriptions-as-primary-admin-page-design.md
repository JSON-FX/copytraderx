# Subscriptions as the primary admin page

**Date:** 2026-05-14
**Status:** Draft — awaiting review
**Supersedes:** parts of the licenses admin IA established in `2026-04-25-admin-ui-design.md`

## Motivation

Today the admin nav exposes **Licenses** as the top-level entity, but the actual unit of management is the **Subscription**:

- A license cannot exist without a subscription — every new license carries `subscription_id` and `user_id`.
- All commercial fields (tier, expiry, propfirm rule, status, hide-on-dashboard) live on `subscriptions`, not `licenses`.
- Admins already manage subscriptions inside `/admin/users/[id]` via `UserSubscriptionsPanel`; the top-level Licenses page only exposes the EA-side view (key, MT5 account, broker, liveness).

The mismatch shows up in two places:

1. **Empty "Customer Email" column.** `licenses.customer_email` is a legacy field from before the users table existed; modern flows write `user_id` instead and leave `customer_email` null. The Licenses table therefore renders `—` for every modern row.
2. **No top-level Subscriptions listing.** The only way to browse subscriptions cross-user is through Requests (pending only) or by drilling into one user at a time.

This spec promotes Subscriptions to a first-class admin page, repurposes the Licenses page as a narrow MT5/liveness ops view, and cleans up the orphaned `customer_email` column.

## Goals

- Add `/admin/subscriptions`: a paginated, filterable listing of all subscriptions across users, grouped by user.
- Make Subscriptions the primary admin nav entry; keep Licenses reachable but reframed as ops/debugging.
- Resolve owner email everywhere via `licenses → subscriptions → users.email` rather than the legacy `licenses.customer_email` column.
- Delete the legacy `customer_email` column and any pre-users-era orphan licenses (rows where both `user_id` and `subscription_id` are null).
- Reuse the existing `DashboardPagination` control, extended with a per-page size selector, so the user dashboard and the admin Subscriptions page share one pagination primitive.

## Non-goals

- Schema changes to `subscriptions` or `licenses` beyond dropping `licenses.customer_email`.
- Changing the 1-subscription-to-2-MT5-slots model (LIVE + DEMO per subscription).
- Replacing or hiding `UserSubscriptionsPanel` on `/admin/users/[id]`; that view remains the place to manage one user's subscriptions in depth.
- New filters on the existing Licenses page beyond what is required to keep it working after the `customer_email` drop.
- Server-side pagination. With the current scale (<200 subscriptions) the page fetches the full set and paginates client-side, matching the existing dashboard pattern.

## UX / Information architecture

### Admin nav (`components/site-nav.tsx`)

Before: **Licenses · Users · Requests · Settings · Propfirm Rules**
After:  **Subscriptions · Users · Requests · Licenses · Settings · Propfirm Rules**

- The brand link target (`/admin/licenses` today) moves to `/admin/subscriptions`.
- "Subscriptions" is left-most; "Licenses" stays in the nav but moves to the right of "Requests" to reflect its new ops role.
- The Requests badge (pending subscriptions count) is unchanged.

### New page: `/admin/subscriptions`

**Server component (`app/admin/subscriptions/page.tsx`):**

Fetches all subscriptions plus the data needed for inline display:

- `subscriptions.*`
- `users.email`, `users.full_name` (join via `user_id`)
- `licenses.id`, `license_key`, `mt5_account`, `broker_name`, `intended_account_type`, `status`, `last_validated_at`, `activated_at` (join via `subscription_id`)
- The propfirm rule name where `propfirm_rule_id` is set

Returns a client component with the assembled rows.

**Client component (`components/admin/subscription-table.tsx`):**

Renders a single `<table>` with one shared header row and per-user "group header" rows interspersed.

Header columns: **Status · Product · Tier · MT5 slots · Expires · ⋯**

Group header row (full-width `colspan`): expand/collapse caret, email, full name, subscription count, and status-summary chips (e.g., "2 active · 1 pending · 1 expired"). Clicking the email navigates to `/admin/users/[id]`.

Subscription rows under each group: standard columns. MT5 slots cell renders both slots stacked — `LIVE` chip + account + broker on top, `DEMO` chip + account + broker below (either may be "— no slot —" when a license has not been generated yet). The slot cell links to `/admin/licenses/[id]` for ops drill-down.

**Toolbar:**

```
[ Search by email, product, or MT5… ]  [ All statuses ▾ ]  [ All products ▾ ]  Show [ 10 ▾ ] per page
```

Search matches on `users.email`, `users.full_name`, product label, tier, license key, and MT5 account. Status filter mirrors `SubscriptionStatus` (pending / active / rejected / expired / revoked). Product filter sources from `lib/products.ts`.

**Pagination model:**

- Unit of pagination is the **user group**, not the subscription row — a group never splits across pages.
- Page-size selector: `10` (default), `25`, `50`, `100` (max). Persisted to `localStorage` under `admin.subs.pageSize`.
- Footer: *"Showing users X–Y of N · M subscriptions on this page"*.
- Changing search or filters resets to page 1 and operates on the filtered set.

**Row actions (⋯ menu):**

Mirrors the actions available in `UserSubscriptionsPanel` today — approve, reject, revoke, edit. Implementation reuses the existing `/api/subscriptions/[id]/*` endpoints; no new endpoints required.

### Repurposed page: `/admin/licenses`

Stays mounted at the same route but is reframed in copy and column order to be an MT5/liveness ops view:

- Page title: "Licenses (ops)". Subtitle: "EA-side view — use Subscriptions to manage entitlements."
- Column order: Liveness · License Key · MT5 Account · Broker · Owner · Last validated · Activated · Expires.
- **Owner** column resolves from `subscriptions → users.email` (join), replacing the dropped `customer_email`.
- The "Create subscription" button is removed; creation lives on the Subscriptions page.
- The detail route `/admin/licenses/[id]` is unchanged. The journal sub-route under it is unchanged.

## Data model changes

### Drop legacy column

```sql
ALTER TABLE licenses DROP COLUMN customer_email;
```

The column is read in a handful of places (admin Licenses table, license types). Each call site switches to the joined `users.email`. The `License` TypeScript type in `lib/types.ts` loses `customer_email`.

### Delete pre-users-era orphans

```sql
DELETE FROM licenses
WHERE user_id IS NULL
  AND subscription_id IS NULL;
```

These are pre-users-era rows that have no path to an owner. They cannot be reached from any modern flow and only pollute the Licenses ops view. Any license that has *either* `user_id` *or* `subscription_id` is retained (the join can still resolve the owner via the surviving foreign key, and the rare half-orphan is worth keeping for forensics rather than deleting silently).

Both statements run in a single Supabase migration (`supabase/migrations/YYYYMMDDHHMMSS_drop_license_customer_email.sql` in the Supabase repo — same place the prior `intended_account_type` migration was added). The migration is forward-only.

## Component / code changes

- **`components/site-nav.tsx`** — reorder links, swap the brand href to `/admin/subscriptions`, leave Licenses link in place.
- **`components/admin/admin-site-nav.tsx`** — no change (still surfaces pending-subscription count).
- **`app/admin/subscriptions/page.tsx`** *(new)* — server fetch, render `SubscriptionTable`.
- **`components/admin/subscription-table.tsx`** *(new)* — grouped table, search/filter toolbar, pagination, row action menu. Composes `DashboardPagination` (extended) and existing badges (`StatusBadge`, `TierBadge`, `LivenessBadge`).
- **`components/user/dashboard-pagination.tsx`** — extend (or wrap) to optionally render a page-size selector. Existing callers in the user dashboard keep their hard-coded `CARDS_PER_PAGE` and pass no selector; the admin table opts in.
- **`lib/dashboard-filters.ts`** — `CARDS_PER_PAGE` stays a constant for the dashboard; add a parallel constant `ADMIN_SUBS_PAGE_SIZE_DEFAULT = 10` and `ADMIN_SUBS_PAGE_SIZE_OPTIONS = [10, 25, 50, 100]`.
- **`lib/types.ts`** — remove `customer_email` from `License`.
- **`components/license-table.tsx`** + **`app/admin/licenses/page.tsx`** — adopt the joined owner email; drop the "Create subscription" button; adjust copy and column order per the ops reframing.
- **No new API endpoints.** The admin Subscriptions page reads from a server component (Supabase service-role client), the same pattern as `/admin/users/[id]` today. Existing per-action endpoints under `/api/subscriptions/[id]/*` cover row actions.

## Persistence & polling

- Page-size selector persists to `localStorage.admin.subs.pageSize`. Read on mount with a sane default (10) — same fallback shape as `getPollingInterval` in `lib/settings.ts`.
- The admin Subscriptions page does not poll. The Licenses ops view continues to poll (its current behavior) since EA liveness changes minute-to-minute.

## Migration / rollout

1. Ship the new page and extended pagination control. Both pages coexist — Licenses still renders, Subscriptions is reachable.
2. Run the migration that drops `licenses.customer_email` and deletes orphans.
3. Flip the brand link / nav order in the same release.

Because the migration drops a column that the codebase still references via the `License` type, steps 1 and 2 must land together in the same deploy — the type change, the call-site updates, and the SQL run as one unit.

## Open questions

None known. Decisions made during brainstorming:

- Grouped table with collapsible per-user headers (Variant B), not flat rows (A) or toggle (A/B).
- Paginate by user group, not by subscription row.
- Page-size ladder: 10 / 25 / 50 / 100, default 10.
- Drop `customer_email`; do not backfill.

## Out of scope (deferred)

- Server-side pagination or virtualization (only relevant past ~1k subscriptions).
- Bulk actions on subscription rows (multi-select approve/revoke).
- A dedicated `/admin/subscriptions/[id]` detail page — for now, row actions are inline and deeper edits happen on `/admin/users/[id]`. Worth revisiting after this ships.
- Server-side sort beyond the default `created_at desc`.
