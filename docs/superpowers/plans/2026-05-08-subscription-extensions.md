# Subscription Extensions — Implementation Plan (Plan 6)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the user extend an `active` subscription before it expires. User submits an extension request (product locked, tier picker), admin approves, and the **same** subscription row's `expires_at` and `tier` update in place — preserving slot claims, license keys, and journal data.

**Architecture:** Adds a `subscription_extensions` audit table that records every extension request and snapshots the deltas at approval time. Approval runs a single transaction that updates the source subscription's `expires_at` (computed as `old_expires_at + new_tier_duration`) and `tier`, with a new trigger cascading the new `expires_at` to all child licenses. UI gains an Extend dialog (mirrors the existing Renew dialog) on active cards plus a small status line for pending/last extension. The admin pending-requests panel (built in Plan 5) gains a sibling Pending Extensions section.

**Tech Stack:** Next.js 16 + React 19 + Supabase Auth + `@supabase/ssr` + Zod + Jest + shadcn/ui (existing). No new runtime dependencies.

**Spec:** `docs/superpowers/specs/2026-05-08-subscription-extensions-design.md`. Spec amends `2026-05-06-admin-client-roles-design.md` §6.6 with a new §6.7 in spirit; the source spec stays unchanged.

**Branch:** `feat/subscription-extensions` (NEW — Plan 6 starts on a fresh branch off `main` after Plan 5 merges). Do **not** start this plan on `feat/admin-client-roles` — Plan 5 is closing that branch.

**Prerequisites:**
- Plan 5 ✅ complete and merged to main (admin pending-requests panel, approve/reject API + UI, cron expiry, admin revoke, email senders for approve/reject all wired).
- The `licenses` table's `expires_at` cascade trigger from Plan 2 is in place.
- The user dashboard's product-grouped UI (Plan 4 addendum) is on main.

Confirm with `git log main --oneline | grep -i "plan 5"` that Plan 5 close-out is in main before starting.

---

## Resuming this plan in a new session

Same protocol as Plans 1–5:

1. Confirm branch: `git branch --show-current` → `feat/subscription-extensions`.
2. Find the first unchecked `- [ ]` step in this file.
3. Verify the previous task's commit landed: `git log --oneline -10`.
4. Read the **Status** block immediately below.
5. Each completed step flips its `- [ ]` to `- [x]` **in the same commit** as the code change.
6. **Never** delete checked-off steps. Append a **Correction** sub-section if a step needs to change after being checked.

---

## Status

> **Updated by the executor after each completed task. Single source of truth for "what's done."**

- **Last completed:** _none yet_
- **Last completed commit:** _(filled by commit)_
- **Next task to execute:** Task 1 — `canExtendFrom` in `lib/subscription-state.ts`
- **Plan version:** 1.0

---

## File Structure

