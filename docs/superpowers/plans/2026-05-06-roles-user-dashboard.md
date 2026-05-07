# User Dashboard + Claim Slot + Request License — Implementation Plan (Plan 4 of 5)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the user-facing `/dashboard/*` route tree. A signed-in user sees their active subscriptions, can claim live + demo slots by entering an MT5 account, can request a new license bundle (or renew an expired one), and can open a per-license journal page scoped to their own MT5 accounts. Hardens the existing journal API to filter by `user_id` so users only see their own data.

**Architecture:** Three new building blocks on top of what Plans 1–3 shipped:

1. **Server pages** under `app/dashboard/*` re-read the session via `requireUser`, fetch the user's subscriptions + their licenses + their slot status server-side via the service-role client, and pass everything as props to client components. No `useEffect` data loading on the dashboard shell.
2. **API routes** under `app/api/subscriptions/*` and `app/api/licenses/claim/*` enforce `requireUser`, validate with Zod, and write through `getSupabaseAdmin()`. Two writers exist: one for **request** (`POST /api/subscriptions` → inserts `status='pending'`) and one for **claim** (`POST /api/licenses/claim` → inserts a `licenses` row tied to an existing active subscription). Cancel-request is `DELETE /api/subscriptions/[id]` and only succeeds when the row is owned by the caller and `status='pending'`.
3. **Existing API hardening.** `GET /api/journal/[mt5_account]/*` and `GET /api/licenses/[id]` currently rely on the admin-only middleware path. After this plan, both verify the caller's role and, for users, that the `mt5_account` (or license) belongs to them via a join through `licenses.user_id`.

**Subscription state machine** lives in a new `lib/subscription-state.ts` (pure functions). Plan 4 only uses the `pending → deleted (cancel)` transition; Plan 5 will add `pending → active` (approve), `pending → rejected`, `active → revoked`, and `active → expired`.

**Tech Stack:** Next.js 16 (App Router) + React 19 + Supabase Auth + `@supabase/ssr` + Zod + Jest + shadcn/ui (existing). No new runtime dependencies.

**Spec:** `docs/superpowers/specs/2026-05-06-admin-client-roles-design.md` — sections that bind this plan: §3.5 (products), §4.1 (route tree, `/dashboard/*` only), §4.2 (three-layer enforcement), §5.4 (quota derivation), §5.6 (RLS sketch — server-side filtering only in v1), §6.3 (claim a slot), §6.4 (request new license), §6.6 partial (renew button creates a pending row — approval is Plan 5), §8 (slot/license claiming edge cases).

**Branch:** `feat/admin-client-roles`. Already created in Plan 1; do **not** switch.

**Prerequisites:**
- Plan 1 ✅ (auth, middleware, /admin moves, seed admin)
- Plan 2 ✅ (subscriptions table, multi-product licenses, RLS, backfill)
- Plan 3 ✅ (admin users + email module, including the scaffolded `sendRequestSubmittedEmail` sender that this plan finally wires into a caller)

Confirm with `git log --oneline -10` that `62c93c6 refactor(kb): migrate to global update-kb skill` (or later) is in history.

---

## Resuming this plan in a new session

Same protocol as Plans 1–3:

1. Confirm branch: `git branch --show-current` → `feat/admin-client-roles`.
2. Find the first unchecked `- [ ]` step in this file. That is your starting point.
3. Verify the previous task's commit landed: `git log --oneline -10`.
4. Read the **Status** block immediately below.
5. Each completed step flips its `- [ ]` to `- [x]` **in the same commit** as the code change. `git log -- docs/superpowers/plans/2026-05-06-roles-user-dashboard.md` shows the precise progression.
6. **Never** delete checked-off steps. If a step needs to change after being checked, append a **Correction** sub-section at the bottom of that task and explain.

---

## Status

> **Updated by the executor after each completed task. Single source of truth for "what's done."**

- **Last completed:** Task 12 — SlotCard
- **Last completed commit:** Task 1 = c9a22ff; Task 2 = 8302691; Task 3 = 7587c09; Task 4 = 595d599; refactor(types) = c9ce0bd; Task 5 = 86e24d4; Task 6 = 8c29aec; Task 7 = 6120e89; Task 8 = e97c347; Task 9 = e38b744; Task 10 = (prev commit); Task 11 = (this commit); Task 13 = (this commit); Task 12 = (this commit)
- **Next task to execute:** Task 14 — SubscriptionCard composite
- **Plan version:** 1.0

---

## File Structure

