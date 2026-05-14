# Subscription Hide + Dashboard Pagination Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add user-controlled soft-delete (hide) of past subscriptions, an `EyeOff` indicator in admin views, and 6-cards-per-page pagination on both the main grid and the Past section.

**Architecture:** Schema adds a single nullable `hidden_at timestamptz` column on `subscriptions` (migration lives in the sibling Supabase project at `~/Documents/development/EA/JSONFX-IMPULSE/supabase/migrations/`). Two new API endpoints toggle `hidden_at`. `DashboardCardGrid` partitions visible vs hidden client-side and applies pagination to two independent slices. Admin pages get a small visual indicator only — no filtering changes.

**Tech Stack:** Supabase Postgres (migration), Next.js 16 App Router, TypeScript, jest, Tailwind CSS, shadcn UI (`Button`, `Tooltip`), `lucide-react`. Tests via `pnpm test`.

**Spec:** `docs/superpowers/specs/2026-05-14-subscription-hide-and-pagination-design.md`

**File map:**

| File | Action | Responsibility |
|---|---|---|
| `~/Documents/development/EA/JSONFX-IMPULSE/supabase/migrations/<timestamp>_subscriptions_hidden_at.sql` | Create | Add `hidden_at` column + partial index |
| `lib/types.ts` | Modify | Add `hidden_at: string \| null` to `Subscription` |
| `lib/subscription-state.ts` | Modify | Add `canHide` guard |
| `lib/subscription-state.test.ts` | Modify | Add jest tests for `canHide` |
| `app/api/subscriptions/[id]/hide/route.ts` | Create | `POST` (hide) + `DELETE` (unhide) handlers |
| `components/user/hide-subscription-button.tsx` | Create | Client button that calls POST `/hide` |
| `components/user/unhide-subscription-button.tsx` | Create | Client button that calls DELETE `/hide` |
| `components/user/subscription-card.tsx` | Modify | Render Hide / Unhide button in footer |
| `lib/dashboard-filters.ts` | Modify | Export `CARDS_PER_PAGE = 6` |
| `components/user/dashboard-pagination.tsx` | Create | Prev / Page X of N / Next control |
| `components/user/dashboard-card-grid.tsx` | Modify | Partition visible/hidden, "Show hidden" toggle, pagination state + slicing, exclude hidden from `renewableCount` |
| `components/admin/user-subscriptions-panel.tsx` | Modify | Render `EyeOff` icon + tooltip on rows where `hidden_at !== null` |

---

## Task 1: Add `hidden_at` column migration

**Files:**
- Create: `~/Documents/development/EA/JSONFX-IMPULSE/supabase/migrations/<UTC_TIMESTAMP>_subscriptions_hidden_at.sql`

Adds the column + partial index. Pure DB change; nothing else compiles against it yet.

- [ ] **Step 1: Generate a UTC timestamp prefix**

```bash
date -u +%Y%m%d%H%M%S
```

Use the output (e.g. `20260514120000`) as the filename prefix.

- [ ] **Step 2: Create the migration file**

Write `~/Documents/development/EA/JSONFX-IMPULSE/supabase/migrations/<UTC_TIMESTAMP>_subscriptions_hidden_at.sql`:

```sql
-- Subscription hide (soft-delete): per-user "out of sight" flag.
-- Null = visible to user. Non-null = user has hidden this row.
-- Admin queries see every row regardless.

alter table public.subscriptions
  add column hidden_at timestamptz;

create index idx_subscriptions_user_visible
  on public.subscriptions(user_id)
  where hidden_at is null;

comment on column public.subscriptions.hidden_at is
  'When set, the user has hidden this subscription from their dashboard. Null = visible. Admin sees regardless. Only respected by client when status is in (expired, revoked, rejected).';
```

- [ ] **Step 3: Apply the migration (user runs)**

The agent does NOT run this. Stop and ask the user to run:

```bash
cd ~/Documents/development/EA/JSONFX-IMPULSE
supabase db push
```

Then in Supabase Studio (or `psql`), verify:

```sql
select column_name, data_type, is_nullable
  from information_schema.columns
 where table_schema = 'public'
   and table_name = 'subscriptions'
   and column_name = 'hidden_at';
```

Expected: one row, `data_type=timestamp with time zone`, `is_nullable=YES`.

```sql
select indexname from pg_indexes
 where schemaname = 'public'
   and tablename = 'subscriptions'
   and indexname = 'idx_subscriptions_user_visible';
```