| Path | Action | Responsibility |
|---|---|---|
| `lib/subscription-state.ts` | Modify | Add `canExtendFrom(s): GuardResult` returning `{ ok: true }` only when `s.status === 'active'`. |
| `lib/subscription-state.test.ts` | Modify | Cover the new helper across all 5 SubscriptionStatus values. |
| `lib/schemas.ts` | Modify | Add `extendSubscriptionRequestSchema` (`subscription_id`, `requested_tier`, `notes?`). |
| `lib/schemas.test.ts` | Modify | Cover valid + invalid extension requests. |
| `lib/types.ts` | Modify | Add `SubscriptionExtension` interface mirroring the new table. |
| `lib/expiry.ts` | _no change_ | The existing `calculateExpiresAt(tier, from)` already does the right thing when `from` is a future date. Verify with a regression test in Task 4. |
| `lib/expiry.test.ts` | Modify | Add regression test: `calculateExpiresAt('yearly', futureDate)` returns `futureDate + 12 months`. |
| `lib/email.ts` | Modify | Add a `kind?: 'license' \| 'extension'` field to the three email senders' input types so admin/user emails can distinguish the request type. Subject lines reflect kind. |
| `lib/email.test.ts` | Modify | Cover both kinds for each sender. |
| `~/Documents/development/EA/JSONFX-IMPULSE/supabase/migrations/2026MMDD000001_create_subscription_extensions_table.sql` | Create | `subscription_extensions` table + 4 indexes (per spec §5.1). |
| `~/Documents/development/EA/JSONFX-IMPULSE/supabase/migrations/2026MMDD000002_subscription_expires_at_cascade_trigger.sql` | Create | Trigger that cascades `subscriptions.expires_at` updates to child `licenses.expires_at` (per spec §5.2). |
| `~/Documents/development/EA/JSONFX-IMPULSE/supabase/migrations/2026MMDD000003_extensions_rls_policies.sql` | Create | RLS policies per spec §5.3. |
| `app/api/extensions/route.ts` | Create | `POST` — user creates pending extension. Validates with `extendSubscriptionRequestSchema`. Server confirms source ownership + `canExtendFrom`. Inserts `subscription_extensions{status:'pending'}`. Sends admin email with `kind:'extension'`. |
| `app/api/extensions/[id]/route.ts` | Create | `DELETE` — user cancels owned pending. |
| `app/api/extensions/[id]/approve/route.ts` | Create | `POST` admin-only — runs the transaction from spec §5.2: update subscription `(expires_at, tier)`, stamp the extension row's audit fields. Sends user email with `kind:'extension'`. |
| `app/api/extensions/[id]/reject/route.ts` | Create | `POST` admin-only — flips to rejected, stores reason, sends user email. |
| `components/user/extend-dialog.tsx` | Create | Client dialog mirroring `RenewDialog` but talks to `/api/extensions`. Tier picker pre-filled from source. |
| `components/user/extension-status-line.tsx` | Create | Small inline element rendered inside `SubscriptionCard` showing either "Extension pending — TIER — submitted DATE [Cancel]" or "Last extended DATE (OLD_TIER → NEW_TIER)" or nothing. |
| `components/user/subscription-card.tsx` | Modify | Render Extend button on active cards when no pending extension; embed `<ExtensionStatusLine>` below the slot grid; consumer (`ProductGroupCard`) needs no change. |
| `components/admin/pending-extensions-panel.tsx` | Create | Sibling of Plan 5's pending-requests panel. Lists pending extensions with Approve/Reject buttons. |
| `app/admin/licenses/page.tsx` | Modify | Plan 5 adds the pending-requests panel here; Plan 6 adds the pending-extensions panel beside it (responsive: stacks below on small screens). |
| `lib/dashboard-data.ts` | Modify | Loader joins `subscription_extensions` so `DashboardSubscription` carries any pending or most-recent approved extension for inline rendering. |
| `lib/types.ts` | Modify | `DashboardSubscription` gains optional `pendingExtension: SubscriptionExtension \| null` and `lastApprovedExtension: SubscriptionExtension \| null`. |
| `e2e/user-extends-active-subscription.spec.ts` | Create | Playwright spec wired into Plan 5's harness. |
| `docs/superpowers/plans/2026-05-08-subscription-extensions.md` | Modify (each task) | Flip `- [ ]` → `- [x]` and update Status. |

We are **not** touching: the renewal flow from Plan 4 (`/api/subscriptions/renew` and `RenewDialog`); the synthetic-subscription branch in admin-direct license create; or the EA's license-validation contract (the EA reads `licenses.expires_at` and that's it — Plan 6 just keeps that value fresh).

---

## Conventions

Same as Plans 1–5:
- **Each step is its own commit** unless explicitly grouped.
- Conventional-commit messages with `Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>` trailer.
- Plan-file checkbox flips happen in the same commit as the code change.
- Tests-first for pure logic (`lib/subscription-state.ts`, `lib/schemas.ts`, `lib/expiry.ts` regression).
- Manual verification in browser at `copytraderx.local` after `docker compose up -d --build` for every UI surface.

---

## Task 1: `canExtendFrom` (TDD)

**Files:**
- Modify: `lib/subscription-state.ts`
- Modify: `lib/subscription-state.test.ts`

