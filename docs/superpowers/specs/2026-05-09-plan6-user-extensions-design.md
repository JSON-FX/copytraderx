# Plan 6 — User-Initiated Subscription Extensions — Design

- **Date:** 2026-05-09
- **Status:** Approved (brainstorm + edge-case-analysis complete)
- **Supersedes / refines:** `2026-05-08-subscription-extensions-design.md` (Draft for review). This document folds in the resolutions from the 2026-05-09 brainstorm and edge-case analysis.
- **Builds on:** Plan 5 — Admin Requests, Admin-Direct Subscription Create, Cron Expiry, Revoke, Reattach, E2E (`/admin/requests` page, revoke handler, cron expiry job, state-machine guards).

## 1. Problem (recap)

Plan 4's only renewal path is **replacement**: a user whose subscription has expired or been revoked clicks Renew, which inserts a fresh `pending` subscription. That works for post-expiry but produces three real UX gaps for **pre-expiry**: a service-interruption window, MT5 re-entry friction, and no way to change tier without lapsing.

Plan 6 adds the **pre-expiry extension** flow: extend the existing subscription row in place, preserving slots and child licenses, with full audit history.

Mid-cycle tier downgrade and proration are explicitly out of scope.

## 2. Decisions (resolving open questions)

| Question | Decision |
|---|---|
| Migration phasing | **Single up-front batch** — table + 4 indexes + RLS + cascade trigger ship together in one migration sequence; code lands behind that. |
| Pending extension on `active → revoked` | **Auto-reject in revoke handler**, same shape as cron expiry sweep, idempotent via `WHERE status='pending'` clause. |
| Email shape | **Shared sender + `kind: 'license' \| 'extension'` field**; subject prefix `[Extension]` vs `[New License]`; one template body that branches on `kind`. |
| Extend button visibility | **Always visible on `active` cards**, no time-to-expiry gate. Admin rejects premature requests by hand if needed. |
| Trigger predicate | **Forward-only** — trigger fires only when `NEW.expires_at > OLD.expires_at`; admin policy edits that shrink expiry don't cascade. |
| `subscription_id` referential action | **`ON DELETE RESTRICT`** — preserve audit history; admin can't hard-delete a subscription with extension rows. |
| `rejection_reason` shape | **Split into `rejection_code` (machine) + `rejection_message` (human copy)**. |
| Tier downgrade enforcement | **API + schema validation** via `canExtendToTier(source, requestedTier)` using `tierRank()` (`monthly < quarterly < yearly`). UI hides invalid tiers; API rejects with 422 `tier_downgrade_not_allowed` as backstop. |
| Forward-only expiry guard | API approve handler asserts `calculateExpiresAt(requestedTier, source.expires_at) > now()`; on race-failure, triggers same auto-reject path (`source_expired_before_approval`). |
| Source-active guard | Approve handler uses `UPDATE subscriptions ... WHERE status='active'` and checks rowcount; zero rows → throw → audit row stays `pending`. |
| Dashboard data loading | Single batched query keyed by `user_id` joining `subscription_extensions`, grouped in JS — no N+1. |

## 3. Non-goals (v1)

- Mid-cycle tier downgrade.
- Proration credits.
- Auto-renewal / recurring billing.
- Cross-product extension (different product = new subscription).
- Eligibility windows (always-allowed while active).
- Stacking — only one pending extension per source at a time.
- Admin "approve at a different tier than requested" — schema can be extended later if needed.

## 4. Architecture

### 4.1 Two writers, one row

`subscriptions` now has two distinct write paths, gated by source status:

- **Replacement renewal** (Plan 4) — used when source is `expired | revoked`. Inserts a NEW `subscriptions{status='pending'}` row. On approval, the new row flips to `active`. The expired source stays as immutable history. Helper: `canRenewFrom`.
- **In-place extension** (Plan 6) — used when source is `active`. Inserts a row in `subscription_extensions{status='pending'}`. On approval, source's `expires_at` and `tier` are updated; extension row is stamped `approved` for audit. Helper: `canExtendFrom`.

UI presents Renew on `expired/revoked` cards and Extend on `active` cards. The two paths never collide because the helpers are mutually exclusive on status.

### 4.2 Why an extensions table