Expected: one row.

- [ ] **Step 4: Commit the migration file**

```bash
cd ~/Documents/development/EA/JSONFX-IMPULSE
git add supabase/migrations/<UTC_TIMESTAMP>_subscriptions_hidden_at.sql
git commit -m "migration: add hidden_at to subscriptions for user-side soft delete"
```

The agent does NOT commit in the copytraderx-license repo — that repo doesn't host the migration. Subsequent tasks happen there.

---

## Task 2: Add `hidden_at` to `Subscription` TypeScript type

**Files:**
- Modify: `lib/types.ts`

Once the column exists, propagate it through the type used everywhere.

- [ ] **Step 1: Edit `lib/types.ts`**

Open `/Users/jsonse/Documents/development/copytraderx-license/lib/types.ts`. Find the `Subscription` interface (around line 36). Add `hidden_at: string | null;` immediately after `created_at: string;`. The updated interface:

```ts
export interface Subscription {
  id: number;
  user_id: string;
  product: Product;
  tier: LicenseTier;
  status: SubscriptionStatus;
  requested_at: string;
  approved_at: string | null;
  approved_by: string | null;
  expires_at: string | null;
  rejection_reason: string | null;
  notes: string | null;
  created_at: string;
  hidden_at: string | null;            // null = visible to user, ISO timestamp = hidden
  push_interval_seconds: number;
  propfirm_rule_id: number | null;
}
```

No other field changes.

- [ ] **Step 2: Type-check**

```bash
cd /Users/jsonse/Documents/development/copytraderx-license
pnpm tsc --noEmit
```

Expected: PASS, zero errors. (`lib/dashboard-data.ts` uses `.select("*")` so the projection already returns `hidden_at` — nothing to change there.)

- [ ] **Step 3: Commit**

```bash
git add lib/types.ts
git commit -m "feat(types): add hidden_at to Subscription"
```

---

## Task 3: Add `canHide` guard with jest tests (TDD)

**Files:**
- Modify: `lib/subscription-state.ts`
- Modify: `lib/subscription-state.test.ts`

Pure logic — guards the hide endpoint and gives the UI a single source of truth.

- [ ] **Step 1: Write the failing tests**

Open `/Users/jsonse/Documents/development/copytraderx-license/lib/subscription-state.test.ts`. At the bottom of the file (after the last existing `describe` block), append:

```ts
describe("canHide", () => {
  it.each(["expired", "revoked", "rejected"] as const)(
    "allows hide on %s when not already hidden",
    (status) => {
      const r = canHide({ status, hidden_at: null });
      expect(r.ok).toBe(true);
    },
  );
  it.each(["active", "pending"] as const)("blocks hide on %s", (status) => {
    const r = canHide({ status, hidden_at: null });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("not_hideable");
  });
  it("blocks when already hidden", () => {
    const r = canHide({ status: "revoked", hidden_at: "2026-05-14T10:00:00Z" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("already_hidden");
  });
});
```

Then at the top of the file, update the import to include `canHide`. Find:

```ts
import {
  canCancel,
  canClaimOn,
  ...
```

and add `canHide,` alongside the existing imports.

- [ ] **Step 2: Run the failing tests**

```bash
pnpm test -- --runTestsByPath lib/subscription-state.test.ts
```

Expected: import error or `canHide is not defined` failure.

- [ ] **Step 3: Implement `canHide`**

Open `/Users/jsonse/Documents/development/copytraderx-license/lib/subscription-state.ts`. At the bottom of the file, append:

```ts
export function canHide(
  s: { status: SubscriptionStatus; hidden_at: string | null },
): GuardResult {
  if (s.hidden_at !== null) return { ok: false, reason: "already_hidden" };
  if (s.status === "expired" || s.status === "revoked" || s.status === "rejected") {
    return { ok: true };
  }
  return { ok: false, reason: "not_hideable" };
}
```

- [ ] **Step 4: Run the tests again**

```bash
pnpm test -- --runTestsByPath lib/subscription-state.test.ts
```

Expected: all green (including the 6 new test cases — 3 allow, 2 block by status, 1 block by already_hidden).

- [ ] **Step 5: Type-check**

```bash
pnpm tsc --noEmit
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/subscription-state.ts lib/subscription-state.test.ts
git commit -m "feat(state): add canHide guard with jest tests"
```

---

## Task 4: POST / DELETE `/api/subscriptions/[id]/hide` endpoints