- [ ] **Step 1: Failing test**

In `lib/subscription-state.test.ts`, add:

```ts
import { canExtendFrom } from "./subscription-state";

describe("canExtendFrom", () => {
  it("allows extend on active", () => {
    expect(canExtendFrom({ status: "active" }).ok).toBe(true);
  });
  it.each(["pending", "rejected", "expired", "revoked"] as const)(
    "blocks extend on %s",
    (status) => {
      const r = canExtendFrom({ status });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.reason).toBe("subscription_not_active");
    },
  );
});
```

- [ ] **Step 2: Implement**

In `lib/subscription-state.ts`, add (next to `canCancel`/`canClaimOn`/`canRenewFrom`):

```ts
export function canExtendFrom(s: { status: SubscriptionStatus }): GuardResult {
  if (s.status === "active") return { ok: true };
  return { ok: false, reason: "subscription_not_active" };
}
```

Note the reason string `subscription_not_active` matches the existing `canClaimOn` convention so the UI can share copy.

- [ ] **Step 3: Type-check + commit**

```bash
pnpm tsc --noEmit && pnpm test
git add lib/subscription-state.ts lib/subscription-state.test.ts docs/superpowers/plans/2026-05-08-subscription-extensions.md
git commit
```

Commit message: `feat(subscriptions): add canExtendFrom guard`

---

## Task 2: `extendSubscriptionRequestSchema`

**Files:**
- Modify: `lib/schemas.ts`
- Modify: `lib/schemas.test.ts`

- [ ] **Step 1: Failing test** (3 cases — valid, missing subscription_id, invalid tier)

- [ ] **Step 2: Implement**

```ts
export const extendSubscriptionRequestSchema = z
  .object({
    subscription_id: z.number().int().positive(),
    requested_tier: tierEnum,
    notes: z.string().max(500).optional(),
  })
  .strict();

export type ExtendSubscriptionRequestInput = z.infer<typeof extendSubscriptionRequestSchema>;
```

- [ ] **Step 3: Commit**

Commit message: `feat(schemas): add extendSubscriptionRequestSchema`

---

## Task 3: `SubscriptionExtension` type

**Files:**
- Modify: `lib/types.ts`

- [ ] **Step 1: Add type matching the spec §5.1 table.**

```ts
export type SubscriptionExtensionStatus = "pending" | "approved" | "rejected";

export interface SubscriptionExtension {
  id: number;
  subscription_id: number;
  user_id: string;
  requested_tier: LicenseTier;
  status: SubscriptionExtensionStatus;
  requested_at: string;
  approved_at: string | null;
  approved_by: string | null;
  rejection_reason: string | null;
  old_tier: LicenseTier | null;
  new_tier: LicenseTier | null;
  old_expires_at: string | null;
  new_expires_at: string | null;
  notes: string | null;
  created_at: string;
}
```

- [ ] **Step 2: Commit.** Message: `feat(types): add SubscriptionExtension interface`

---

## Task 4: Regression test on `calculateExpiresAt`

**Files:**
- Modify: `lib/expiry.test.ts`

- [ ] **Step 1: Add test**

```ts
it("calculateExpiresAt('yearly', future date) returns future + 12 months", () => {
  const future = new Date("2026-06-08T00:00:00Z");
  expect(calculateExpiresAt("yearly", future).toISOString()).toBe(
    new Date("2027-06-08T00:00:00Z").toISOString()
  );
});
```

- [ ] **Step 2: Run** `pnpm test lib/expiry.test.ts`. Expect **pass on first run** — the helper already does this; this is a regression guard for Plan 6's invariant.

- [ ] **Step 3: Commit.** Message: `test(expiry): regression — calculateExpiresAt accepts future from-date for extensions`

---

## Task 5: DB migration — `subscription_extensions` table

**Files:**
- Create: `~/Documents/development/EA/JSONFX-IMPULSE/supabase/migrations/2026MMDD000001_create_subscription_extensions_table.sql`