| Path | Action | Responsibility |
|---|---|---|
| `lib/subscription-state.ts` | Create | Pure state-machine helpers: `canCancel()`, `canClaimOn()`, `canRenewFrom()`. Plan 4 uses Plan 5 will extend with `canApprove()` / `canReject()` / `canRevoke()`. |
| `lib/subscription-state.test.ts` | Create | Exhaustive transition tests. |
| `lib/schemas.ts` | Modify | Add `claimSlotSchema` (mt5_account, intended_account_type, subscription_id). The existing `createSubscriptionRequestSchema` and `renewSubscriptionRequestSchema` are reused unchanged. |
| `lib/schemas.test.ts` | Modify | Cover `claimSlotSchema` (valid + invalid). |
| `lib/types.ts` | Modify | Add `DashboardSubscription` view type that bundles a `Subscription` with its two slot licenses (live/demo) for the dashboard cards. |
| `lib/dashboard-data.ts` | Create | Server-only loader: `getDashboardData(userId)` returns `DashboardSubscription[]` ordered by status (active first, then pending, then expired/rejected/revoked). One query joining `subscriptions` + `licenses`. |
| `app/api/subscriptions/route.ts` | Create | `POST` — user creates a pending request. Validates with `createSubscriptionRequestSchema`, inserts `subscriptions{status:'pending'}`, sends `sendRequestSubmittedEmail` to admin, never throws on email failure. |
| `app/api/subscriptions/[id]/route.ts` | Create | `DELETE` — cancel a pending request owned by the caller. Returns 404 if not owned, 409 if not pending. |
| `app/api/subscriptions/renew/route.ts` | Create | `POST` — user renews from a source subscription. Validates with `renewSubscriptionRequestSchema`, server fetches the source's `product` (so the user can't change it), inserts new `subscriptions{status:'pending', product:source.product}`, emails admin. |
| `app/api/licenses/claim/route.ts` | Create | `POST` — user claims a slot. Validates with `claimSlotSchema`. Server confirms the subscription is `status='active'` and owned by the caller; mints a license_key with the product's prefix; inserts the `licenses` row with `subscription_id`, `user_id`, `product`, `tier`, `intended_account_type`. Surfaces `(mt5_account, product)` and `(subscription_id, intended_account_type)` unique-constraint violations as typed errors. |
| `app/api/journal/[mt5_account]/snapshot/route.ts` | Modify | Add `requireUser` + ownership check (skip for admins). |
| `app/api/journal/[mt5_account]/positions/route.ts` | Modify | Same. |
| `app/api/journal/[mt5_account]/deals/route.ts` | Modify | Same. |
| `app/api/journal/[mt5_account]/orders/route.ts` | Modify | Same. |
| `app/api/journal/[mt5_account]/snapshots-daily/route.ts` | Modify | Same. |
| `app/api/licenses/[id]/route.ts` | Modify | `GET` adds an ownership check for users (admins unrestricted). `PATCH` and `DELETE` remain admin-only — already enforced by the existing pattern; add an explicit `requireAdmin` to make the intent obvious. |
| `app/dashboard/layout.tsx` | Create | Server layout that calls `requireUser`. Renders a thin nav (logo + sign-out) shared with all dashboard pages. |
| `app/dashboard/page.tsx` | Create | Server page. Loads via `getDashboardData()`, renders subscription cards. Empty state when no subscriptions. |
| `app/dashboard/licenses/[id]/page.tsx` | Create | Server page. Loads the license, verifies `license.user_id === session.user.id`, then renders the existing `<JournalShell>` with this license's `mt5_account`. 404 on mismatch. |
| `app/dashboard/licenses/[id]/loading.tsx` | Create | Skeleton mirroring the journal page loading state. |
| `components/user/subscription-card.tsx` | Create | Server component (no client interactivity itself) that renders a card with product/tier/status/expiry and two `<SlotCard>`s. Pending and expired states render a different footer. |
| `components/user/slot-card.tsx` | Create | Renders one slot. Empty → "Add MT5 account" button (opens `<ClaimSlotDialog>`). Claimed → MT5 number, status badge, "Open journal" link to `/dashboard/licenses/[id]`. |
| `components/user/claim-slot-dialog.tsx` | Create | Client dialog. Form: `mt5_account` (positive int). Read-only header showing product + intended type. POSTs `/api/licenses/claim`. Refreshes via `router.refresh()` on success. |
| `components/user/request-license-dialog.tsx` | Create | Client dialog. Form: product (select), tier (select), notes (optional). POSTs `/api/subscriptions`. Refreshes on success. |
| `components/user/renew-dialog.tsx` | Create | Client dialog. Read-only product (locked from source). Form: tier (pre-filled from source). POSTs `/api/subscriptions/renew`. Refreshes on success. |
| `components/user/cancel-request-button.tsx` | Create | Client component. Confirm-then-DELETE. Refreshes on success. |
| `components/user/dashboard-nav.tsx` | Create | Client header with logo + sign-out + "Request New License" button. |
| `components/shared/expired-banner.tsx` | Create | Small banner component shown above the cards grid when the user has any expired subscription with no pending renewal. Links to renew it. |
| `app/page.tsx` | _no change_ | Already redirects by role — verify behavior unchanged after Plan 4 lands. |
| `docs/superpowers/plans/2026-05-06-roles-user-dashboard.md` | Modify (each task) | Flip `- [ ]` → `- [x]` and update Status. |

We are **not** touching: the admin Pending Requests panel (Plan 5), the admin approve/reject API (Plan 5), the cron-driven natural expiry (Plan 5), admin revoke (Plan 5), Playwright (Plan 5), or the admin-direct license create path's synthetic-subscription branch (Plan 5 replaces it). The four wired-up email senders that remain — `sendRequestApprovedEmail`, `sendRequestRejectedEmail`, plus the not-yet-built admin-revoke email — are wired in Plan 5. Plan 4 wires only `sendRequestSubmittedEmail` (admin-notify on user submit).

---

## Conventions for this plan

Same as Plans 1–3:
- **Each step is its own commit** unless explicitly grouped.
- Conventional-commit messages with `Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>` trailer.
- Plan-file checkbox flips happen in the same commit as the code change.
- Tests-first for pure logic (`lib/subscription-state.ts`, `lib/schemas.ts` extensions).
- API routes get integration-style tests where they have non-trivial branching (claim slot, cancel request).
- Dashboard server components render real data via the SSR client; client dialogs talk to the API via `fetch` and use `router.refresh()` to re-render the server tree on success.
- Manual verification (browser at `copytraderx.local` after `docker compose up -d --build`) for every UI surface, with the existing seed admin acting as a no-op admin viewer (admins can browse `/dashboard` per middleware) and a freshly-provisioned test user for the actual user flows.

---

## Task 1: `lib/subscription-state.ts` — pure state machine (TDD)

**Files:**
- Create: `lib/subscription-state.ts`
- Create: `lib/subscription-state.test.ts`

**Why first:** every API route in this plan checks "is this transition allowed?" and the cleanest way to keep that consistent is one module that owns the answer. Pure functions, no Supabase imports, exhaustively tested.

- [x] **Step 1: Write failing tests**

In `lib/subscription-state.test.ts`, cover:

```ts
import {
  canCancel,
  canClaimOn,
  canRenewFrom,
} from "./subscription-state";

describe("canCancel", () => {
  it("allows cancel on pending", () => {
    expect(canCancel({ status: "pending" }).ok).toBe(true);
  });
  it.each(["active", "rejected", "expired", "revoked"] as const)(
    "blocks cancel on %s",
    (status) => {
      const r = canCancel({ status });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.reason).toBe("not_pending");
    },
  );
});

describe("canClaimOn", () => {
  it("allows claim on active", () => {
    expect(canClaimOn({ status: "active" }).ok).toBe(true);
  });
  it.each(["pending", "rejected", "expired", "revoked"] as const)(
    "blocks claim on %s",
    (status) => {
      const r = canClaimOn({ status });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.reason).toBe("subscription_not_active");
    },
  );
});

describe("canRenewFrom", () => {
  it.each(["expired", "revoked"] as const)("allows renew from %s", (status) => {
    expect(canRenewFrom({ status }).ok).toBe(true);
  });
  it.each(["pending", "active", "rejected"] as const)(
    "blocks renew from %s",
    (status) => {
      const r = canRenewFrom({ status });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.reason).toBe("not_renewable");
    },
  );
});
```

Run: `pnpm test lib/subscription-state.test.ts` → expect "Cannot find module" failure.

- [x] **Step 2: Implement to GREEN**

In `lib/subscription-state.ts`:

```ts
import type { SubscriptionStatus } from "./types";

export type GuardResult =
  | { ok: true }
  | { ok: false; reason: string };

export function canCancel(s: { status: SubscriptionStatus }): GuardResult {
  if (s.status === "pending") return { ok: true };
  return { ok: false, reason: "not_pending" };
}

export function canClaimOn(s: { status: SubscriptionStatus }): GuardResult {
  if (s.status === "active") return { ok: true };
  return { ok: false, reason: "subscription_not_active" };
}

export function canRenewFrom(s: { status: SubscriptionStatus }): GuardResult {
  if (s.status === "expired" || s.status === "revoked") return { ok: true };
  return { ok: false, reason: "not_renewable" };
}
```

Re-run tests → green.