**Files:**
- Create: `app/api/subscriptions/[id]/hide/route.ts`

User-owned soft-delete toggle. Follows the same SSR + admin client + ownership-check pattern as the existing `app/api/subscriptions/[id]/route.ts`.

- [ ] **Step 1: Create the route file**

Write `/Users/jsonse/Documents/development/copytraderx-license/app/api/subscriptions/[id]/hide/route.ts`:

```ts
import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { getSupabaseSSR } from "@/lib/supabase/ssr";
import { canHide } from "@/lib/subscription-state";

async function loadIdAndUser(
  ctx: { params: Promise<{ id: string }> },
) {
  const { id: idRaw } = await ctx.params;
  const id = Number(idRaw);
  if (!Number.isInteger(id) || id <= 0) {
    return { error: NextResponse.json({ error: "invalid_id" }, { status: 400 }) };
  }
  const ssr = await getSupabaseSSR();
  const {
    data: { user },
  } = await ssr.auth.getUser();
  if (!user) {
    return { error: NextResponse.json({ error: "unauthenticated" }, { status: 401 }) };
  }
  return { id, userId: user.id };
}

export async function POST(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const loaded = await loadIdAndUser(ctx);
  if ("error" in loaded) return loaded.error;
  const { id, userId } = loaded;

  const sb = getSupabaseAdmin();
  const { data: sub, error: fetchErr } = await sb
    .from("subscriptions")
    .select("id, user_id, status, hidden_at")
    .eq("id", id)
    .maybeSingle();

  if (fetchErr) {
    return NextResponse.json(
      { error: "lookup_failed", details: fetchErr.message },
      { status: 500 },
    );
  }
  if (!sub || sub.user_id !== userId) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  // Idempotent: already hidden → return current row.
  if (sub.hidden_at !== null) {
    const { data: existing, error } = await sb
      .from("subscriptions")
      .select()
      .eq("id", id)
      .single();
    if (error) {
      return NextResponse.json(
        { error: "lookup_failed", details: error.message },
        { status: 500 },
      );
    }
    return NextResponse.json({ subscription: existing });
  }

  const guard = canHide({ status: sub.status, hidden_at: sub.hidden_at });
  if (!guard.ok) {
    return NextResponse.json({ error: guard.reason }, { status: 409 });
  }

  const { data: updated, error: updErr } = await sb
    .from("subscriptions")
    .update({ hidden_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();

  if (updErr) {
    return NextResponse.json(
      { error: "update_failed", details: updErr.message },
      { status: 500 },
    );
  }

  return NextResponse.json({ subscription: updated });
}

export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const loaded = await loadIdAndUser(ctx);
  if ("error" in loaded) return loaded.error;
  const { id, userId } = loaded;

  const sb = getSupabaseAdmin();
  const { data: sub, error: fetchErr } = await sb
    .from("subscriptions")
    .select("id, user_id")
    .eq("id", id)
    .maybeSingle();

  if (fetchErr) {
    return NextResponse.json(
      { error: "lookup_failed", details: fetchErr.message },
      { status: 500 },
    );
  }
  if (!sub || sub.user_id !== userId) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const { data: updated, error: updErr } = await sb
    .from("subscriptions")
    .update({ hidden_at: null })
    .eq("id", id)
    .select()
    .single();

  if (updErr) {
    return NextResponse.json(
      { error: "update_failed", details: updErr.message },
      { status: 500 },
    );
  }

  return NextResponse.json({ subscription: updated });
}
```

- [ ] **Step 2: Type-check**

```bash
pnpm tsc --noEmit
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add app/api/subscriptions/[id]/hide/route.ts
git commit -m "feat(api): POST/DELETE /api/subscriptions/[id]/hide endpoints"
```

---

## Task 5: Hide / Unhide button components

**Files:**
- Create: `components/user/hide-subscription-button.tsx`
- Create: `components/user/unhide-subscription-button.tsx`

Two small button components mirroring the existing `CancelRequestButton` pattern (`components/user/cancel-request-button.tsx`).

- [ ] **Step 1: Create `hide-subscription-button.tsx`**

