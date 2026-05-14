# Subscription Extensions — Design

- **Date:** 2026-05-08
- **Status:** Draft for review
- **Related:** Amends `2026-05-06-admin-client-roles-design.md` §6.6 (renewal). Adds §6.7 (pre-expiry extension).

## 1. Problem

The roles spec defines exactly one renewal path: a user whose subscription has already **expired** (or been **revoked**) clicks Renew, which creates a fresh `pending` subscription row. After admin approval, the user has a brand-new active subscription with two empty slots — and has to re-enter the MT5 numbers they already typed once on the previous subscription.

This is renewal-as-replacement. It works correctly for the post-expiry case but produces three real UX gaps for the pre-expiry case:

1. **Service interruption window.** The license cascades to `expired` the moment the parent subscription expires. The user can't pre-renew, so the EA stops working until admin approves the new pending request.
2. **MT5 re-entry friction.** Even after the new subscription is approved, the user re-types every claimed MT5 account onto fresh empty slots.
3. **No tier change without lapsing.** A user on monthly who wants to upgrade to yearly has to wait for monthly to expire, then start fresh on yearly. They can't request the upgrade in advance.

Plan 4 of the roles series shipped the post-expiry renewal flow as specified. This spec adds the **pre-expiry extension** flow. Mid-cycle tier downgrades and proration credits are explicitly out of scope.

## 2. Goals

- Let the user request an extension on an `active` subscription before it expires.
- Let the user pick a tier for the extension (same as current, or different).
- Admin approves or rejects each extension request, same as new license requests today.
- On approval: extend the **existing subscription row** in place (`expires_at = old_expires_at + new tier's duration`, `tier` updated if the user changed it). Slot claims and child licenses are preserved automatically.
- Capture every approved extension in an audit table so the row's mutation history is recoverable.
- Surface extensions in the admin pending-requests panel (Plan 5) alongside new-license requests.

## 3. Non-goals (v1)

- Mid-cycle tier downgrade.
- Proration credits.
- Auto-renewal / recurring billing.
- Cross-product extension (an Impulse subscription cannot extend into a CTX Live one — that would be a new subscription).
- Eligibility windows (e.g. "extension only allowed within N days of expiry"). Anytime while active is enough for v1; admin can reject "too soon" requests by hand.
- "Stack" multiple extension requests. One pending extension per subscription at a time (see §5.4).

## 4. Architecture

### 4.1 Two writers, one row

The `subscriptions` table now has two distinct write patterns:

- **Replacement renewal** (Plan 4): user requests post-expiry → server inserts a NEW row with `status='pending'`. On approval the new row flips to `active`. The expired source stays as immutable history. Used when source is `expired` or `revoked`.
- **In-place extension** (this spec, Plan 6): user requests pre-expiry → server inserts a row in a NEW table `subscription_extensions` with `status='pending'`. On approval the **source subscription's** `expires_at` and `tier` are updated; the extension row is marked `approved` for audit. Used when source is `active`.

The two paths never collide because they're gated on the source's status. `canRenewFrom` (already in `lib/subscription-state.ts`) allows `expired | revoked`. A new `canExtendFrom` allows `active` only. UI presents Renew on expired/revoked cards and Extend on active cards.

### 4.2 Why an extensions table instead of mutating in place silently

If approved extensions just update `subscriptions.expires_at` and `tier`, the row's history is gone. We can't answer "what tier was this user on between 2026-04-01 and 2026-05-15?" or "how many extensions has this user requested?" — both real audit/billing questions even though billing is out-of-band today.

A dedicated `subscription_extensions` table:

- Records every request (pending → approved/rejected) like a journal.
- Stores the deltas (`old_tier`, `new_tier`, `old_expires_at`, `new_expires_at`) at approval time, so the audit trail survives even if the source subscription is later revoked or backfilled.
- Keeps the `subscriptions` schema unchanged. Reads of "current state" stay simple.
- Is admin-only readable (RLS); user only sees their own extension requests in the dashboard's per-card view.