Updating `subscriptions.expires_at` and `tier` directly destroys history. We can't answer "what tier was this between dates X and Y" or "how many extensions did this user request". The `subscription_extensions` table records every request and stamps the deltas (`old_tier`, `new_tier`, `old_expires_at`, `new_expires_at`) at approval time, so audit survives even if the source is later revoked.

### 4.3 Cascade trigger — forward-only

A new trigger fires `AFTER UPDATE OF expires_at ON public.subscriptions` and pushes the new `expires_at` to all child `licenses` rows **only when `NEW.expires_at > OLD.expires_at`**. Forward shifts cascade; backward shifts don't (admin must set license expiry separately if shrinking is intended).

This trigger fires on a different column than Plan 5's status-cascade trigger (`AFTER UPDATE OF status`), so trigger ordering is non-overlapping and safe.

### 4.4 No EA contract change

The EA reads `licenses.expires_at` per-license. The cascade trigger keeps that in sync with the parent subscription on extension approval. Zero EA-side change.

## 5. Data model

### 5.1 New table: `public.subscription_extensions`

```sql
create table public.subscription_extensions (
  id                  bigserial primary key,
  subscription_id     bigint  not null references public.subscriptions(id) on delete restrict,
  user_id             uuid    not null references public.users(id) on delete cascade,
  requested_tier      text    not null check (requested_tier in ('monthly','quarterly','yearly')),
  status              text    not null check (status in ('pending','approved','rejected')),
  requested_at        timestamptz not null default now(),
  approved_at         timestamptz,
  approved_by         uuid    references public.users(id),
  rejection_code      text,    -- machine: source_expired_before_approval | source_revoked_before_approval | admin_manual
  rejection_message   text,    -- human copy surfaced to user
  -- Snapshot at approval time so audit survives later mutation/revocation of source.
  old_tier            text,
  new_tier            text,
  old_expires_at      timestamptz,
  new_expires_at      timestamptz,
  notes               text,
  created_at          timestamptz not null default now()
);

create index idx_extensions_user      on public.subscription_extensions(user_id, status);
create index idx_extensions_pending   on public.subscription_extensions(status) where status = 'pending';
create index idx_extensions_source    on public.subscription_extensions(subscription_id, status);

-- One pending per source.
create unique index idx_extensions_one_pending_per_source
  on public.subscription_extensions(subscription_id)
  where status = 'pending';
```

Snapshot columns are null while `pending` and stamped at approval time. `rejection_*` columns are null until rejection.

### 5.2 Cascade trigger

```sql
create or replace function cascade_subscription_expires_at_to_licenses()
returns trigger
language plpgsql
as $$
begin
  if new.expires_at is distinct from old.expires_at and new.expires_at > old.expires_at then
    update public.licenses
       set expires_at = new.expires_at
     where subscription_id = new.id;
  end if;
  return null;
end
$$;

create trigger trg_subscription_expires_at_cascade
  after update of expires_at on public.subscriptions
  for each row
  execute function cascade_subscription_expires_at_to_licenses();
```

### 5.3 Approval transaction

Runs in a single transaction:

1. Validate `canExtendFrom(source) === true` AND `canExtendToTier(source.tier, ext.requested_tier) === true`.
2. Compute `new_expires_at = calculateExpiresAt(ext.requested_tier, source.expires_at)`. Assert `new_expires_at > now()` — else throw and trigger auto-reject path with `rejection_code = 'source_expired_before_approval'`.
3. `UPDATE subscriptions SET expires_at=$new, tier=$new WHERE id=$src AND status='active'` — check rowcount === 1, else throw 409 `source_not_active`.
4. Trigger from §5.2 cascades new `expires_at` to child licenses (forward-only — guaranteed by §5.2 condition).
5. `UPDATE subscription_extensions SET status='approved', approved_at=now(), approved_by=$admin, old_tier=$srcOldTier, new_tier=$req, old_expires_at=$srcOldExp, new_expires_at=$new WHERE id=$ext AND status='pending'` — rowcount === 1.

Any throw rolls back the whole transaction. The audit row stays `pending` if approval fails; no corrupt-audit window.

### 5.4 RLS