- [ ] **Step 1: Write the migration** (full SQL per spec §5.1, including all 4 indexes).
- [ ] **Step 2: `supabase db push` (or apply manually) to dev project.**
- [ ] **Step 3: Verify in Studio:** table exists with the 4 indexes, the partial unique on `subscription_id where status='pending'` is enforced (insert two pending rows for the same subscription should fail).
- [ ] **Step 4: Commit (in EA repo).** Message: `feat(db): create subscription_extensions audit table`

---

## Task 6: DB migration — `expires_at` cascade trigger

**Files:**
- Create: `~/Documents/development/EA/JSONFX-IMPULSE/supabase/migrations/2026MMDD000002_subscription_expires_at_cascade_trigger.sql`

- [ ] **Step 1: Write the trigger.** On `update of expires_at on public.subscriptions`, when `new.expires_at > old.expires_at` (or `old.expires_at is null`), update all `licenses.expires_at` where `subscription_id = new.id` to match.
- [ ] **Step 2: Apply.**
- [ ] **Step 3: Verify:** manually `update subscriptions set expires_at = now() + interval '90 days' where id = X`; confirm child licenses' `expires_at` updated. Then revert.
- [ ] **Step 4: Commit (in EA repo).** Message: `feat(db): trigger to cascade subscription.expires_at to licenses`

---

## Task 7: DB migration — RLS policies for extensions

**Files:**
- Create: `~/Documents/development/EA/JSONFX-IMPULSE/supabase/migrations/2026MMDD000003_extensions_rls_policies.sql`

- [ ] **Step 1: Write policies per spec §5.3.**
- [ ] **Step 2: Apply.**
- [ ] **Step 3: Commit (in EA repo).** Message: `feat(db): RLS policies for subscription_extensions`

---

## Task 8: Email senders gain `kind` field

**Files:**
- Modify: `lib/email.ts`
- Modify: `lib/email.test.ts`

- [ ] **Step 1: Update input types.**

```ts
export type RequestSubmittedEmailInput = {
  to: string;
  user_email: string;
  product_label: string;
  tier_label: string;
  notes: string | null;
  kind?: "license" | "extension"; // default "license"
};
```

Same for `RequestApprovedEmailInput` and `RequestRejectedEmailInput`.

- [ ] **Step 2: Subject + body branch on `kind`.**

For `kind: "extension"`:
- Submitted: `"Extension request: <product_label> (<tier_label>)"`
- Approved: `"Extension approved: <product_label>"`
- Rejected: `"Extension request not approved: <product_label>"`

For `kind: "license"` (default), keep the existing copy (matches Plan 4 + Plan 5).

- [ ] **Step 3: Tests** — extend existing tests to cover both kinds for each sender.

- [ ] **Step 4: Commit.** Message: `feat(email): add kind field to differentiate license vs extension subjects`

---

## Task 9: `POST /api/extensions` — user creates pending

**Files:**
- Create: `app/api/extensions/route.ts`

- [ ] **Step 1: Implement.** Pattern matches `/api/subscriptions/renew` (Plan 4 commit `6120e89`):
  1. SSR auth → 401.
  2. `extendSubscriptionRequestSchema.safeParse` → 400.
  3. Fetch source subscription; 404 if missing OR not owned.
  4. `canExtendFrom` → 409 with reason.
  5. Insert `subscription_extensions{status:'pending', ...}`. The unique-pending-per-source index will surface as `error.code === '23505'` → 409 `extension_already_pending`.
  6. Email admin with `kind:'extension'`.
  7. 201 with `{ extension: data }`.

- [ ] **Step 2: Commit.** Message: `feat(api): POST /api/extensions — user creates pending extension request`

---

## Task 10: `DELETE /api/extensions/[id]` — user cancels

**Files:**
- Create: `app/api/extensions/[id]/route.ts`

- [ ] **Step 1: Implement.** Mirror `/api/subscriptions/[id]` DELETE. Use `canCancel`-like logic (only `pending` is cancellable; we can either add `canCancelExtension` or reuse `canCancel` since the shape matches — prefer adding `canCancelExtension` for clarity).
- [ ] **Step 2: Commit.** Message: `feat(api): DELETE /api/extensions/[id] — user cancels pending extension`