### 4.3 No EA contract change

The EA reads `licenses.expires_at` per `licenses` row. Plan 4's status-cascade trigger keeps `licenses.expires_at` in sync with the parent subscription (it cascades on subscription status changes). On approved extension, we **also** push the new `expires_at` down to child licenses — this is a one-line addition to the existing trigger function, or a separate trigger on `subscriptions.expires_at` updates. Either way, no EA-side change.

## 5. Data Model

### 5.1 New table: `public.subscription_extensions`

```sql
create table public.subscription_extensions (
  id                bigserial primary key,
  subscription_id   bigint  not null references public.subscriptions(id) on delete cascade,
  user_id           uuid    not null references public.users(id) on delete cascade,
  requested_tier    text    not null check (requested_tier in ('monthly', 'quarterly', 'yearly')),
  status            text    not null check (status in ('pending', 'approved', 'rejected')),
  requested_at      timestamptz not null default now(),
  approved_at       timestamptz,
  approved_by       uuid    references public.users(id),
  rejection_reason  text,
  -- Snapshot of the source subscription at approval time, so audit
  -- survives later mutation/revocation of the source row.
  old_tier          text,    -- copied from subscriptions.tier at approval
  new_tier          text,    -- = requested_tier; copied for stable read
  old_expires_at    timestamptz,
  new_expires_at    timestamptz,
  notes             text,
  created_at        timestamptz not null default now()
);

create index idx_extensions_user      on public.subscription_extensions(user_id, status);
create index idx_extensions_pending   on public.subscription_extensions(status) where status = 'pending';
create index idx_extensions_source    on public.subscription_extensions(subscription_id, status);

-- One outstanding pending extension per source subscription (§5.4).
create unique index idx_extensions_one_pending_per_source
  on public.subscription_extensions(subscription_id)
  where status = 'pending';
```

The four `old_*` / `new_*` snapshot columns stay null while `status='pending'` and are stamped at approval time.

### 5.2 Trigger: cascade `subscriptions.expires_at` to child licenses

A new (or extended) trigger fires on `update of expires_at on public.subscriptions`. When the new `expires_at` is later than the old, update all child `licenses.expires_at` to match. This is additive — the existing status-cascade trigger from Plan 2 handles the status side; this handles the expires_at side independently.

Approved extensions run within a single transaction:

1. `update subscriptions set expires_at = ?, tier = ? where id = ? and status = 'active'` — the `status='active'` clause is a safety guard.
2. The trigger from §5.2 cascades the new `expires_at` to child licenses.
3. `update subscription_extensions set status='approved', approved_at=now(), approved_by=admin, old_tier=?, new_tier=?, old_expires_at=?, new_expires_at=?` — stamps the audit row.

If any of those fail the whole transaction rolls back. The unique index `idx_extensions_one_pending_per_source` prevents two admins from approving concurrent extensions on the same source.

### 5.3 RLS

- `subscription_extensions`: user can `select where user_id=self`. User can `insert` with `status='pending'`, `user_id=self`, and `subscription_id` referencing a row they own. User can `delete where user_id=self and status='pending'` (cancel their own pending). Admin: full.

### 5.4 One-pending-per-source invariant

The unique index `idx_extensions_one_pending_per_source` ensures a user can't queue multiple extensions on the same active subscription. If they want to change tier after submitting, they cancel the existing pending request first. This is the same rule the dashboard already applies to new-license requests through the user's mental model (one outstanding request at a time per slot).

### 5.5 Computing `new_expires_at`

Server-side, on approval:

```ts
new_expires_at = calculateExpiresAt(requested_tier, old_expires_at)
```

The existing `calculateExpiresAt(tier, from)` helper from `lib/expiry.ts` does the right thing — it adds the tier duration to the `from` date. So the user genuinely doesn't lose unused time; their new expiry is `old_expires_at + N months`.