- [x] **Step 3: Type-check and commit**

```bash
pnpm tsc --noEmit && pnpm test
git add lib/subscription-state.ts lib/subscription-state.test.ts docs/superpowers/plans/2026-05-06-roles-user-dashboard.md
git commit
```

Commit message: `feat(subscriptions): add subscription-state pure helpers (canCancel/canClaimOn/canRenewFrom)`

---

## Task 2: Add `claimSlotSchema` to `lib/schemas.ts`

**Files:**
- Modify: `lib/schemas.ts`
- Modify: `lib/schemas.test.ts`

- [x] **Step 1: Failing test**

In `lib/schemas.test.ts`, add:

```ts
import { claimSlotSchema } from "./schemas";

describe("claimSlotSchema", () => {
  it("accepts a valid claim", () => {
    const result = claimSlotSchema.safeParse({
      subscription_id: 42,
      mt5_account: 1234567,
      intended_account_type: "live",
    });
    expect(result.success).toBe(true);
  });
  it("rejects mt5_account <= 0", () => {
    const result = claimSlotSchema.safeParse({
      subscription_id: 42,
      mt5_account: 0,
      intended_account_type: "demo",
    });
    expect(result.success).toBe(false);
  });
  it("rejects intended_account_type='contest'", () => {
    const result = claimSlotSchema.safeParse({
      subscription_id: 42,
      mt5_account: 1234567,
      intended_account_type: "contest",
    });
    expect(result.success).toBe(false);
  });
});
```

Run → import-error red.

- [x] **Step 2: Implement**

In `lib/schemas.ts`, after `accountTypeEnum` and the renew-schema block, add:

```ts
export const claimSlotSchema = z
  .object({
    subscription_id: z.number().int().positive(),
    mt5_account: z.number().int().positive(),
    intended_account_type: accountTypeEnum, // demo | live, no contest
  })
  .strict();

export type ClaimSlotInput = z.infer<typeof claimSlotSchema>;
```

Run tests → green.

- [x] **Step 3: Commit**

```bash
git add lib/schemas.ts lib/schemas.test.ts docs/superpowers/plans/2026-05-06-roles-user-dashboard.md
git commit
```

Commit message: `feat(schemas): add claimSlotSchema for user slot claim`

---

## Task 3: Add `DashboardSubscription` view type

**Files:**
- Modify: `lib/types.ts`

- [x] **Step 1: Add the view type**

After the existing `Subscription` interface, add:

```ts
/**
 * Dashboard projection: a subscription bundled with its child licenses
 * keyed by intended_account_type. Either slot can be empty.
 */
export interface DashboardSubscription {
  subscription: Subscription;
  liveLicense: License | null;
  demoLicense: License | null;
}
```

- [x] **Step 2: Type-check and commit**

```bash
pnpm tsc --noEmit
git add lib/types.ts docs/superpowers/plans/2026-05-06-roles-user-dashboard.md
git commit
```

Commit message: `feat(types): add DashboardSubscription view type`

---

## Task 4: `lib/dashboard-data.ts` — server loader

**Files:**
- Create: `lib/dashboard-data.ts`

- [x] **Step 1: Implement the loader**

```ts
import { getSupabaseAdmin } from "@/lib/supabase/server";
import type { DashboardSubscription, License, Subscription } from "./types";

const STATUS_ORDER: Record<Subscription["status"], number> = {
  active: 0,
  pending: 1,
  expired: 2,
  revoked: 3,
  rejected: 4,
};

export async function getDashboardData(
  userId: string,
): Promise<DashboardSubscription[]> {
  const sb = getSupabaseAdmin();

  const { data: subs, error: subsErr } = await sb
    .from("subscriptions")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (subsErr) throw new Error(`subscriptions_fetch_failed: ${subsErr.message}`);
  if (!subs || subs.length === 0) return [];

  const subIds = subs.map((s) => s.id);
  const { data: lics, error: licErr } = await sb
    .from("licenses")
    .select("*")
    .in("subscription_id", subIds);

  if (licErr) throw new Error(`licenses_fetch_failed: ${licErr.message}`);

  const bySub = new Map<number, { live: License | null; demo: License | null }>();
  for (const sub of subs) bySub.set(sub.id, { live: null, demo: null });
  for (const lic of (lics ?? []) as License[]) {
    if (lic.subscription_id === null) continue;
    const slot = bySub.get(lic.subscription_id);
    if (!slot) continue;
    if (lic.intended_account_type === "live") slot.live = lic;
    if (lic.intended_account_type === "demo") slot.demo = lic;
  }

  const out: DashboardSubscription[] = subs.map((sub) => ({
    subscription: sub as Subscription,
    liveLicense: bySub.get(sub.id)!.live,
    demoLicense: bySub.get(sub.id)!.demo,
  }));

  out.sort((a, b) => {
    const da = STATUS_ORDER[a.subscription.status];
    const db = STATUS_ORDER[b.subscription.status];
    if (da !== db) return da - db;
    return new Date(b.subscription.created_at).getTime() - new Date(a.subscription.created_at).getTime();
  });

  return out;
}
```

Notes: this file is server-only by import-graph (it imports `getSupabaseAdmin`). The dashboard page imports it directly; client components must not.

- [x] **Step 2: Type-check and commit**

```bash
pnpm tsc --noEmit
git add lib/dashboard-data.ts docs/superpowers/plans/2026-05-06-roles-user-dashboard.md
git commit
```

Commit message: `feat(dashboard): add getDashboardData server loader`

---

## Task 5: `POST /api/subscriptions` — user creates pending request

**Files:**
- Create: `app/api/subscriptions/route.ts`

- [x] **Step 1: Implement the route**

```ts
import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { getSupabaseSSR } from "@/lib/supabase/ssr";
import { createSubscriptionRequestSchema } from "@/lib/schemas";
import { sendRequestSubmittedEmail } from "@/lib/email";
import { productDisplayName } from "@/lib/products";

export async function POST(req: Request) {
  const ssr = await getSupabaseSSR();
  const {
    data: { user },
  } = await ssr.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const parsed = createSubscriptionRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_request", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const { product, tier, notes } = parsed.data;
  const sb = getSupabaseAdmin();

  const { data, error } = await sb
    .from("subscriptions")
    .insert({
      user_id: user.id,
      product,
      tier,
      status: "pending",
      notes: notes ?? null,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json(
      { error: "insert_failed", details: error.message },
      { status: 500 },
    );
  }

  // Notify admin. Failures are logged inside sendEmail and never thrown.
  void sendRequestSubmittedEmail({
    userEmail: user.email ?? "(unknown)",
    productDisplay: productDisplayName(product),
    tier,
    notes: notes ?? null,
  });

  return NextResponse.json({ subscription: data }, { status: 201 });
}
```

- [x] **Step 2: Type-check and commit**

```bash
pnpm tsc --noEmit && pnpm test
git add app/api/subscriptions/route.ts docs/superpowers/plans/2026-05-06-roles-user-dashboard.md
git commit
```