- `subscription_extensions`:
  - `SELECT`: user where `user_id = auth.uid()`; admin: full.
  - `INSERT`: user with `user_id = auth.uid()`, `status = 'pending'`, `subscription_id` referencing a row they own.
  - `DELETE`: user where `user_id = auth.uid() AND status = 'pending'`; admin: full.
  - `UPDATE`: admin only.

### 5.5 One-pending-per-source

Enforced by `idx_extensions_one_pending_per_source`. INSERT conflict surfaces `extension_already_pending` (constraint name encoded into API error). UI handles it explicitly (§6.1).

### 5.6 Computing `new_expires_at`

```ts
new_expires_at = calculateExpiresAt(requested_tier, old_expires_at)
```

`calculateExpiresAt(tier, from)` already exists in `lib/expiry.ts`. Adding `requested_tier`'s duration to the `from` date is the user-generous behavior — they keep unused time. Same-tier extension is allowed; tier downgrades are rejected before reaching this function (§5.7).

### 5.7 Tier rules

```ts
const tierRank = { monthly: 1, quarterly: 2, yearly: 3 } as const

function canExtendToTier(sourceTier: Tier, requestedTier: Tier): boolean {
  return tierRank[requestedTier] >= tierRank[sourceTier]
}
```

Validation lives in `extendSubscriptionRequestSchema` (refines on the body) and is re-checked in the API approve handler as a backstop. UI's `<TierPicker>` filters out below-source options.

## 6. User flows

### 6.1 Submit extension

1. On `/dashboard`, every `active` subscription card shows an **Extend** button always (no time gate). Button is disabled when an extension `pending` for that source already exists.
2. Click Extend → `<ExtendDialog>`:
   - Product: read-only, locked from source.
   - Tier: picker pre-filled from source; only same-or-higher tiers selectable (§5.7).
   - Notes: optional free-text.
3. Submit → `POST /api/extensions` validated by `extendSubscriptionRequestSchema`. Server checks `canExtendFrom(source)`, `canExtendToTier(...)`, inserts the row.
4. On success: dashboard card shows the inline `<ExtensionStatusLine>`: *"Extension pending — yearly — submitted 2026-05-09  [Cancel]"*.
5. On 409 `extension_already_pending`: dialog shows inline error *"You already have a pending extension. Cancel it first."* with a **Cancel pending** action that calls DELETE on the existing pending row (UI awaits the response before re-enabling Submit).
6. Email: `sendRequestSubmittedEmail({ kind: 'extension', ... })` fires to admin with subject prefix `[Extension]`.

### 6.2 User cancels pending

`DELETE /api/extensions/[id]` — owned-by-caller, `status='pending'` only. Idempotent — second delete returns 404.

### 6.3 Admin approve

Plan 5's `/admin/requests` page grows a sibling section: **Pending Extensions** (`<PendingExtensionsPanel>`). Each row shows user, source (product + current tier + current expires_at), requested tier, requested_at, notes, plus Approve / Reject.

- **Approve** → `POST /api/extensions/[id]/approve` runs the §5.3 transaction. On success: `sendRequestApprovedEmail({ kind: 'extension', ... })` to user.
- **Reject** → modal asks for `rejection_message` (1–500 chars) → `POST /api/extensions/[id]/reject` flips to `rejected` with `rejection_code='admin_manual'` and the typed message → `sendRequestRejectedEmail({ kind: 'extension', rejectionCopy: message, ... })`.

### 6.4 What user sees after approval

The card's `expires` line updates to the new date. Slot claims, MT5 numbers, license keys — unchanged. Journal continues uninterrupted. The status line shows *"Last extended 2026-05-09 (monthly → yearly)"*.

### 6.5 Auto-reject on source-status change (cron sweep + revoke handler)

If a source goes `active → expired` (cron) or `active → revoked` (admin), pending extensions on that source must be auto-rejected. Both writers use the same idempotent shape:

```sql
update public.subscription_extensions
   set status='rejected',
       rejection_code = $code,
       rejection_message = $message    -- copy lookup, see §6.6
 where subscription_id = $src
   and status = 'pending';
```

The `WHERE status='pending'` predicate makes both writes safe to fire in any order on the same source — second writer is a no-op.