---

## Task 11: `POST /api/extensions/[id]/approve` — admin approves

**Files:**
- Create: `app/api/extensions/[id]/approve/route.ts`

- [ ] **Step 1: Implement** the transaction from spec §5.2.

Use a Postgres function (preferred) so the entire approval is one round-trip:

```sql
create or replace function approve_extension(p_extension_id bigint, p_admin_id uuid)
returns table(extension_id bigint, new_expires_at timestamptz)
language plpgsql security definer
as $$
declare
  v_ext record;
  v_sub record;
  v_new_expires timestamptz;
begin
  select * into v_ext from subscription_extensions where id = p_extension_id and status = 'pending' for update;
  if not found then raise exception 'extension_not_pending'; end if;

  select * into v_sub from subscriptions where id = v_ext.subscription_id and status = 'active' for update;
  if not found then raise exception 'subscription_not_active'; end if;

  v_new_expires := add_tier_duration(v_ext.requested_tier, v_sub.expires_at);

  update subscriptions set tier = v_ext.requested_tier, expires_at = v_new_expires where id = v_sub.id;

  update subscription_extensions
    set status = 'approved',
        approved_at = now(),
        approved_by = p_admin_id,
        old_tier = v_sub.tier,
        new_tier = v_ext.requested_tier,
        old_expires_at = v_sub.expires_at,
        new_expires_at = v_new_expires
    where id = v_ext.id;

  return query select v_ext.id, v_new_expires;
end;
$$;
```

`add_tier_duration(text, timestamptz)` is already defined (used by Plan 2 / Plan 5 status cascades). If not, write a tiny SQL function alongside.

The Next.js handler then `rpc('approve_extension', { p_extension_id, p_admin_id })`, surfaces typed errors, and emails the user with `kind:'extension'`.

Add a 4th migration if `approve_extension` is new: `2026MMDD000004_approve_extension_function.sql`.

- [ ] **Step 2: Commit.** Message: `feat(api): POST /api/extensions/[id]/approve — admin approves extension`

---

## Task 12: `POST /api/extensions/[id]/reject` — admin rejects

**Files:**
- Create: `app/api/extensions/[id]/reject/route.ts`

- [ ] **Step 1: Implement.** Validate body has `rejection_reason: string` (Zod). Update extension to `rejected` with reason. Email user with `kind:'extension'`.
- [ ] **Step 2: Commit.** Message: `feat(api): POST /api/extensions/[id]/reject — admin rejects extension`

---

## Task 13: Cron sweep — auto-reject pending extensions on source expiry

**Files:**
- Modify: the existing Plan 5 expiry cron / Edge Function (whichever Plan 5 lands).

- [ ] **Step 1:** After flipping a subscription to `expired`, run:
  ```sql
  update subscription_extensions
    set status = 'rejected',
        rejection_reason = 'source_expired_before_approval'
    where subscription_id = $1 and status = 'pending';
  ```
- [ ] **Step 2:** Emit a `sendRequestRejectedEmail` (with `kind:'extension'`) for each affected extension.
- [ ] **Step 3: Commit (in EA repo if cron lives there, else here).** Message: `feat(cron): auto-reject pending extensions when source expires`

---

## Task 14: `lib/dashboard-data.ts` joins extensions

**Files:**
- Modify: `lib/dashboard-data.ts`
- Modify: `lib/types.ts`

- [ ] **Step 1:** Extend `DashboardSubscription` with:

```ts
export interface DashboardSubscription {
  subscription: Subscription;
  liveLicense: License | null;
  demoLicense: License | null;
  pendingExtension: SubscriptionExtension | null;
  lastApprovedExtension: SubscriptionExtension | null;
}
```

- [ ] **Step 2:** Update `getDashboardData` to fetch extensions for each subscription and attach. Two extra queries (parallel `Promise.all`): pending per-subscription, and most-recent approved per-subscription.