Write `/Users/jsonse/Documents/development/copytraderx-license/components/user/hide-subscription-button.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

export function HideSubscriptionButton({
  subscriptionId,
}: {
  subscriptionId: number;
}) {
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  async function hide() {
    if (busy) return;
    setBusy(true);
    try {
      const r = await fetch(`/api/subscriptions/${subscriptionId}/hide`, {
        method: "POST",
      });
      if (!r.ok) {
        const body = await r.json().catch(() => ({}));
        toast.error(body.error ?? "Could not hide subscription.");
        return;
      }
      toast.success("Hidden. Click 'Show hidden' in the Past section to bring it back.");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button size="sm" variant="ghost" onClick={hide} disabled={busy}>
      {busy ? "Hiding…" : "Hide"}
    </Button>
  );
}
```

- [ ] **Step 2: Create `unhide-subscription-button.tsx`**

Write `/Users/jsonse/Documents/development/copytraderx-license/components/user/unhide-subscription-button.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

export function UnhideSubscriptionButton({
  subscriptionId,
}: {
  subscriptionId: number;
}) {
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  async function unhide() {
    if (busy) return;
    setBusy(true);
    try {
      const r = await fetch(`/api/subscriptions/${subscriptionId}/hide`, {
        method: "DELETE",
      });
      if (!r.ok) {
        const body = await r.json().catch(() => ({}));
        toast.error(body.error ?? "Could not unhide subscription.");
        return;
      }
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button size="sm" variant="ghost" onClick={unhide} disabled={busy}>
      {busy ? "Unhiding…" : "Unhide"}
    </Button>
  );
}
```

- [ ] **Step 3: Type-check**

```bash
pnpm tsc --noEmit
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add components/user/hide-subscription-button.tsx components/user/unhide-subscription-button.tsx
git commit -m "feat(dashboard): Hide / Unhide subscription buttons"
```

---

## Task 6: Wire Hide / Unhide into `SubscriptionCard` footer

**Files:**
- Modify: `components/user/subscription-card.tsx`

Add the Hide button alongside Renew on past-and-visible cards. Add the Unhide button (instead of Hide) on past-and-hidden cards.

- [ ] **Step 1: Add imports**

In `components/user/subscription-card.tsx`, find the existing import block at the top. Add these two imports near the other `./` imports:

```ts
import { HideSubscriptionButton } from "./hide-subscription-button";
import { UnhideSubscriptionButton } from "./unhide-subscription-button";
```

- [ ] **Step 2: Update the footer rendering**

Find the `<CardFooter>` block (currently around lines 149-171). Replace it with:

```tsx
      <CardFooter className="justify-end gap-2 bg-muted/30">
        {sub.status === "active" ? (
          <ExtendDialog
            sourceSubscriptionId={sub.id}
            productDisplay={productDisplay}
            sourceTier={sub.tier}
            disabled={item.pendingExtension !== null}
          />
        ) : null}
        {sub.status === "pending" ? (
          <CancelRequestButton subscriptionId={sub.id} />
        ) : null}
        {sub.status === "expired" || sub.status === "revoked" ? (
          <RenewDialog
            sourceSubscriptionId={sub.id}
            productDisplay={productDisplay}
            sourceTier={sub.tier}
          />
        ) : null}
        {(sub.status === "expired" ||
          sub.status === "revoked" ||
          sub.status === "rejected") ? (
          sub.hidden_at !== null ? (
            <UnhideSubscriptionButton subscriptionId={sub.id} />
          ) : (
            <HideSubscriptionButton subscriptionId={sub.id} />
          )
        ) : null}
        {sub.status === "rejected" && sub.hidden_at !== null ? null : sub.status === "rejected" ? (
          /* keep the em-dash placeholder for rejected-and-visible only */
          null
        ) : null}
      </CardFooter>
```

Note: the old em-dash placeholder for `rejected` is removed because Hide/Unhide now always provides a footer button for rejected subs.

- [ ] **Step 3: Type-check**

```bash
pnpm tsc --noEmit
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add components/user/subscription-card.tsx
git commit -m "feat(dashboard): render Hide/Unhide button on past card footers"
```

---

## Task 7: Add `CARDS_PER_PAGE` and create `<DashboardPagination>`

**Files:**
- Modify: `lib/dashboard-filters.ts`
- Create: `components/user/dashboard-pagination.tsx`

Single constant + a tiny presentational component.

- [ ] **Step 1: Export the constant**

Open `lib/dashboard-filters.ts`. After the existing `export const DEFAULT_FILTERS = …;` block (and `export const LOCAL_STORAGE_KEY = …;`), add:

```ts
export const CARDS_PER_PAGE = 6;
```

- [ ] **Step 2: Create the pagination component**

Write `/Users/jsonse/Documents/development/copytraderx-license/components/user/dashboard-pagination.tsx`:

```tsx
"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

export function DashboardPagination({
  page,
  totalPages,
  onChange,
}: {
  page: number;
  totalPages: number;
  onChange: (p: number) => void;
}) {
  if (totalPages <= 1) return null;
  return (
    <div className="flex items-center justify-center gap-3 pt-2 text-sm text-muted-foreground">
      <Button
        type="button"
        size="sm"
        variant="ghost"
        className="h-8 gap-1"
        onClick={() => onChange(page - 1)}
        disabled={page <= 1}
        aria-label="Previous page"
      >
        <ChevronLeft className="h-4 w-4" aria-hidden />
        Prev
      </Button>
      <span>
        Page{" "}
        <span className="font-medium text-foreground">{page}</span> of{" "}
        {totalPages}
      </span>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        className="h-8 gap-1"
        onClick={() => onChange(page + 1)}
        disabled={page >= totalPages}
        aria-label="Next page"
      >
        Next
        <ChevronRight className="h-4 w-4" aria-hidden />
      </Button>
    </div>
  );
}
```

- [ ] **Step 3: Type-check**

```bash
pnpm tsc --noEmit
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add lib/dashboard-filters.ts components/user/dashboard-pagination.tsx
git commit -m "feat(dashboard): CARDS_PER_PAGE + DashboardPagination control"
```

---

## Task 8: Wire visible/hidden + pagination into `DashboardCardGrid`

**Files:**
- Modify: `components/user/dashboard-card-grid.tsx`

The integration task — partition items, render the "Show H hidden" toggle, apply pagination to both grids, exclude hidden subs from `renewableCount`.

- [ ] **Step 1: Rewrite the file**

Replace the contents of `/Users/jsonse/Documents/development/copytraderx-license/components/user/dashboard-card-grid.tsx` with:

```tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { PRODUCT_CODES } from "@/lib/products";
import type { Product } from "@/lib/products";
import { SubscriptionCard } from "./subscription-card";
import { ExpiredBanner } from "@/components/shared/expired-banner";
import { DashboardFilterToolbar } from "./dashboard-filter-toolbar";
import type { ProductOption } from "./dashboard-filter-product-chip";
import { DashboardPagination } from "./dashboard-pagination";
import {
  CARDS_PER_PAGE,
  DEFAULT_FILTERS,
  applyFilters,
  isDefault,
  loadFilters,
  saveFilters,
  sortItems,
  statusGroupOf,
  type FilterState,
} from "@/lib/dashboard-filters";
import { Button } from "@/components/ui/button";
import type { DashboardSubscription } from "@/lib/types";

function pastSortedByCreated(
  items: DashboardSubscription[],
): DashboardSubscription[] {
  return [...items].sort(
    (a, b) =>
      new Date(b.subscription.created_at).getTime() -
      new Date(a.subscription.created_at).getTime(),
  );
}

export function DashboardCardGrid({
  items,
}: {
  items: DashboardSubscription[];
}) {
  const [state, setState] = useState<FilterState>(DEFAULT_FILTERS);

  useEffect(() => {
    const loaded = loadFilters();
    if (loaded !== null) setState(loaded);
  }, []);

  useEffect(() => {
    saveFilters(state);
  }, [state]);

  // Partition: hidden subs are excluded from filter-based rendering entirely.
  const visibleItems = useMemo(
    () => items.filter((i) => i.subscription.hidden_at === null),
    [items],
  );
  const hiddenItems = useMemo(
    () => items.filter((i) => i.subscription.hidden_at !== null),
    [items],
  );

  // Product options use the FULL set of items so the user can still filter
  // products even if the only sub in that product is hidden.
  const productOptions = useMemo<ProductOption[]>(() => {
    const counts = new Map<Product, number>();
    for (const item of items) {
      const p = item.subscription.product;
      counts.set(p, (counts.get(p) ?? 0) + 1);
    }
    return PRODUCT_CODES.filter((p) => counts.has(p)).map((p) => ({
      product: p,
      count: counts.get(p)!,
    }));
  }, [items]);

  const statusAtDefault =
    state.statuses.length === DEFAULT_FILTERS.statuses.length &&
    DEFAULT_FILTERS.statuses.every((s) => state.statuses.includes(s));

  // Main grid: filter + sort the VISIBLE set only.
  const filtered = useMemo(
    () => applyFilters(visibleItems, state),
    [visibleItems, state],
  );
  const sortedMain = useMemo(
    () => sortItems(filtered, state.sort),
    [filtered, state.sort],
  );

  // Past section: derived from VISIBLE past items + (optionally) hidden past items.
  const pastVisible = useMemo(
    () =>
      pastSortedByCreated(
        visibleItems.filter(
          (i) => statusGroupOf(i.subscription.status) === "past",
        ),
      ),
    [visibleItems],
  );
  const pastHidden = useMemo(
    () =>
      pastSortedByCreated(
        hiddenItems.filter(
          (i) => statusGroupOf(i.subscription.status) === "past",
        ),
      ),
    [hiddenItems],
  );

  // Renewable banner counts VISIBLE past subs only.
  const renewableCount = pastVisible.filter(
    (i) =>
      i.subscription.status === "expired" ||
      i.subscription.status === "revoked",
  ).length;

  // Past section open/show-hidden state. Default: expand the section and
  // surface hidden cards if there are no visible past items but hidden ones
  // exist (otherwise the section header would say "(0)" and feel wrong).
  const initialPastOpen =
    sortedMain.length === 0 &&
    (pastVisible.length > 0 || pastHidden.length > 0);
  const initialShowHidden = pastVisible.length === 0 && pastHidden.length > 0;
  const [pastOpen, setPastOpen] = useState(initialPastOpen);
  const [showHiddenPast, setShowHiddenPast] = useState(initialShowHidden);
  const pastRef = useRef<HTMLDetailsElement | null>(null);

  // Pagination state.
  const [mainPage, setMainPage] = useState(1);
  const [pastPage, setPastPage] = useState(1);

  function openPastFromBanner() {
    setPastOpen(true);
    requestAnimationFrame(() => {
      pastRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  const pastCombined = showHiddenPast
    ? [...pastVisible, ...pastHidden]
    : pastVisible;

  // Compute totals and clamp current page.
  const mainTotalPages = Math.max(
    1,
    Math.ceil(sortedMain.length / CARDS_PER_PAGE),
  );
  const mainCurrentPage = Math.min(mainPage, mainTotalPages);
  const mainSlice = sortedMain.slice(
    (mainCurrentPage - 1) * CARDS_PER_PAGE,
    mainCurrentPage * CARDS_PER_PAGE,
  );

  const pastTotalPages = Math.max(
    1,
    Math.ceil(pastCombined.length / CARDS_PER_PAGE),
  );
  const pastCurrentPage = Math.min(pastPage, pastTotalPages);
  const pastSlice = pastCombined.slice(
    (pastCurrentPage - 1) * CARDS_PER_PAGE,
    pastCurrentPage * CARDS_PER_PAGE,
  );

  const mainGridEmpty = sortedMain.length === 0;
  const filterIsDefault = isDefault(state);

  return (
    <div className="space-y-4">
      <DashboardFilterToolbar
        state={state}
        onChange={setState}
        products={productOptions}
      />

      {statusAtDefault && renewableCount > 0 ? (
        <ExpiredBanner
          count={renewableCount}
          onOpenPast={openPastFromBanner}
        />
      ) : null}

      {!mainGridEmpty ? (
        <>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {mainSlice.map((item) => (
              <SubscriptionCard
                key={item.subscription.id}
                item={item}
                mode={
                  statusGroupOf(item.subscription.status) === "past"
                    ? "past"
                    : "current"
                }
              />
            ))}
          </div>
          <DashboardPagination
            page={mainCurrentPage}
            totalPages={mainTotalPages}
            onChange={setMainPage}
          />
        </>
      ) : filterIsDefault &&
        (pastVisible.length > 0 || pastHidden.length > 0) ? (
        <p className="text-sm text-muted-foreground">No active subscriptions.</p>
      ) : (
        <div className="flex flex-col items-start gap-2 rounded-md border border-dashed p-6">
          <p className="text-sm text-muted-foreground">
            No subscriptions match these filters.
          </p>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => setState(DEFAULT_FILTERS)}
          >
            Clear filters
          </Button>
        </div>
      )}

      {statusAtDefault &&
      (pastVisible.length > 0 || pastHidden.length > 0) ? (
        <details
          ref={pastRef}
          open={pastOpen}
          onToggle={(e) => setPastOpen(e.currentTarget.open)}
          id="past-subscriptions"
          className="group"
        >
          <summary className="flex cursor-pointer list-none items-center gap-3 py-2 text-sm font-semibold text-foreground/80 hover:text-foreground">
            <span>Past subscriptions</span>
            <span className="inline-flex h-5 items-center justify-center rounded-full bg-muted px-2 text-xs font-semibold text-foreground/70">
              {pastVisible.length}
            </span>
            {pastHidden.length > 0 ? (
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setShowHiddenPast((v) => !v);
                }}
                className="text-xs font-normal text-muted-foreground hover:text-foreground"
              >
                {showHiddenPast
                  ? `Hide ${pastHidden.length} hidden`
                  : `Show ${pastHidden.length} hidden`}
              </button>
            ) : null}
            <span className="h-px flex-1 bg-border" aria-hidden />
            <ChevronDown
              className="h-4 w-4 transition-transform group-open:rotate-180"
              aria-hidden
            />
          </summary>
          <p className="mb-3 mt-1 text-xs text-muted-foreground">
            Revoked, expired, or rejected. You can still renew expired or
            revoked subs, or re-open the journal of historic licenses.
          </p>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {pastSlice.map((item) => (
              <SubscriptionCard
                key={item.subscription.id}
                item={item}
                mode="past"
              />
            ))}
          </div>
          <DashboardPagination
            page={pastCurrentPage}
            totalPages={pastTotalPages}
            onChange={setPastPage}
          />
        </details>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 2: Type-check + build**

```bash
pnpm tsc --noEmit
```

Expected: PASS.

```bash
pnpm next build
```

Expected: build succeeds.

- [ ] **Step 3: Commit**

```bash
git add components/user/dashboard-card-grid.tsx
git commit -m "feat(dashboard): partition hidden subs + paginate main and past sections"
```

---

## Task 9: Admin `EyeOff` indicator on user-subscriptions panel

**Files:**
- Modify: `components/admin/user-subscriptions-panel.tsx`

Add a small inline indicator on subscription rows where `hidden_at !== null` so admin can see at a glance which ones the user has tucked away.

- [ ] **Step 1: Read the current panel to find the right insertion point**

Open `/Users/jsonse/Documents/development/copytraderx-license/components/admin/user-subscriptions-panel.tsx`. The component maps over `subscriptions` and renders each row's title + status badge near the top of the row. The exact JSX may have evolved; locate the block that renders the subscription's product name or title.

- [ ] **Step 2: Add the indicator imports**

Near the top of the file, alongside the existing imports, add:

```ts
import { EyeOff } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { formatDistanceToNow } from "date-fns";
```

- [ ] **Step 3: Render the indicator inline with the subscription title**

Inside the `.map((s) => …)` body, immediately after the element that displays the product / subscription title (look for the existing title rendering — likely a `<span>` or similar with `s.product` or a product display label), add this conditional block:

```tsx
{s.hidden_at !== null ? (
  <TooltipProvider delayDuration={150}>
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className="inline-flex items-center text-muted-foreground"
          aria-label="Hidden by user"
        >
          <EyeOff className="h-3 w-3" aria-hidden />
        </span>
      </TooltipTrigger>
      <TooltipContent side="top">
        Hidden by user · {formatDistanceToNow(new Date(s.hidden_at), { addSuffix: true })}
      </TooltipContent>
    </Tooltip>
  </TooltipProvider>
) : null}
```

Place it directly after the title text so it sits inline with the subscription name. Use the same `gap-1` or `inline-flex` wrapping the title cell already uses.

- [ ] **Step 4: Type-check**

```bash
pnpm tsc --noEmit
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add components/admin/user-subscriptions-panel.tsx
git commit -m "feat(admin): EyeOff indicator on user-hidden subscriptions"
```

---

## Task 10: Manual verification

**Files:** none modified.

Browser walkthrough on `copytraderx.lan/dashboard` and `/admin/users/<id>`.

- [ ] **Step 1: Rebuild the container**

```bash
docker compose up -d --build copytraderx-license
```

Wait for `✓ Ready in …`.

- [ ] **Step 2: Sign in as `json.alanano@gmail.com`**

Open `copytraderx.lan/dashboard`.

- [ ] **Step 3: Verify the Hide flow**

- Locate a card in the Past section (`Past subscriptions ▾` → expand).
- Each past card's footer shows `Renew · Hide` (or `Hide` alone for `rejected` ones).
- Click `Hide` on a revoked card. Toast `Hidden. Click 'Show hidden' in the Past section to bring it back.` appears.
- The card disappears from view; the Past section's count drops.
- The yellow banner count drops to match.

- [ ] **Step 4: Verify Show hidden + Unhide flow**

- The Past section header now reads `Past subscriptions (N) · Show 1 hidden ▾`.
- Click `Show 1 hidden`. The hidden card reappears at the bottom of the past grid, with `Unhide` button (and `Renew` if applicable).
- Click `Unhide`. The card returns to the visible past grid; the "Show 1 hidden" link goes away (or the count updates).

- [ ] **Step 5: Verify pagination on the main grid**

- If the account doesn't naturally have > 6 active subs, hide enough past cards on a test sub so that the Status filter "Past" doesn't bring them back — or use the Status filter to include Past, increasing main-grid count above 6.
- Confirm `Prev / Page X of N / Next` controls appear below the main grid.
- Click Next → second page renders; Prev returns. Clamping: change the filter to narrow to < 6 results — controls disappear because `totalPages <= 1`.

- [ ] **Step 6: Verify pagination inside the Past section**

- If the account has more than 6 visible past subs (combined with hidden via "Show hidden" if needed) confirm the same Prev/Next controls render below the past grid.
- Expand "Show hidden" → page count recomputes and may shift; ensure controls stay correct.

- [ ] **Step 7: Verify Past-Status filter interaction**

- Open the Status chip → check `Past` along with Active + Pending.
- Past cards merge into the main grid, sorted by current Sort option.
- The collapsible Past section and the banner both disappear.
- Hidden subs do **not** appear in this view (only visible past cards merge). To see hidden ones, the user has to uncheck Past and use "Show hidden" inside the section.

- [ ] **Step 8: Verify the admin indicator**

- In a separate tab / incognito window, sign in as the admin user.
- Navigate to `/admin/users/<user-id-of-json.alanano>`.
- The subscriptions panel for that user lists each subscription; any row whose `hidden_at` is non-null shows a small `EyeOff` icon next to the title with a tooltip `Hidden by user · <relative date>` on hover.

- [ ] **Step 9: Run the full test suite**

```bash
pnpm test
```

Expected: all suites green, including the new `canHide` tests added in Task 3.

- [ ] **Step 10: Commit any polish**

If the verification surfaced visual issues you adjusted (spacing, alignment), commit them:

```bash
git add components/
git commit -m "fix(dashboard): visual polish from manual verification"
```

If nothing was tweaked, skip this step.

---

## Self-review

- **Spec coverage:**
  - §4.1 migration → Task 1.
  - §4.2 API → Task 4.
  - §4.3 data-layer (hidden_at on Subscription type, no query change) → Task 2.
  - §4.4 filter integration (partition above `applyFilters`) → Task 8.
  - §5.1 Hide/Unhide button → Tasks 5 + 6.
  - §5.2 Show hidden toggle → Task 8.
  - §5.3 banner excludes hidden → Task 8 (`renewableCount` uses `pastVisible`).
  - §5.4 toast on hide → Task 5 (`hide-subscription-button.tsx`).
  - §6 admin indicator → Task 9.
  - §7 pagination (constant, component, slicing, controls) → Tasks 7 + 8.
  - §8 edge cases: idempotent hide → Task 4 early return; status transition while hidden → handled by Task 8 partitioning (only past statuses honor `hidden_at` for filtering); all-past-hidden refinement → Task 8 `initialShowHidden`.
  - §9 files touched → matches Tasks 1-9 exactly.

- **Placeholder scan:** Task 9 Step 1 says "the exact JSX may have evolved; locate the block" — that's a reading-not-doing instruction and Step 3 gives the actual code to insert. Acceptable. No "TBD" / "TODO" / "add validation" anywhere.

- **Type consistency:**
  - `Subscription.hidden_at` defined in Task 2 → used by Tasks 4 (`select("id, user_id, status, hidden_at")`), 6 (`sub.hidden_at !== null`), 8 (partitioning), 9 (indicator check).
  - `canHide({ status, hidden_at })` defined in Task 3 → used by Task 4 API guard.
  - `HideSubscriptionButton` / `UnhideSubscriptionButton` defined in Task 5 → imported by Task 6.
  - `CARDS_PER_PAGE` from `lib/dashboard-filters` in Task 7 → consumed in Task 8.
  - `DashboardPagination` from `./dashboard-pagination` in Task 7 → consumed in Task 8.
  - `pastVisible` + `pastHidden` + `pastCombined` naming consistent within Task 8.
  - `renewableCount` derived from `pastVisible` in Task 8 — matches spec §5.3.