Commit message: `feat(api): POST /api/subscriptions — user creates pending request`

### Correction (2026-05-08)

The plan's draft used a stale signature `{ userEmail, productDisplay, tier, notes }` for `sendRequestSubmittedEmail`. The real signature in `lib/email.ts` (added by Plan 3) is `{ to, user_email, product_label, tier_label, notes }`. The implementation uses the real signature and resolves the admin `to:` from `INITIAL_ADMIN_EMAIL` (already in `.env.example`); when the env is unset, the call is skipped with a warning. No behavioral change versus the plan's intent.

---

## Task 6: `DELETE /api/subscriptions/[id]` — user cancels pending request

**Files:**
- Create: `app/api/subscriptions/[id]/route.ts`

- [x] **Step 1: Implement**

```ts
import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { getSupabaseSSR } from "@/lib/supabase/ssr";
import { canCancel } from "@/lib/subscription-state";

export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id: idRaw } = await ctx.params;
  const id = Number(idRaw);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: "invalid_id" }, { status: 400 });
  }

  const ssr = await getSupabaseSSR();
  const {
    data: { user },
  } = await ssr.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const sb = getSupabaseAdmin();

  const { data: sub, error: fetchErr } = await sb
    .from("subscriptions")
    .select("id, user_id, status")
    .eq("id", id)
    .maybeSingle();

  if (fetchErr) {
    return NextResponse.json(
      { error: "lookup_failed", details: fetchErr.message },
      { status: 500 },
    );
  }
  if (!sub || sub.user_id !== user.id) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const guard = canCancel({ status: sub.status });
  if (!guard.ok) {
    return NextResponse.json({ error: guard.reason }, { status: 409 });
  }

  const { error: delErr } = await sb.from("subscriptions").delete().eq("id", id);
  if (delErr) {
    return NextResponse.json(
      { error: "delete_failed", details: delErr.message },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true });
}
```

- [x] **Step 2: Commit**

```bash
pnpm tsc --noEmit
git add app/api/subscriptions/[id]/route.ts docs/superpowers/plans/2026-05-06-roles-user-dashboard.md
git commit
```

Commit message: `feat(api): DELETE /api/subscriptions/[id] — user cancels pending request`

---

## Task 7: `POST /api/subscriptions/renew` — user renews from expired/revoked source

**Files:**
- Create: `app/api/subscriptions/renew/route.ts`

- [x] **Step 1: Implement**

```ts
import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { getSupabaseSSR } from "@/lib/supabase/ssr";
import { renewSubscriptionRequestSchema } from "@/lib/schemas";
import { canRenewFrom } from "@/lib/subscription-state";
import { sendRequestSubmittedEmail } from "@/lib/email";
import { productDisplayName } from "@/lib/products";

export async function POST(req: Request) {
  const ssr = await getSupabaseSSR();
  const {
    data: { user },
  } = await ssr.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const parsed = renewSubscriptionRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_request", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const { source_subscription_id, tier, notes } = parsed.data;
  const sb = getSupabaseAdmin();

  const { data: source, error: sourceErr } = await sb
    .from("subscriptions")
    .select("id, user_id, product, status")
    .eq("id", source_subscription_id)
    .maybeSingle();
  if (sourceErr) {
    return NextResponse.json(
      { error: "lookup_failed", details: sourceErr.message },
      { status: 500 },
    );
  }
  if (!source || source.user_id !== user.id) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  const guard = canRenewFrom({ status: source.status });
  if (!guard.ok) {
    return NextResponse.json({ error: guard.reason }, { status: 409 });
  }

  const { data, error } = await sb
    .from("subscriptions")
    .insert({
      user_id: user.id,
      product: source.product,        // inherited; user cannot change
      tier,
      status: "pending",
      notes: notes ?? null,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json(
      { error: "insert_failed", details: error.message },
      { status: 500 },
    );
  }

  void sendRequestSubmittedEmail({
    userEmail: user.email ?? "(unknown)",
    productDisplay: productDisplayName(source.product),
    tier,
    notes: notes ?? null,
  });

  return NextResponse.json({ subscription: data }, { status: 201 });
}
```

- [x] **Step 2: Commit**

```bash
pnpm tsc --noEmit
git add app/api/subscriptions/renew/route.ts docs/superpowers/plans/2026-05-06-roles-user-dashboard.md
git commit
```

Commit message: `feat(api): POST /api/subscriptions/renew — user renews from source subscription`

### Correction: email signature + admin recipient

The plan's pseudocode used a stale `sendRequestSubmittedEmail` signature `{ userEmail, productDisplay, tier, notes }`. The real signature in `lib/email.ts` is `{ to, user_email, product_label, tier_label, notes }`. The implementation uses the real signature and resolves the admin `to:` from `INITIAL_ADMIN_EMAIL` (skip-and-warn when unset), matching the pattern established in Task 5.

---

## Task 8: `POST /api/licenses/claim` — user claims a slot

**Files:**
- Create: `app/api/licenses/claim/route.ts`

- [x] **Step 1: Implement**

```ts
import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { getSupabaseSSR } from "@/lib/supabase/ssr";
import { claimSlotSchema } from "@/lib/schemas";
import { canClaimOn } from "@/lib/subscription-state";
import { generateLicenseKey } from "@/lib/license-key";

export async function POST(req: Request) {
  const ssr = await getSupabaseSSR();
  const {
    data: { user },
  } = await ssr.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const parsed = claimSlotSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_request", issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const { subscription_id, mt5_account, intended_account_type } = parsed.data;

  const sb = getSupabaseAdmin();

  const { data: sub, error: subErr } = await sb
    .from("subscriptions")
    .select("id, user_id, product, tier, status, expires_at")
    .eq("id", subscription_id)
    .maybeSingle();

  if (subErr) {
    return NextResponse.json(
      { error: "lookup_failed", details: subErr.message },
      { status: 500 },
    );
  }
  if (!sub || sub.user_id !== user.id) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  const guard = canClaimOn({ status: sub.status });
  if (!guard.ok) {
    return NextResponse.json({ error: guard.reason }, { status: 409 });
  }

  const license_key = generateLicenseKey(sub.product);

  const { data, error } = await sb
    .from("licenses")
    .insert({
      license_key,
      mt5_account,
      product: sub.product,
      tier: sub.tier,
      user_id: user.id,
      subscription_id: sub.id,
      // expires_at left null — EA stamps on first activation; matches the
      // admin-direct create path. Once the EA validates, the row carries
      // sub.expires_at via the activate route.
      expires_at: null,
      activated_at: null,
      status: "active",
      intended_account_type,
    })
    .select()
    .single();

  if (error) {
    if (error.code === "23505") {
      // Surface the two distinct unique violations as separate errors.
      const detail = error.message ?? "";
      if (detail.includes("idx_licenses_one_per_slot")) {
        return NextResponse.json({ error: "slot_already_claimed" }, { status: 409 });
      }
      if (detail.includes("idx_licenses_mt5_product")) {
        return NextResponse.json({ error: "mt5_already_in_use_for_product" }, { status: 409 });
      }
      return NextResponse.json({ error: "duplicate" }, { status: 409 });
    }
    return NextResponse.json(
      { error: "insert_failed", details: error.message },
      { status: 500 },
    );
  }

  return NextResponse.json({ license: data }, { status: 201 });
}
```