- [ ] **Step 3: Commit.** Message: `feat(dashboard): include extensions in DashboardSubscription`

---

## Task 15: `<ExtendDialog>` component

**Files:**
- Create: `components/user/extend-dialog.tsx`

- [ ] **Step 1:** Mirror `components/user/renew-dialog.tsx` exactly, but:
  - Trigger button label: `Extend`.
  - Endpoint: `POST /api/extensions`.
  - Body: `{ subscription_id, requested_tier, notes? }`.
  - Title/description copy mentions extension, not renewal.
  - Tier defaults to `sourceTier` (already-active subscription's current tier).

- [ ] **Step 2: Commit.** Message: `feat(ui): ExtendDialog for active subscriptions`

---

## Task 16: `<ExtensionStatusLine>` component

**Files:**
- Create: `components/user/extension-status-line.tsx`

- [ ] **Step 1:** Renders one of three states based on the `pendingExtension` and `lastApprovedExtension` props:
  - **pending exists** → `Extension pending — yearly — submitted 2026-05-08 [Cancel]` with a button that DELETEs `/api/extensions/[id]` then `router.refresh()`.
  - **last approved exists, no pending** → small muted line `Last extended 2026-05-08 (monthly → yearly)`.
  - **neither** → render nothing (return `null`).

- [ ] **Step 2: Commit.** Message: `feat(ui): ExtensionStatusLine for SubscriptionCard`

---

## Task 17: SubscriptionCard renders Extend + ExtensionStatusLine

**Files:**
- Modify: `components/user/subscription-card.tsx`

- [ ] **Step 1:** When `data.subscription.status === 'active'` AND `!data.pendingExtension`, render the `<ExtendDialog>` button somewhere visually clear (likely below the slot grid, beside or below the existing Renew area which doesn't show on active cards).

- [ ] **Step 2:** Render `<ExtensionStatusLine pending={data.pendingExtension} lastApproved={data.lastApprovedExtension} />` inside the card body in both compact and default modes.

- [ ] **Step 3: Verify in browser** — active card with no extension shows the Extend button; clicking it opens the dialog; submitting creates the pending and the line appears beneath the slot grid.

- [ ] **Step 4: Commit.** Message: `feat(ui): SubscriptionCard renders Extend + ExtensionStatusLine`

---

## Task 18: Admin Pending Extensions panel

**Files:**
- Create: `components/admin/pending-extensions-panel.tsx`
- Modify: `app/admin/licenses/page.tsx` (Plan 5 already wired this page; we add a sibling panel)

- [ ] **Step 1:** Build the panel — load `subscription_extensions where status='pending'` with a join to subscriptions + users. Each row shows user, source subscription summary (product + current tier + current expires_at), requested tier, requested_at, notes, plus Approve / Reject buttons that hit the Plan 6 admin endpoints.

- [ ] **Step 2:** Wire into `/admin/licenses` page. Layout: Plan 5's pending-requests panel on top or beside; pending-extensions panel below or beside it (responsive: stacks on small screens).

- [ ] **Step 3: Commit.** Message: `feat(admin): pending extensions panel + Approve/Reject actions`

---

## Task 19: Playwright spec

**Files:**
- Create: `e2e/user-extends-active-subscription.spec.ts`

- [ ] **Step 1:** Wire into Plan 5's Playwright harness. Test:
  1. Seed: a user with one active monthly subscription, expires_at 30 days out.
  2. As user: open dashboard → click Extend → pick yearly → submit.
  3. Assert: pending status line appears beneath the slot grid.
  4. As admin (programmatic session): POST `/api/extensions/[id]/approve`.
  5. As user: refresh dashboard.
  6. Assert: card now shows tier=`yearly`, expires_at = original + 12 months. Status line shows "Last extended …".
  7. Verify: the user's still-claimed MT5 license rows in `licenses` have the new `expires_at`.

- [ ] **Step 2: Commit.** Message: `test(e2e): user extends active subscription end-to-end`

---

## Task 20: Manual end-to-end verification

- [ ] **Step 1:** `docker compose up -d --build`. Open `http://copytraderx.local`.

- [ ] **Step 2: As admin:** create a test user with an initial monthly subscription. Note the `expires_at`.

- [ ] **Step 3: As test user (private window):** dashboard → click Extend on the active card → pick `yearly` → notes "test extension" → submit. Confirm: Extension button disappears, status line "Extension pending — yearly — submitted …" appears with [Cancel].

- [ ] **Step 4: Click Cancel** → status line disappears → Extend button reappears.

- [ ] **Step 5:** Submit again. Switch to admin window → `/admin/licenses` → see the pending extension panel → click Approve.

- [ ] **Step 6: Refresh user dashboard.** Confirm:
  - Card badge now reads `active · yearly · expires <date+12mo>`.
  - Slot claims unchanged (MT5 number, license key still there).
  - Status line reads `Last extended YYYY-MM-DD (monthly → yearly)`.

- [ ] **Step 7: Verify in DB** (Supabase Studio):
  - The original subscription row's `expires_at` and `tier` updated; `id` unchanged.
  - The child `licenses` row's `expires_at` matches.
  - The `subscription_extensions` row is `status='approved'` with all four `old_*` / `new_*` fields stamped.

- [ ] **Step 8: Test source-expired-before-approval:** create another extension request, then manually flip the source subscription to `expired` in Studio. Run the cron (or call the cron's underlying SQL directly). Confirm the pending extension auto-rejects with `rejection_reason='source_expired_before_approval'` and the user gets the rejection email.

- [ ] **Step 9: Cross-role access checks:**
  - As anon, hit `/api/extensions` POST → 401.
  - As admin, try to extend a user's subscription via `/api/extensions` → server should reject (admin extending on behalf of a user is out-of-scope; this is a user-only action). Or document that admins are allowed and verify.
  - As user, try to approve their own extension via `/api/extensions/[id]/approve` → 403.

- [ ] **Step 10: Final commit — close out the plan.**

Update Status block:
- **Last completed:** Task 20 — Plan 6 complete ✅
- **Next task to execute:** _(none — Plan 6 closes the roles series. Future work: payment integration, proration, mid-cycle upgrade/downgrade.)_

```bash
git add docs/superpowers/plans/2026-05-08-subscription-extensions.md
git commit
```

Commit message: `docs(plan): close out Plan 6 — subscription extensions`

---

## Coverage check

- [ ] **Spec coverage:**
  - §4.1 (two writers, one row) → Tasks 9 + 11 (request + approve).
  - §4.2 (extensions table for audit) → Tasks 5, 11.
  - §4.3 (no EA contract change) → Task 6 (trigger pushes new expires_at to licenses).
  - §5.1 (table) → Task 5.
  - §5.2 (trigger + transaction) → Tasks 6 + 11.
  - §5.3 (RLS) → Task 7.
  - §5.4 (one pending per source) → enforced by unique index in Task 5; surfaced as 409 in Task 9.
  - §5.5 (`new_expires_at` math) → Tasks 4 + 11.
  - §6.1 / §6.2 (request + cancel UX) → Tasks 9, 10, 15, 16, 17.
  - §6.3 (admin approves) → Tasks 11, 18.
  - §6.4 (post-approval UI) → Tasks 14, 16, 17.
  - §6.5 (auto-cleanup on source expiry) → Task 13.
- [ ] **No spec drift from the roles series:** Plan 6 doesn't touch the renewal flow (still post-expiry replacement), the slot model (still per-subscription), or the EA contract (still reads `licenses.expires_at`).
- [ ] **Plan 5 prerequisites:** Approve/Reject email senders are wired in Plan 5; Plan 6 reuses them with the new `kind` field.

Anything left from the roles spec series after Plan 6: payment integration, mid-cycle tier downgrade with proration, recurring billing, "Reattach to user" admin UI for pre-roles legacy licenses (also called out as a Plan 5 deliverable). All deferred to future plans.