- **Cron expiry sweep** (`scripts/expire-subscriptions.ts` + pg_cron): after flipping `subscriptions.status` to `expired`, runs the auto-reject with `rejection_code='source_expired_before_approval'`.
- **Revoke handler** (`PATCH /api/subscriptions/[id]` revoke action, Plan 5): runs the auto-reject in the same transaction with `rejection_code='source_revoked_before_approval'`.

Both fire `sendRequestRejectedEmail({ kind: 'extension', ... })` per affected user.

### 6.6 Rejection copy mapping

```ts
const rejectionCopy: Record<Exclude<RejectionCode, 'admin_manual'>, string> = {
  source_expired_before_approval:
    "Your subscription expired before we could approve your extension. Submit a fresh renewal from your dashboard.",
  source_revoked_before_approval:
    "This subscription was revoked before the extension could be approved. Contact support if you believe this is an error.",
}
```

For `admin_manual`, the email body uses the stored `rejection_message` verbatim. For the other codes, the lookup above provides the user-facing copy and the message is also persisted into `rejection_message` at write time so the audit row carries the same text shown to the user. Lookup lives in `lib/email.ts`.

## 7. Error handling and edge cases

### 7.1 Eligibility

- **Source not active at submit:** `canExtendFrom` returns false → 409 `subscription_not_active`. UI hides Extend button on non-active cards.
- **Existing pending extension:** unique-index violation → 409 `extension_already_pending`. UI surfaces Cancel-pending recovery (§6.1.5).
- **Tier downgrade requested:** schema rejects → 422 `tier_downgrade_not_allowed`. UI hides invalid tiers from picker.

### 7.2 Race conditions

- **Two admins approve same extension:** approve transaction's `WHERE status='pending'` rowcount check on the audit row + `WHERE status='active'` on the source row guarantee whichever commits second sees zero rows → 409 `concurrent_modification`.
- **Source just expired between request and approve:** approve handler's `new_expires_at > now()` guard fails → throws → handler catches and runs the auto-reject path with `source_expired_before_approval`. Extension transitions to `rejected` cleanly; user gets the cron-style email even though it was triggered by approval-time race.
- **Source revoked between request and approve:** §5.3 step 3 finds zero rows → throws 409 `source_not_active`. Admin sees error; revoke handler's auto-reject (§6.5) had already cleaned up the audit row in its own transaction.
- **Cron + revoke both fire on same source:** §6.5 predicate makes both idempotent — whichever runs second finds 0 rows, no-op.
- **User cancel + immediate re-submit:** UI awaits cancel HTTP response before re-enabling Extend, so unique-index violation only happens on rapid double-click; in that case 409 surfaces with the Cancel-pending recovery (§6.1.5).

### 7.3 Trigger interactions