- [x] **Step 2: Commit**

```bash
pnpm tsc --noEmit && pnpm test
git add app/api/licenses/claim/route.ts docs/superpowers/plans/2026-05-06-roles-user-dashboard.md
git commit
```

Commit message: `feat(api): POST /api/licenses/claim — user claims live/demo slot`

---

## Task 9: Harden journal API — add per-user ownership filter

**Files:**
- Modify: `app/api/journal/[mt5_account]/snapshot/route.ts`
- Modify: `app/api/journal/[mt5_account]/positions/route.ts`
- Modify: `app/api/journal/[mt5_account]/deals/route.ts`
- Modify: `app/api/journal/[mt5_account]/orders/route.ts`
- Modify: `app/api/journal/[mt5_account]/snapshots-daily/route.ts`

**Goal:** users may only fetch journal data for `mt5_account`s present in `licenses` where `user_id = self`. Admins are unrestricted.

- [x] **Step 1: Add a shared helper**

Create `lib/journal-access.ts`:

```ts
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { getSupabaseSSR } from "@/lib/supabase/ssr";

export type JournalAccessResult =
  | { allowed: true }
  | { allowed: false; status: 401 | 403 | 404 };

export async function ensureJournalAccess(mt5_account: number): Promise<JournalAccessResult> {
  const ssr = await getSupabaseSSR();
  const {
    data: { user },
  } = await ssr.auth.getUser();
  if (!user) return { allowed: false, status: 401 };

  const role = (user.app_metadata?.role as "admin" | "user" | undefined) ?? null;
  if (role === "admin") return { allowed: true };
  if (role !== "user") return { allowed: false, status: 403 };

  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .from("licenses")
    .select("id")
    .eq("user_id", user.id)
    .eq("mt5_account", mt5_account)
    .limit(1);

  if (error) return { allowed: false, status: 403 };
  if (!data || data.length === 0) return { allowed: false, status: 404 };
  return { allowed: true };
}
```

- [x] **Step 2: Wire into each route**

In each of the 5 journal routes, at the top of the handler (after parsing `mt5_account`), call:

```ts
const access = await ensureJournalAccess(mt5_account);
if (!access.allowed) {
  return NextResponse.json(
    { error: access.status === 401 ? "unauthenticated" : access.status === 403 ? "forbidden" : "not_found" },
    { status: access.status },
  );
}
```

Verify each route still type-checks and that the existing fetch logic runs unchanged after the gate.

- [x] **Step 3: Type-check and commit**

```bash
pnpm tsc --noEmit
git add lib/journal-access.ts app/api/journal docs/superpowers/plans/2026-05-06-roles-user-dashboard.md
git commit
```

Commit message: `feat(api/journal): scope journal reads by user ownership`

---

## Task 10: Tighten `/api/licenses/[id]` GET — owner OR admin

**Files:**
- Modify: `app/api/licenses/[id]/route.ts`

- [x] **Step 1: Add an explicit guard**

At the top of the `GET` handler (before the existing fetch), insert:

```ts
const ssr = await getSupabaseSSR();
const {
  data: { user },
} = await ssr.auth.getUser();
if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
const role = (user.app_metadata?.role as "admin" | "user" | undefined) ?? null;
```

After the license is fetched but before responding, when `role === "user"` enforce `data.user_id === user.id`; otherwise return 404 (do not leak existence).

For `PATCH` and `DELETE` handlers in the same file, add an explicit `if (role !== "admin") return 403` guard at the top (defense in depth — middleware already blocks user-tree access to admin paths, but the API path is `/api/licenses/[id]` which is NOT prefixed by `/admin`).

- [x] **Step 2: Commit**

```bash
pnpm tsc --noEmit
git add app/api/licenses/[id]/route.ts docs/superpowers/plans/2026-05-06-roles-user-dashboard.md
git commit
```

Commit message: `feat(api): scope GET /api/licenses/[id] to owner; require admin for PATCH/DELETE`

---

## Task 11: `app/dashboard/layout.tsx` — guard + nav

**Files:**
- Create: `app/dashboard/layout.tsx`
- Create: `components/user/dashboard-nav.tsx`

- [x] **Step 1: Write the layout**

`app/dashboard/layout.tsx`:

```tsx
import { redirect } from "next/navigation";
import { getSupabaseSSR } from "@/lib/supabase/ssr";
import { DashboardNav } from "@/components/user/dashboard-nav";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const sb = await getSupabaseSSR();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) redirect("/login");

  return (
    <div className="min-h-screen bg-background">
      <DashboardNav userEmail={user.email ?? ""} />
      <main className="container mx-auto p-4 md:p-8">{children}</main>
    </div>
  );
}
```

`components/user/dashboard-nav.tsx`:

```tsx
"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";

export function DashboardNav({ userEmail }: { userEmail: string }) {
  async function logout() {
    await fetch("/auth/logout", { method: "POST" });
    window.location.href = "/login";
  }

  return (
    <header className="border-b bg-card">
      <div className="container mx-auto flex items-center justify-between p-4">
        <Link href="/dashboard" className="font-semibold">
          CopyTraderX
        </Link>
        <div className="flex items-center gap-4">
          <span className="text-sm text-muted-foreground hidden sm:inline">{userEmail}</span>
          <Button variant="ghost" size="sm" onClick={logout}>
            Sign out
          </Button>
        </div>
      </div>
    </header>
  );
}
```

- [x] **Step 2: Commit**

```bash
pnpm tsc --noEmit
git add app/dashboard/layout.tsx components/user/dashboard-nav.tsx docs/superpowers/plans/2026-05-06-roles-user-dashboard.md
git commit
```

Commit message: `feat(dashboard): add /dashboard layout + nav`

---

## Task 12: `components/user/slot-card.tsx`

**Files:**
- Create: `components/user/slot-card.tsx`

- [x] **Step 1: Implement**