If the user changes tier (e.g. monthly → yearly), the addition is to the **new** tier's duration. So a monthly user with 5 days left who upgrades to yearly gets `old_expires_at + 12 months` = effectively the 5 days carry forward. No proration math required.

## 6. User Flows

### 6.1 User requests an extension

1. On `/dashboard`, an active subscription card shows an **Extend** button next to the existing slot grid (only when the source is `active` AND there's no existing pending extension for it).
2. Clicking Extend opens a dialog with the same shape as Renew:
   - **Product:** read-only, locked from source.
   - **Tier:** pre-filled from source, user can change.
   - **Notes** (optional): free-text passed to admin.
3. Submit → server validates with `extendSubscriptionRequestSchema`, ensures `canExtendFrom(source)`, checks no existing pending extension via the unique index, and inserts a `subscription_extensions` row with `status='pending'`.
4. `lib/email.ts` fires a `sendRequestSubmittedEmail` (reused from Plan 4) with `product_label`, `tier_label`, and a one-line "extension request" prefix in the subject so admin can distinguish it from new-license requests.
5. The user's dashboard card now shows the extension request inline beneath the slot grid: "Extension pending — yearly — submitted 2026-05-08 [Cancel]".

### 6.2 User cancels a pending extension

Same shape as cancel-request: `DELETE /api/extensions/[id]` deletes the row when owned-by-caller and `status='pending'`.

### 6.3 Admin approves an extension

Plan 5's pending-requests panel grows a second tab/section: **Pending Extensions**. Each row shows user, source subscription (product + current tier + current expires_at), requested tier, requested_at, notes, plus Approve / Reject.

- **Approve** → server runs the §5.2 transaction.
- **Reject** → modal asks for `rejection_reason` → server flips to `rejected`, stores reason, fires `sendRequestRejectedEmail` (reused from Plan 5).
- **Approval email** reuses `sendRequestApprovedEmail` with copy adjusted for "extension" vs "new license" via a new `kind` field on the input.

### 6.4 What the user sees after approval

The card's `expires 2026-06-08` line updates to `expires 2026-07-08` (or wherever the new date lands). Slot claims, MT5 numbers, license keys — all unchanged. The journal data continues uninterrupted because `licenses.mt5_account` stayed put.

The extension row is visible to the user as historical info on the card: a small "Last extended 2026-05-08 (monthly → yearly)" line below the badge. Optional, can be deferred.

### 6.5 Auto-cleanup of stale pending extensions on source expiry

If the source subscription expires (cron flips `status='active' → 'expired'`) while an extension request is still `pending`, the extension is now meaningless — the source is no longer extendable. The same cron fires a follow-up sweep that flips matching `subscription_extensions.status='pending' → 'rejected'` with `rejection_reason='source_expired_before_approval'`. The user is emailed; they can submit a fresh post-expiry renewal via the Plan 4 flow.

## 7. Error Handling and Edge Cases

### Eligibility

- **Source not active:** `canExtendFrom` returns false → 409 `subscription_not_active`. UI hides the Extend button on non-active cards.
- **Existing pending extension:** unique index violation → 409 `extension_already_pending`. UI disables the Extend button while a pending exists for that source.

### Race conditions

- **Two admins approve simultaneously:** the `update subscriptions where status='active'` clause + the unique pending-per-source index prevent double-stamping. Whichever transaction commits second sees the source as already extended (status check passes but expires_at has moved) — surfaces as 409 `concurrent_modification`.
- **Source revoked between request and approval:** the `status='active'` guard fails → admin sees 409 → admin manually rejects the extension. Cron sweep from §6.5 also handles this.

### Partial cascade

The trigger that pushes `expires_at` to child licenses runs in the same transaction as the subscription update. If the trigger errors (it shouldn't — it's a simple UPDATE) the whole approval rolls back.

## 8. State Machine

```
extensions:
  pending → approved   (admin)
  pending → rejected   (admin OR cron sweep §6.5)
  pending → deleted    (user cancel)
```

`canExtendFrom(subscription) === true` iff `subscription.status === 'active'`. Lives in `lib/subscription-state.ts` next to the existing helpers.

## 9. Testing

### 9.1 Unit tests

- `lib/subscription-state.ts` — extend exhaustive tests with `canExtendFrom` covering all 5 statuses.
- `lib/schemas.ts` — `extendSubscriptionRequestSchema` (subscription_id, requested_tier).
- `lib/expiry.ts` — confirm `calculateExpiresAt` works correctly when `from` is a future date (already does, but worth a regression test).

### 9.2 Integration

- `POST /api/extensions` — happy path, source-not-active, existing-pending-blocked.
- `POST /api/extensions/[id]/approve` — happy path, transaction rolls back if `subscriptions` update fails, `expires_at` cascaded to licenses.
- `DELETE /api/extensions/[id]` — owner only, pending only.

### 9.3 Playwright (Plan 5)

Plan 5 adds a Playwright suite. Plan 6 contributes one spec: `user-extends-active-subscription.spec.ts` covering: user submits → admin approves → user dashboard reflects new expiry → license expires_at matches.

## 10. Migration Plan

Migrations live in the EA repo (existing convention).

1. `2026MMDD000001_create_subscription_extensions_table.sql` — table + 4 indexes.
2. `2026MMDD000002_subscription_expires_at_cascade_trigger.sql` — trigger from §5.2 to push expires_at to child licenses.
3. `2026MMDD000003_extensions_rls_policies.sql` — policies per §5.3.

No backfill — the table starts empty.

## 11. File Layout

### Lib

```
lib/
  subscription-state.ts          EXTEND (canExtendFrom)
  subscription-state.test.ts     EXTEND
  schemas.ts                     EXTEND (extendSubscriptionRequestSchema)
  schemas.test.ts                EXTEND
  expiry.ts                      EXTEND (no changes; regression test)
  email.ts                       EXTEND (sendRequestSubmittedEmail/Approved/Rejected gain a `kind: 'license' | 'extension'` field)
  email.test.ts                  EXTEND
```

### API routes

```
app/api/extensions/
  route.ts                       NEW (POST — user creates pending extension request)
  [id]/route.ts                  NEW (DELETE — user cancels pending; covered by Plan 5: POST [id]/approve and POST [id]/reject)
```

### UI components

```
components/user/
  extend-dialog.tsx              NEW (mirrors RenewDialog; product locked, tier picker)
  extension-status-line.tsx      NEW (small inline element on SubscriptionCard showing "Extension pending — TIER — submitted DATE [Cancel]" or "Last extended DATE")
components/admin/
  pending-extensions-panel.tsx   NEW (Plan 5 — sibling of pending-requests-panel)
```

### Page changes

```
app/dashboard/page.tsx           No change (existing flow still loads getDashboardData; the card just gains an Extend button and a status line)
components/user/subscription-card.tsx   EXTEND (render Extend button when active + no pending extension; render extension-status-line when extension exists)
```

## 12. Open Questions

None blocking. Items deferred to implementation:

- Visual placement of the Extend button — beside or below the slot grid (decided during implementation).
- Whether the "Last extended …" line is shown by default or only on hover/click (UX call).
- Whether email subject lines for extensions need a different prefix from new-license requests (probably yes — admin will sort by it).

## 13. Coverage check

- §6.6 of the roles spec is unchanged. This spec adds §6.7 conceptually as a separate flow.
- Plan 5's admin pending-requests panel (the "approve/reject" UI) is the natural home for extension approvals; this spec defers all admin-UI work to whichever Plan 5 task lands first, and Plan 6 just contributes a sibling component.
- Spec §3 non-goal "no proration" is preserved — there's no proration math here. Extension just adds tier duration to the existing expires_at, which is generous to the user (they keep unused time) but isn't proration.