The cascade trigger (§5.2) fires `AFTER UPDATE OF expires_at`. Plan 5's status-cascade trigger fires `AFTER UPDATE OF status`. Different columns → no ordering collision. The cascade trigger's `WHEN NEW.expires_at > OLD.expires_at` predicate prevents shrinks from cascading, so admin policy edits (Plan 5's `<SubscriptionPolicyForm>`) that shorten `expires_at` intentionally don't touch child licenses.

## 8. State machine

```
extensions:
  pending → approved   (admin approve)
  pending → rejected   (admin reject | cron expiry sweep | revoke handler)
  pending → deleted    (user cancel)
```

`canExtendFrom(source) = source.status === 'active'`.
`canExtendToTier(sourceTier, requestedTier) = tierRank[requestedTier] >= tierRank[sourceTier]`.
Both live in `lib/subscription-state.ts`.

## 9. Testing

### 9.1 Unit

- `lib/subscription-state.ts` — `canExtendFrom` exhaustive across all 5 statuses; `tierRank` ordering; `canExtendToTier` 9-cell table.
- `lib/schemas.ts` — `extendSubscriptionRequestSchema` (subscription_id, requested_tier, notes; downgrade refinement).
- `lib/expiry.ts` — `calculateExpiresAt(tier, future_date)` regression test.
- `lib/email.ts` — `kind: 'license' | 'extension'` subject prefix branching; rejection-code → copy mapping including `admin_manual` passthrough.

### 9.2 Integration

- `POST /api/extensions` — happy path; source-not-active 409; existing-pending 409; downgrade 422.
- `POST /api/extensions/[id]/approve` — happy path; transaction rolls back when source revoked mid-flight; child licenses' `expires_at` matches new source `expires_at` after approval; `new_expires_at <= now()` race triggers auto-reject path.
- `POST /api/extensions/[id]/reject` — happy path; admin reason captured.
- `DELETE /api/extensions/[id]` — owner only; pending only; admin can delete any.
- Trigger forward-only: shrink `subscriptions.expires_at` by direct UPDATE → child licenses unchanged. Grow it → children match.
- Auto-reject idempotency: cron-then-revoke and revoke-then-cron both leave the audit row in `rejected` state with the **first** writer's `rejection_code`.

### 9.3 Playwright

`user-extends-active-subscription.spec.ts`: user submits extension → admin approves on `/admin/requests` → user dashboard reflects new expiry → child license `expires_at` matches.

## 10. Migration plan

Migrations land in the EA repo (existing convention). One up-front batch before code, three files shipped together:

1. `20260509000001_create_subscription_extensions.sql` — table, 4 indexes (incl. `idx_extensions_one_pending_per_source`), CHECK constraints.
2. `20260509000002_subscription_expires_at_cascade.sql` — trigger function + AFTER UPDATE OF expires_at trigger.
3. `20260509000003_subscription_extensions_rls.sql` — policies per §5.4.

The three migrations are deployed in one push (`supabase db push`) before any application-code commit lands. No backfill — table starts empty.

## 11. File layout

### Lib

```
lib/
  subscription-state.ts            EXTEND  (canExtendFrom, tierRank, canExtendToTier)
  subscription-state.test.ts       EXTEND
  schemas.ts                       EXTEND  (extendSubscriptionRequestSchema)
  schemas.test.ts                  EXTEND
  expiry.ts                        no change (regression test only)
  email.ts                         EXTEND  (kind field on 3 senders; rejectionCopy lookup)
  email.test.ts                    EXTEND
  dashboard-data.ts                EXTEND  (single batched query joining subscription_extensions)
```

### API routes

```
app/api/extensions/
  route.ts                         NEW  (POST submit)
  [id]/route.ts                    NEW  (DELETE cancel)
  [id]/approve/route.ts            NEW  (POST admin approve)
  [id]/reject/route.ts             NEW  (POST admin reject)

app/api/subscriptions/[id]/route.ts
                                   EXTEND  (revoke action — auto-reject pending extensions in same tx)
```

### UI components

```
components/user/
  extend-dialog.tsx                NEW
  extension-status-line.tsx        NEW
  subscription-card.tsx            EXTEND  (Extend button render gate; status line render)

components/admin/
  pending-extensions-panel.tsx     NEW  (sibling on /admin/requests)

app/admin/requests/page.tsx        EXTEND  (mount PendingExtensionsPanel below existing requests)
```

### Scripts

```
scripts/expire-subscriptions.ts    EXTEND  (sweep step: auto-reject pending extensions for newly-expired sources)
```

## 12. Known limitations / accepted risks (v1)

These are intentional v1 trade-offs, documented for future revisits:

- **Two-tab submit race** surfaces as the same generic 409 error as the unique-index violation; user retries from the second tab and sees the standard "you already have a pending extension" recovery path.
- **Same-tier extension** is allowed (e.g. monthly → monthly); admin can hand-reject if it appears to be unintended.
- **Stockpiling**: a user can repeatedly submit and have approved extensions pushing expiry years out; admin approval is the only control.
- **Mail-filter retraining**: admin's existing inbox filters keyed on subject lines may need updating once `[Extension]` prefix ships.
- **Admin "approve at different tier"** is not supported — the audit table has the columns but the API explicitly doesn't permit it. Future spec if needed.
- **Hard-deleting a subscription** with extension history fails (`ON DELETE RESTRICT`); admin must clear extension rows first or revoke instead.

## 13. Coverage check

- §6.6 of the parent roles spec is unchanged. This plan adds a parallel pre-expiry path.
- Plan 5's `/admin/requests` page is the natural mount point for the admin approval UI; Plan 6 contributes a sibling panel.
- §3 non-goal "no proration" is preserved — adding tier duration to the existing expires_at is generous-to-user but not proration math.
- §3 non-goal "no downgrade" is enforced by `canExtendToTier` at schema, API, and UI levels.