```tsx
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import type { License } from "@/lib/types";
import { ClaimSlotDialog } from "./claim-slot-dialog";

export function SlotCard({
  subscriptionId,
  intendedType,
  productDisplay,
  license,
  canClaim,
}: {
  subscriptionId: number;
  intendedType: "live" | "demo";
  productDisplay: string;
  license: License | null;
  canClaim: boolean;
}) {
  return (
    <div className="rounded-md border p-3">
      <div className="mb-1 flex items-center justify-between">
        <span className="text-xs font-semibold uppercase text-muted-foreground">
          {intendedType}
        </span>
        {license ? (
          <Badge variant={license.status === "active" ? "default" : "secondary"}>
            {license.status}
          </Badge>
        ) : (
          <Badge variant="outline">empty</Badge>
        )}
      </div>
      {license ? (
        <div className="flex items-center justify-between">
          <div>
            <div className="font-mono text-sm">{license.mt5_account}</div>
            <div className="text-xs text-muted-foreground">{license.license_key}</div>
          </div>
          <Link
            href={`/dashboard/licenses/${license.id}`}
            className="text-sm underline"
          >
            Open journal
          </Link>
        </div>
      ) : canClaim ? (
        <ClaimSlotDialog
          subscriptionId={subscriptionId}
          intendedType={intendedType}
          productDisplay={productDisplay}
        />
      ) : (
        <p className="text-xs text-muted-foreground">Unavailable until subscription is active.</p>
      )}
    </div>
  );
}
```

- [x] **Step 2: Commit**

```bash
pnpm tsc --noEmit
git add components/user/slot-card.tsx docs/superpowers/plans/2026-05-06-roles-user-dashboard.md
git commit
```

Commit message: `feat(ui): SlotCard for dashboard subscription cards`

---

## Task 13: `components/user/claim-slot-dialog.tsx`

**Files:**
- Create: `components/user/claim-slot-dialog.tsx`

- [x] **Step 1: Implement**

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

const ERROR_COPY: Record<string, string> = {
  slot_already_claimed: "This slot is already claimed.",
  mt5_already_in_use_for_product: "This MT5 account already holds a license for this product.",
  subscription_not_active: "This subscription is not active.",
  not_found: "Subscription not found.",
};

export function ClaimSlotDialog({
  subscriptionId,
  intendedType,
  productDisplay,
}: {
  subscriptionId: number;
  intendedType: "live" | "demo";
  productDisplay: string;
}) {
  const [open, setOpen] = useState(false);
  const [mt5, setMt5] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const n = Number(mt5);
    if (!Number.isInteger(n) || n <= 0) {
      setError("MT5 account must be a positive integer.");
      return;
    }
    setBusy(true);
    try {
      const r = await fetch("/api/licenses/claim", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          subscription_id: subscriptionId,
          mt5_account: n,
          intended_account_type: intendedType,
        }),
      });
      if (!r.ok) {
        const body = await r.json().catch(() => ({}));
        setError(ERROR_COPY[body.error] ?? body.error ?? "Could not claim slot.");
        return;
      }
      setOpen(false);
      setMt5("");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">Add MT5 account</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Claim {intendedType} slot</DialogTitle>
          <DialogDescription>
            <span className="font-semibold">{productDisplay}</span> — {intendedType} account.
            Enter the MT5 account number you want this license bound to.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="mt5">MT5 account</Label>
            <Input
              id="mt5"
              inputMode="numeric"
              value={mt5}
              onChange={(e) => setMt5(e.target.value)}
              autoFocus
              required
            />
          </div>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? "Claiming…" : "Claim slot"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
```

- [x] **Step 2: Commit**

```bash
pnpm tsc --noEmit
git add components/user/claim-slot-dialog.tsx docs/superpowers/plans/2026-05-06-roles-user-dashboard.md
git commit
```

Commit message: `feat(ui): ClaimSlotDialog for dashboard slot cards`

---

## Task 14: `components/user/subscription-card.tsx`

**Files:**
- Create: `components/user/subscription-card.tsx`

- [ ] **Step 1: Implement**

```tsx
import { Badge } from "@/components/ui/badge";
import { productDisplayName } from "@/lib/products";
import { formatExpiry } from "@/lib/expiry";
import type { DashboardSubscription } from "@/lib/types";
import { SlotCard } from "./slot-card";
import { CancelRequestButton } from "./cancel-request-button";
import { RenewDialog } from "./renew-dialog";

export function SubscriptionCard({ data }: { data: DashboardSubscription }) {
  const sub = data.subscription;
  const productDisplay = productDisplayName(sub.product);
  const isPending = sub.status === "pending";
  const isActive = sub.status === "active";
  const canRenew = sub.status === "expired" || sub.status === "revoked";

  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="mb-3 flex items-start justify-between">
        <div>
          <h3 className="text-base font-semibold">{productDisplay}</h3>
          <p className="text-sm text-muted-foreground">
            {sub.tier}
            {sub.expires_at ? ` — expires ${formatExpiry(sub.expires_at)}` : ""}
          </p>
        </div>
        <Badge variant={isActive ? "default" : isPending ? "secondary" : "outline"}>
          {sub.status}
        </Badge>
      </div>

      {isPending ? (
        <div className="flex items-center justify-between rounded-md border-dashed border p-3">
          <p className="text-sm text-muted-foreground">
            Awaiting admin approval.
            {sub.notes ? ` Note: ${sub.notes}` : ""}
          </p>
          <CancelRequestButton subscriptionId={sub.id} />
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <SlotCard
            subscriptionId={sub.id}
            intendedType="live"
            productDisplay={productDisplay}
            license={data.liveLicense}
            canClaim={isActive}
          />
          <SlotCard
            subscriptionId={sub.id}
            intendedType="demo"
            productDisplay={productDisplay}
            license={data.demoLicense}
            canClaim={isActive}
          />
        </div>
      )}

      {canRenew ? (
        <div className="mt-3 flex justify-end">
          <RenewDialog
            sourceSubscriptionId={sub.id}
            productDisplay={productDisplay}
            sourceTier={sub.tier}
          />
        </div>
      ) : null}

      {sub.status === "rejected" && sub.rejection_reason ? (
        <p className="mt-3 text-sm text-destructive">Rejected: {sub.rejection_reason}</p>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
pnpm tsc --noEmit
git add components/user/subscription-card.tsx docs/superpowers/plans/2026-05-06-roles-user-dashboard.md
git commit
```

Commit message: `feat(ui): SubscriptionCard composite for dashboard`

---

## Task 15: `components/user/request-license-dialog.tsx`

**Files:**
- Create: `components/user/request-license-dialog.tsx`

- [ ] **Step 1: Implement**

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { PRODUCTS } from "@/lib/products";

export function RequestLicenseDialog() {
  const [open, setOpen] = useState(false);
  const [product, setProduct] = useState<string>("impulse");
  const [tier, setTier] = useState<string>("monthly");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const r = await fetch("/api/subscriptions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          product,
          tier,
          notes: notes.trim() ? notes.trim() : undefined,
        }),
      });
      if (!r.ok) {
        const body = await r.json().catch(() => ({}));
        setError(body.error ?? "Could not submit request.");
        return;
      }
      setOpen(false);
      setNotes("");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>Request New License</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Request a new license</DialogTitle>
          <DialogDescription>
            Pick a product and tier. The admin will review and approve your request.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="product">Product</Label>
            <Select value={product} onValueChange={setProduct}>
              <SelectTrigger id="product"><SelectValue /></SelectTrigger>
              <SelectContent>
                {PRODUCTS.map((p) => (
                  <SelectItem key={p.code} value={p.code}>{p.displayName}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="tier">Tier</Label>
            <Select value={tier} onValueChange={setTier}>
              <SelectTrigger id="tier"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="monthly">Monthly</SelectItem>
                <SelectItem value="quarterly">Quarterly</SelectItem>
                <SelectItem value="yearly">Yearly</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="notes">Notes (optional)</Label>
            <Textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
            />
          </div>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? "Submitting…" : "Submit request"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
```

Verify `components/ui/textarea.tsx` exists (it should — added in journal phase 4). If missing, add via shadcn before committing.

- [ ] **Step 2: Commit**

```bash
pnpm tsc --noEmit
git add components/user/request-license-dialog.tsx docs/superpowers/plans/2026-05-06-roles-user-dashboard.md
git commit
```

Commit message: `feat(ui): RequestLicenseDialog for /dashboard`

---

## Task 16: `components/user/renew-dialog.tsx`

**Files:**
- Create: `components/user/renew-dialog.tsx`

- [ ] **Step 1: Implement**

Same pattern as `RequestLicenseDialog`, but:
- The trigger is `<Button variant="outline" size="sm">Renew</Button>`.
- The product field is rendered as a read-only piece of text (locked from `productDisplay`).
- Tier defaults to `sourceTier`.
- Submit POSTs `/api/subscriptions/renew` with `{ source_subscription_id, tier, notes }`.

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { Subscription } from "@/lib/types";

export function RenewDialog({
  sourceSubscriptionId,
  productDisplay,
  sourceTier,
}: {
  sourceSubscriptionId: number;
  productDisplay: string;
  sourceTier: Subscription["tier"];
}) {
  const [open, setOpen] = useState(false);
  const [tier, setTier] = useState<string>(sourceTier);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const r = await fetch("/api/subscriptions/renew", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          source_subscription_id: sourceSubscriptionId,
          tier,
          notes: notes.trim() ? notes.trim() : undefined,
        }),
      });
      if (!r.ok) {
        const body = await r.json().catch(() => ({}));
        setError(body.error ?? "Could not submit renewal.");
        return;
      }
      setOpen(false);
      setNotes("");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">Renew</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Renew {productDisplay}</DialogTitle>
          <DialogDescription>
            Product is locked to the original subscription. Pick the tier you want for the renewal.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div className="space-y-1.5">
            <Label>Product</Label>
            <p className="text-sm font-medium">{productDisplay}</p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="tier">Tier</Label>
            <Select value={tier} onValueChange={setTier}>
              <SelectTrigger id="tier"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="monthly">Monthly</SelectItem>
                <SelectItem value="quarterly">Quarterly</SelectItem>
                <SelectItem value="yearly">Yearly</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="notes">Notes (optional)</Label>
            <Textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
            />
          </div>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? "Submitting…" : "Submit renewal"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Commit**

```bash
pnpm tsc --noEmit
git add components/user/renew-dialog.tsx docs/superpowers/plans/2026-05-06-roles-user-dashboard.md
git commit
```

Commit message: `feat(ui): RenewDialog with product locked from source`

---

## Task 17: `components/user/cancel-request-button.tsx`

**Files:**
- Create: `components/user/cancel-request-button.tsx`

- [ ] **Step 1: Implement**

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

export function CancelRequestButton({ subscriptionId }: { subscriptionId: number }) {
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  async function cancel() {
    if (!confirm("Cancel this pending request?")) return;
    setBusy(true);
    try {
      const r = await fetch(`/api/subscriptions/${subscriptionId}`, { method: "DELETE" });
      if (!r.ok) {
        const body = await r.json().catch(() => ({}));
        alert(body.error ?? "Could not cancel.");
        return;
      }
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button size="sm" variant="ghost" onClick={cancel} disabled={busy}>
      {busy ? "Cancelling…" : "Cancel request"}
    </Button>
  );
}
```

(Using the native `confirm()` is fine for v1 per the spec's no-bespoke-modal stance for this control. Plan 5 may swap in a confirm dialog if the admin-revoke flow shares one.)

- [ ] **Step 2: Commit**

```bash
pnpm tsc --noEmit
git add components/user/cancel-request-button.tsx docs/superpowers/plans/2026-05-06-roles-user-dashboard.md
git commit
```

Commit message: `feat(ui): CancelRequestButton for pending subscriptions`

---

## Task 18: `components/shared/expired-banner.tsx`

**Files:**
- Create: `components/shared/expired-banner.tsx`

- [ ] **Step 1: Implement**

```tsx
import { AlertTriangle } from "lucide-react";

export function ExpiredBanner({ count }: { count: number }) {
  return (
    <div className="mb-4 flex items-center gap-2 rounded-md border border-yellow-300/60 bg-yellow-50 p-3 text-yellow-900 dark:border-yellow-700/60 dark:bg-yellow-950/40 dark:text-yellow-200">
      <AlertTriangle className="h-4 w-4 shrink-0" />
      <p className="text-sm">
        You have {count} expired subscription{count === 1 ? "" : "s"}. Use the Renew button on the affected card to request a renewal.
      </p>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
pnpm tsc --noEmit
git add components/shared/expired-banner.tsx docs/superpowers/plans/2026-05-06-roles-user-dashboard.md
git commit
```

Commit message: `feat(ui): ExpiredBanner shared component`

---

## Task 19: `app/dashboard/page.tsx` — wire it all together

**Files:**
- Create: `app/dashboard/page.tsx`

- [ ] **Step 1: Implement**

```tsx
import { redirect } from "next/navigation";
import { getSupabaseSSR } from "@/lib/supabase/ssr";
import { getDashboardData } from "@/lib/dashboard-data";
import { SubscriptionCard } from "@/components/user/subscription-card";
import { RequestLicenseDialog } from "@/components/user/request-license-dialog";
import { ExpiredBanner } from "@/components/shared/expired-banner";

export default async function DashboardPage() {
  const sb = await getSupabaseSSR();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) redirect("/login");

  const items = await getDashboardData(user.id);
  const expiredCount = items.filter(
    (i) =>
      (i.subscription.status === "expired" || i.subscription.status === "revoked") &&
      // exclude when user already has a pending renewal — Plan 4 doesn't track
      // the link explicitly, so we only suppress when ANY pending exists. Good
      // enough heuristic; refined in Plan 5 once approve/reject lands.
      !items.some((j) => j.subscription.status === "pending"),
  ).length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">My subscriptions</h1>
        <RequestLicenseDialog />
      </div>

      {expiredCount > 0 ? <ExpiredBanner count={expiredCount} /> : null}

      {items.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center">
          <p className="text-sm text-muted-foreground">
            You don't have any subscriptions yet. Click "Request New License" to get started, or contact your admin.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {items.map((i) => (
            <SubscriptionCard key={i.subscription.id} data={i} />
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify in the browser**

Rebuild Docker, log in as a freshly-provisioned non-admin user (create one via `/admin/users/new` first while signed in as admin), confirm:

- Empty state renders if no subscriptions.
- Request a license → pending card shows; click Cancel → card disappears after refresh.
- Admin (still signed in elsewhere) creates a user with `initial_subscription` (existing flow); that user logging in sees one active card with two empty slots; clicking Add MT5 account on the live slot succeeds; the slot now shows the license.

- [ ] **Step 3: Commit**

```bash
pnpm tsc --noEmit && pnpm test
git add app/dashboard/page.tsx docs/superpowers/plans/2026-05-06-roles-user-dashboard.md
git commit
```

Commit message: `feat(dashboard): /dashboard page renders subscriptions + slots`

---

## Task 20: `app/dashboard/licenses/[id]/page.tsx` — user-side journal

**Files:**
- Create: `app/dashboard/licenses/[id]/page.tsx`
- Create: `app/dashboard/licenses/[id]/loading.tsx`

- [ ] **Step 1: Implement the page**

```tsx
import { notFound, redirect } from "next/navigation";
import { getSupabaseSSR } from "@/lib/supabase/ssr";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { JournalShell } from "@/components/journal/journal-shell";

export default async function UserJournalPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: idRaw } = await params;
  const id = Number(idRaw);
  if (!Number.isInteger(id) || id <= 0) notFound();

  const ssr = await getSupabaseSSR();
  const {
    data: { user },
  } = await ssr.auth.getUser();
  if (!user) redirect("/login");

  const sb = getSupabaseAdmin();
  const { data: license, error } = await sb
    .from("licenses")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!license) notFound();

  const role = (user.app_metadata?.role as "admin" | "user" | undefined) ?? null;
  if (role !== "admin" && license.user_id !== user.id) {
    notFound();
  }

  return <JournalShell license={license} />;
}
```

`app/dashboard/licenses/[id]/loading.tsx`: copy the existing `app/admin/licenses/[id]/journal/loading.tsx` verbatim if it exists, otherwise render a basic skeleton.

- [ ] **Step 2: Commit**

```bash
pnpm tsc --noEmit && pnpm test
git add app/dashboard/licenses/[id] docs/superpowers/plans/2026-05-06-roles-user-dashboard.md
git commit
```

Commit message: `feat(dashboard): user-side journal page scoped by ownership`

---

## Task 21: Manual end-to-end verification

**Files:**
- _(none)_

- [ ] **Step 1: Spin up the app**

```bash
pnpm tsc --noEmit && pnpm test
docker compose up -d --build
```

Open `http://copytraderx.local`.

- [ ] **Step 2: As admin — create a test user**

1. Sign in as `help.copytraderx@gmail.com`.
2. `/admin/users/new` → email `test-user-plan4@example.com`, full_name "Plan 4 Tester", initial_subscription: product=Impulse, tier=Monthly. Submit.
3. Confirm user appears in `/admin/users`. Note the temp password (or use admin "Resend welcome" if email isn't configured).

- [ ] **Step 3: As the test user — first login + change password**

1. Open a private window. `/login` → email + temp password → forced redirect to `/auth/change-password` → set a real password → redirected to `/dashboard`.
2. Confirm dashboard shows the Impulse Monthly card with two empty slots.

- [ ] **Step 4: Claim flows**

1. Click "Add MT5 account" on the live slot → enter `12345001` → submit.
2. Confirm slot now shows the MT5 number, an `IMPX-…` license_key, and an "Open journal" link.
3. Click "Open journal" → confirm `/dashboard/licenses/[id]` renders the JournalShell scoped to that account.
4. Try opening another user's journal by guessing a license id (e.g. `/dashboard/licenses/1` if id 1 belongs to another account). Confirm 404.
5. Repeat for the demo slot with MT5 `12345002`.

- [ ] **Step 5: Request flows**

1. On the dashboard, click "Request New License" → product=CTX Live, tier=Quarterly, notes "test request" → submit. Confirm pending card appears.
2. Click "Cancel request" → confirm → card disappears.
3. Submit another request, then sign in as admin in another window. Confirm the request shows in `/admin/licenses` (visual verification only — the Pending Requests panel isn't built until Plan 5; for now, query `subscriptions where status='pending'` directly via `/admin/users/[id]` if visible there, or `select * from public.subscriptions where status = 'pending'` in Supabase Studio).

- [ ] **Step 6: Renewal flow setup**

Manually flip a subscription to `expired` via Supabase Studio (`update public.subscriptions set status='expired', expires_at = now() - interval '1 day' where id = X`). Refresh the user dashboard and confirm:

- The "Expired" badge appears on the card.
- The "Renew" button appears.
- Clicking Renew opens the renew dialog with product locked to the source's product.
- Submitting creates a new pending row visible at the top of the dashboard.

- [ ] **Step 7: Cross-role access checks**

1. As the test user, hit `/admin/licenses` directly → should redirect to `/dashboard`.
2. As admin, hit `/dashboard` → should render (admins can browse).
3. As anonymous (sign out), hit `/dashboard` → redirect to `/login?next=/dashboard`.
4. Hit `/api/journal/12345001/snapshot` as the test user → 200. As a different user → 404. As anon → 401.

- [ ] **Step 8: Final commit — close out the plan**

Update Status block:

- **Last completed:** Task 21 — Plan 4 complete ✅
- **Next task to execute:** Plan 5 (`docs/superpowers/plans/2026-05-06-roles-requests-and-e2e.md` — write when ready)

```bash
git add docs/superpowers/plans/2026-05-06-roles-user-dashboard.md
git commit
```

Commit message: `docs(plan): close out Plan 4 — user dashboard, claim, request, renew`

---

## Coverage check

- [ ] **Spec coverage:**
  - §3.5 (products) → Tasks 4, 8, 14, 15, 16 (everywhere a product picker / display happens).
  - §4.1 (`/dashboard/*` routes) → Tasks 11, 19, 20.
  - §4.2 (three-layer enforcement) → Tasks 5, 6, 7, 8, 9, 10, 11, 19, 20.
  - §5.4 (quota derived) → Task 4 (loader counts active subscriptions implicitly via the cards rendered).
  - §5.6 (RLS sketch — server filtering in v1) → Tasks 9, 10.
  - §6.3 (claim a slot) → Tasks 8, 12, 13, 14.
  - §6.4 (request new license) → Tasks 5, 15, 19.
  - §6.6 partial (renew) → Tasks 7, 14, 16. Approval is Plan 5; cron expiry is Plan 5.
  - §8 (slot/license claiming edge cases) → Task 8 surfaces both unique-violation flavors.

Anything left from the spec lives in Plan 5: admin pending-requests panel, approve/reject API + UI, cron-driven expiry, admin revoke, the email senders for approve/reject, replacing the synthetic-subscription branch in admin-direct license create, and Playwright E2E.
