# User Journal Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the user-facing journal at `/dashboard/licenses/[id]` with a modern, filterable, paginated journal UI; introduce a global `%`/`$` display preference with per-journal session override; preserve the existing data layer and polling model.

**Architecture:** A new `user_preferences` table (delivered as a `.sql` migration in `docs/superpowers/plans/`) stores the global display preference. A `JournalChromeContext` seeds from the preference and exposes `%`/`$` + Range scope to every tab. Pure-function helpers (`format-pnl`, `baseline`, `order-display`, `histogram`) live under `lib/journal/`. Shared journal primitives (`KpiCard`, `Sparkline`, `SidePill`, `StatePill`, `FilterChip`, `Pagination`, `useTableState`) live under `components/journal/`. Each tab is rebuilt to consume these primitives. No API endpoints change; the page-level Range selector threads the existing `days` query param.

**Tech Stack:** Next.js 16 App Router, React 19, Tailwind v4, shadcn/ui (Tooltip, Popover, Select, Tabs, Card primitives present), radix-ui, react-hook-form + zod (settings form), Jest + ts-jest (unit), Playwright (E2E), Supabase (auth + DB via `@supabase/ssr` and service-role admin client), recharts (charts), date-fns.

**Spec:** `docs/superpowers/specs/2026-05-15-user-journal-redesign-design.md`

**Conventions (verified against existing repo code):**

- Tests live next to source: `lib/foo.ts` + `lib/foo.test.ts` — Jest with `ts-jest`, matched via `**/*.test.ts` / `**/*.test.tsx`.
- E2E specs in `e2e/<name>.spec.ts`; helpers in `e2e/helpers/`.
- Schema migrations are delivered as `.sql` files in `docs/superpowers/plans/` and applied via `supabase db push` from the EA repo.
- API routes: caller session via `getSupabaseSSR()`; service-role writes via `getSupabaseAdmin()`.
- Server actions: file at `app/<route>/actions.ts`, `"use server"` directive, returns `{ ok: true } | { error: string }`.
- Path alias `@/` → repo root (see `jest.config.*` `moduleNameMapper`).
- Component naming: PascalCase exports, kebab-case file names (e.g. `kpi-card.tsx` exports `KpiCard`).
- Commit messages: lowercase scope-prefixed (`feat(journal):`, `fix(journal):`, `test(journal):`, `refactor(journal):`).

**Phases (natural merge checkpoints):**

| Phase | Task range | Lands |
|---|---|---|
| 0 — Preferences foundation | T1–T3 | `user_preferences` table, `/dashboard/settings` page, nav entry |
| 1 — Pure helpers | T4–T7 | `format-pnl`, `baseline`, `order-display`, `histogram` with full test coverage |
| 2 — Chrome context + primitives | T8–T14 | `JournalChromeContext`, KPI card, sparkline, pills, filter chip + search, pagination, `useTableState` |
| 3 — Chrome rebuild | T15–T18 | Header polish, live account panel rebuild, toolbar, shell wiring |
| 4 — Tables | T19–T21 | Trades / Orders / Positions tables on the new row anatomy |
| 5 — Tab content | T22–T25 | Calendar heatmap, Performance grid + chart + extras, Objectives card grid, Overview hero |
| 6 — Smoke + cleanup | T26–T27 | Playwright smoke; delete dead components |

---

## Phase 0 — Preferences foundation

### Task 1: SQL migration for `user_preferences`

**Files:**
- Create: `docs/superpowers/plans/2026-05-15-user-preferences-migration.sql`

- [ ] **Step 1: Create the migration file**

```sql
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
```

- [ ] **Step 2: Commit the migration file**

```bash
git add docs/superpowers/plans/2026-05-15-user-preferences-migration.sql
git commit -m "feat(prefs): user_preferences migration for pnl_display"
```

---

### Task 2: Server helper `lib/preferences/server.ts`

**Files:**
- Create: `lib/preferences/server.ts`
- Create: `lib/preferences/server.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// lib/preferences/server.test.ts
import { resolvePnlDisplay } from "./server";

describe("resolvePnlDisplay", () => {
  it("returns 'percent' when row is null", () => {
    expect(resolvePnlDisplay(null)).toBe("percent");
  });

  it("returns 'percent' when row has invalid value", () => {
    expect(resolvePnlDisplay({ pnl_display: "garbage" } as never)).toBe("percent");
  });

  it("returns the stored value when valid", () => {
    expect(resolvePnlDisplay({ pnl_display: "dollar" })).toBe("dollar");
    expect(resolvePnlDisplay({ pnl_display: "percent" })).toBe("percent");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- lib/preferences/server.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the helper**

```ts
// lib/preferences/server.ts
import "server-only";
import { getSupabaseAdmin } from "@/lib/supabase/server";

export type PnlDisplay = "percent" | "dollar";

export interface UserPreferences {
  user_id: string;
  pnl_display: PnlDisplay;
  created_at: string;
  updated_at: string;
}

export function resolvePnlDisplay(row: Pick<UserPreferences, "pnl_display"> | null): PnlDisplay {
  if (!row) return "percent";
  return row.pnl_display === "dollar" ? "dollar" : "percent";
}

export async function getPnlDisplay(userId: string): Promise<PnlDisplay> {
  const sb = getSupabaseAdmin();
  const { data } = await sb
    .from("user_preferences")
    .select("pnl_display")
    .eq("user_id", userId)
    .maybeSingle();
  return resolvePnlDisplay(data as Pick<UserPreferences, "pnl_display"> | null);
}

export async function setPnlDisplay(userId: string, value: PnlDisplay): Promise<void> {
  const sb = getSupabaseAdmin();
  const { error } = await sb
    .from("user_preferences")
    .upsert({ user_id: userId, pnl_display: value }, { onConflict: "user_id" });
  if (error) throw error;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- lib/preferences/server.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/preferences/server.ts lib/preferences/server.test.ts
git commit -m "feat(prefs): server helper for pnl_display preference"
```

---

### Task 3: `/dashboard/settings` page + server action + nav entry

**Files:**
- Create: `app/dashboard/settings/page.tsx`
- Create: `app/dashboard/settings/actions.ts`
- Create: `components/user/preferences-form.tsx`
- Modify: `components/user/dashboard-nav.tsx`

- [ ] **Step 1: Write the server action**

```ts
// app/dashboard/settings/actions.ts
"use server";

import { revalidatePath } from "next/cache";
import { getSupabaseSSR } from "@/lib/supabase/ssr";
import { setPnlDisplay, type PnlDisplay } from "@/lib/preferences/server";

export async function updatePnlDisplay(value: PnlDisplay): Promise<{ ok: true } | { error: string }> {
  if (value !== "percent" && value !== "dollar") {
    return { error: "invalid_value" };
  }
  const ssr = await getSupabaseSSR();
  const { data: { user } } = await ssr.auth.getUser();
  if (!user) return { error: "unauthorized" };
  try {
    await setPnlDisplay(user.id, value);
  } catch {
    return { error: "write_failed" };
  }
  revalidatePath("/dashboard/settings");
  revalidatePath("/dashboard/licenses", "layout");
  return { ok: true };
}
```

- [ ] **Step 2: Write the preferences form (client)**

```tsx
// components/user/preferences-form.tsx
"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { updatePnlDisplay } from "@/app/dashboard/settings/actions";
import type { PnlDisplay } from "@/lib/preferences/server";

export function PreferencesForm({ initial }: { initial: PnlDisplay }) {
  const [pending, start] = useTransition();

  function choose(next: PnlDisplay) {
    if (next === initial || pending) return;
    start(async () => {
      const res = await updatePnlDisplay(next);
      if ("error" in res) toast.error("Couldn't save preference");
      else toast.success(`Showing P/L as ${next === "percent" ? "%" : "$"}`);
    });
  }

  return (
    <div className="space-y-3">
      <div>
        <div className="text-sm font-medium">Show P/L as</div>
        <p className="text-xs text-muted-foreground">
          How profits and losses display across the journal. You can still flip
          temporarily on each journal page.
        </p>
      </div>
      <div className="inline-flex gap-1 rounded-lg border bg-background p-1">
        {(["percent", "dollar"] as const).map((value) => (
          <Button
            key={value}
            type="button"
            variant="ghost"
            size="sm"
            disabled={pending}
            onClick={() => choose(value)}
            className={cn(
              "h-7 px-3 text-xs",
              initial === value && "bg-foreground text-background hover:bg-foreground/90 hover:text-background"
            )}
          >
            {value === "percent" ? "%" : "$"}
          </Button>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Write the settings page (server component)**

```tsx
// app/dashboard/settings/page.tsx
import { redirect } from "next/navigation";
import { getSupabaseSSR } from "@/lib/supabase/ssr";
import { getPnlDisplay } from "@/lib/preferences/server";
import { DashboardNav } from "@/components/user/dashboard-nav";
import { PreferencesForm } from "@/components/user/preferences-form";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const ssr = await getSupabaseSSR();
  const { data: { user } } = await ssr.auth.getUser();
  if (!user) redirect("/login");

  const pnlDisplay = await getPnlDisplay(user.id);

  return (
    <>
      <DashboardNav userEmail={user.email ?? ""} />
      <main className="mx-auto max-w-2xl space-y-8 px-6 py-10">
        <header>
          <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
          <p className="text-sm text-muted-foreground">Manage how the journal displays your trading activity.</p>
        </header>
        <section className="rounded-lg border bg-card p-5">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Preferences</h2>
          <div className="mt-4">
            <PreferencesForm initial={pnlDisplay} />
          </div>
        </section>
      </main>
    </>
  );
}
```

- [ ] **Step 4: Add Settings link to `DashboardNav`**

Modify `components/user/dashboard-nav.tsx` — add a Settings link in the right-side cluster, between the email and the ThemeToggle. The full replacement block for the `<div className="ml-auto …">`:

```tsx
<div className="ml-auto flex items-center gap-3">
  <span className="hidden text-sm text-muted-foreground sm:inline">
    {userEmail}
  </span>
  <Button asChild variant="ghost" size="sm">
    <Link href="/dashboard/settings">Settings</Link>
  </Button>
  <ThemeToggle />
  <Button variant="ghost" size="sm" onClick={logout}>
    Sign out
  </Button>
</div>
```

- [ ] **Step 5: Manual verification**

Run: `pnpm dev`, visit `/dashboard/settings`, toggle between `%` and `$`, refresh — value persists. Open Supabase: row exists in `public.user_preferences` for your user.

- [ ] **Step 6: Commit**

```bash
git add app/dashboard/settings components/user/preferences-form.tsx components/user/dashboard-nav.tsx
git commit -m "feat(prefs): /dashboard/settings page with pnl_display toggle"
```

---

## Phase 1 — Pure helpers

### Task 4: `lib/journal/format-pnl.ts`

**Files:**
- Create: `lib/journal/format-pnl.ts`
- Create: `lib/journal/format-pnl.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// lib/journal/format-pnl.test.ts
import { fmtPct, fmtCash, fmtPctOrCash } from "./format-pnl";

describe("fmtPct", () => {
  it("formats positives with a + and 2 decimals", () => {
    expect(fmtPct(3.51)).toBe("+3.51%");
  });
  it("formats negatives with an en-dash and 2 decimals", () => {
    expect(fmtPct(-3.51)).toBe("−3.51%");
  });
  it("renders zero as 0.00% with no sign", () => {
    expect(fmtPct(0)).toBe("0.00%");
  });
  it("clamps to 2 decimals", () => {
    expect(fmtPct(1.23456)).toBe("+1.23%");
  });
});

describe("fmtCash", () => {
  it("uses the provided currency", () => {
    expect(fmtCash(1234.5, "USD")).toBe("$1,234.50");
  });
  it("formats negative cash with a leading minus", () => {
    expect(fmtCash(-36.41, "USD")).toBe("-$36.41");
  });
});

describe("fmtPctOrCash", () => {
  it("returns formatted % when mode=percent and baseline>0", () => {
    expect(fmtPctOrCash(48.55, "percent", 1037, "USD")).toBe("+4.68%");
  });
  it("falls back to $ when baseline is 0", () => {
    expect(fmtPctOrCash(48.55, "percent", 0, "USD")).toBe("$48.55");
  });
  it("returns $ when mode=dollar regardless of baseline", () => {
    expect(fmtPctOrCash(48.55, "dollar", 1037, "USD")).toBe("$48.55");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test -- lib/journal/format-pnl.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// lib/journal/format-pnl.ts
const EN_DASH = "−";

export function fmtPct(n: number): string {
  if (!Number.isFinite(n)) return `${EN_DASH}—%`;
  const rounded = Math.round(n * 100) / 100;
  if (rounded === 0) return "0.00%";
  const sign = rounded > 0 ? "+" : EN_DASH;
  return `${sign}${Math.abs(rounded).toFixed(2)}%`;
}

export function fmtCash(n: number, currency: string): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
  }).format(n);
}

export type PnlDisplay = "percent" | "dollar";

export function fmtPctOrCash(
  cashValue: number,
  mode: PnlDisplay,
  baseline: number,
  currency: string,
): string {
  if (mode === "percent" && baseline > 0) {
    return fmtPct((cashValue / baseline) * 100);
  }
  return fmtCash(cashValue, currency);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test -- lib/journal/format-pnl.test.ts`
Expected: PASS, 9 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/journal/format-pnl.ts lib/journal/format-pnl.test.ts
git commit -m "feat(journal): fmtPct/fmtCash/fmtPctOrCash helpers"
```

---

### Task 5: `lib/journal/baseline.ts`

**Files:**
- Create: `lib/journal/baseline.ts`
- Create: `lib/journal/baseline.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// lib/journal/baseline.test.ts
import { resolveBaseline } from "./baseline";
import type { AccountSnapshotCurrent, AccountSnapshotDaily, PropfirmRule } from "@/lib/types";

const RULE: PropfirmRule = {
  id: 1, name: "10k", account_size: 10_000,
  max_daily_loss: 5, daily_loss_type: "percent", daily_loss_calc: "balance",
  max_total_loss: 10, total_loss_type: "percent",
  profit_target: 8, target_type: "percent",
  min_trading_days: 5, max_trading_days: null,
  created_at: "2026-05-01T00:00:00Z",
};
const SNAP: AccountSnapshotCurrent = {
  mt5_account: 1, balance: 9_651, equity: 9_651, margin: 0, free_margin: 9_651,
  margin_level: null, floating_pnl: 0, drawdown_pct: 0, leverage: 500,
  currency: "USD", server: null, pushed_at: "2026-05-15T00:00:00Z",
};
const DAILY = (date: string, balance_close: number): AccountSnapshotDaily =>
  ({ mt5_account: 1, trade_date: date, balance_close, equity_close: balance_close, daily_pnl: 0 });

describe("resolveBaseline", () => {
  it("uses rule.account_size when rule is present", () => {
    expect(resolveBaseline(RULE, [DAILY("2026-05-02", 9_900)], SNAP))
      .toEqual({ baseline: 10_000, source: "rule" });
  });
  it("falls back to earliest daily balance when no rule", () => {
    expect(resolveBaseline(null, [DAILY("2026-05-02", 9_900), DAILY("2026-05-03", 9_800)], SNAP))
      .toEqual({ baseline: 9_900, source: "first_daily" });
  });
  it("re-sorts daily ascending before picking first", () => {
    expect(resolveBaseline(null, [DAILY("2026-05-05", 9_500), DAILY("2026-05-02", 9_900)], SNAP))
      .toEqual({ baseline: 9_900, source: "first_daily" });
  });
  it("falls back to current snapshot balance when no rule and no daily", () => {
    expect(resolveBaseline(null, [], SNAP))
      .toEqual({ baseline: 9_651, source: "current" });
  });
  it("returns null source when nothing is available", () => {
    expect(resolveBaseline(null, [], null))
      .toEqual({ baseline: 0, source: null });
  });
  it("treats rule with zero account_size as no rule for baseline purposes", () => {
    expect(resolveBaseline({ ...RULE, account_size: 0 }, [DAILY("2026-05-02", 9_900)], SNAP))
      .toEqual({ baseline: 9_900, source: "first_daily" });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test -- lib/journal/baseline.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// lib/journal/baseline.ts
import type { AccountSnapshotCurrent, AccountSnapshotDaily, PropfirmRule } from "@/lib/types";

export type BaselineSource = "rule" | "first_daily" | "current" | null;

export interface BaselineResult {
  baseline: number;
  source: BaselineSource;
}

export function resolveBaseline(
  rule: PropfirmRule | null,
  daily: AccountSnapshotDaily[],
  snapshot: AccountSnapshotCurrent | null,
): BaselineResult {
  if (rule && rule.account_size > 0) {
    return { baseline: rule.account_size, source: "rule" };
  }
  if (daily.length > 0) {
    const earliest = [...daily].sort((a, b) =>
      a.trade_date < b.trade_date ? -1 : a.trade_date > b.trade_date ? 1 : 0
    )[0];
    return { baseline: earliest.balance_close, source: "first_daily" };
  }
  if (snapshot && snapshot.balance > 0) {
    return { baseline: snapshot.balance, source: "current" };
  }
  return { baseline: 0, source: null };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test -- lib/journal/baseline.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/journal/baseline.ts lib/journal/baseline.test.ts
git commit -m "feat(journal): resolveBaseline helper for %/% conversions"
```

---

### Task 6: `lib/journal/order-display.ts`

**Files:**
- Create: `lib/journal/order-display.ts`
- Create: `lib/journal/order-display.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// lib/journal/order-display.test.ts
import { humanizeOrderType, humanizeOrderState } from "./order-display";

describe("humanizeOrderType", () => {
  it("maps known MT5 enums", () => {
    expect(humanizeOrderType("order_type_buy")).toEqual({ label: "Buy", variant: "buy", outline: false });
    expect(humanizeOrderType("order_type_sell")).toEqual({ label: "Sell", variant: "sell", outline: false });
    expect(humanizeOrderType("order_type_buy_limit")).toEqual({ label: "Buy Limit", variant: "buy", outline: true });
    expect(humanizeOrderType("order_type_sell_limit")).toEqual({ label: "Sell Limit", variant: "sell", outline: true });
    expect(humanizeOrderType("order_type_buy_stop")).toEqual({ label: "Buy Stop", variant: "buy", outline: true });
    expect(humanizeOrderType("order_type_sell_stop")).toEqual({ label: "Sell Stop", variant: "sell", outline: true });
    expect(humanizeOrderType("order_type_buy_stop_limit")).toEqual({ label: "Buy Stop Limit", variant: "buy", outline: true });
    expect(humanizeOrderType("order_type_sell_stop_limit")).toEqual({ label: "Sell Stop Limit", variant: "sell", outline: true });
    expect(humanizeOrderType("order_type_close_by")).toEqual({ label: "Close By", variant: "neutral", outline: false });
  });
  it("falls back to titlecase for unknown values without throwing", () => {
    expect(humanizeOrderType("order_type_foo_bar"))
      .toEqual({ label: "Foo Bar", variant: "neutral", outline: false });
    expect(humanizeOrderType("totally_unknown"))
      .toEqual({ label: "Totally Unknown", variant: "neutral", outline: false });
  });
});

describe("humanizeOrderState", () => {
  it("maps known MT5 enums", () => {
    expect(humanizeOrderState("order_state_filled")).toEqual({ label: "Filled", variant: "ok" });
    expect(humanizeOrderState("order_state_canceled")).toEqual({ label: "Canceled", variant: "neutral" });
    expect(humanizeOrderState("order_state_partial")).toEqual({ label: "Partial", variant: "warn" });
    expect(humanizeOrderState("order_state_placed")).toEqual({ label: "Pending", variant: "info" });
    expect(humanizeOrderState("order_state_rejected")).toEqual({ label: "Rejected", variant: "bad" });
    expect(humanizeOrderState("order_state_expired")).toEqual({ label: "Expired", variant: "neutral" });
  });
  it("falls back to titlecase neutral for unknown", () => {
    expect(humanizeOrderState("order_state_weird_thing"))
      .toEqual({ label: "Weird Thing", variant: "neutral" });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test -- lib/journal/order-display.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// lib/journal/order-display.ts
export type OrderSideVariant = "buy" | "sell" | "neutral";
export type OrderStateVariant = "ok" | "warn" | "bad" | "info" | "neutral";

export interface OrderTypeDisplay {
  label: string;
  variant: OrderSideVariant;
  outline: boolean;
}

export interface OrderStateDisplay {
  label: string;
  variant: OrderStateVariant;
}

const TYPE_MAP: Record<string, OrderTypeDisplay> = {
  order_type_buy:              { label: "Buy",             variant: "buy",     outline: false },
  order_type_sell:             { label: "Sell",            variant: "sell",    outline: false },
  order_type_buy_limit:        { label: "Buy Limit",       variant: "buy",     outline: true  },
  order_type_sell_limit:       { label: "Sell Limit",      variant: "sell",    outline: true  },
  order_type_buy_stop:         { label: "Buy Stop",        variant: "buy",     outline: true  },
  order_type_sell_stop:        { label: "Sell Stop",       variant: "sell",    outline: true  },
  order_type_buy_stop_limit:   { label: "Buy Stop Limit",  variant: "buy",     outline: true  },
  order_type_sell_stop_limit:  { label: "Sell Stop Limit", variant: "sell",    outline: true  },
  order_type_close_by:         { label: "Close By",        variant: "neutral", outline: false },
};

const STATE_MAP: Record<string, OrderStateDisplay> = {
  order_state_filled:   { label: "Filled",   variant: "ok"      },
  order_state_canceled: { label: "Canceled", variant: "neutral" },
  order_state_partial:  { label: "Partial",  variant: "warn"    },
  order_state_placed:   { label: "Pending",  variant: "info"    },
  order_state_rejected: { label: "Rejected", variant: "bad"     },
  order_state_expired:  { label: "Expired",  variant: "neutral" },
};

function titleCase(value: string): string {
  return value
    .replace(/^order_(type|state)_/, "")
    .split("_")
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

export function humanizeOrderType(raw: string): OrderTypeDisplay {
  return TYPE_MAP[raw] ?? { label: titleCase(raw), variant: "neutral", outline: false };
}

export function humanizeOrderState(raw: string): OrderStateDisplay {
  return STATE_MAP[raw] ?? { label: titleCase(raw), variant: "neutral" };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test -- lib/journal/order-display.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/journal/order-display.ts lib/journal/order-display.test.ts
git commit -m "feat(journal): humanize MT5 order type/state enums"
```

---

### Task 7: `lib/journal/histogram.ts`

**Files:**
- Create: `lib/journal/histogram.ts`
- Create: `lib/journal/histogram.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// lib/journal/histogram.test.ts
import { binPnlDistribution } from "./histogram";

describe("binPnlDistribution", () => {
  it("returns an empty result for an empty input", () => {
    expect(binPnlDistribution([], 10)).toEqual({ bins: [], min: 0, max: 0 });
  });
  it("places values into the requested bin count between min and max", () => {
    const result = binPnlDistribution([-2, -1, 0, 1, 5], 5);
    expect(result.bins).toHaveLength(5);
    expect(result.bins.reduce((a, b) => a + b.count, 0)).toBe(5);
    expect(result.min).toBe(-2);
    expect(result.max).toBe(5);
  });
  it("clamps a single-value series into one nonzero bin", () => {
    const r = binPnlDistribution([3], 4);
    expect(r.bins.reduce((a, b) => a + b.count, 0)).toBe(1);
  });
  it("labels each bin with a sign (win / loss / zero)", () => {
    const r = binPnlDistribution([-5, -1, 0, 1, 5], 5);
    const signs = r.bins.map((b) => b.sign);
    expect(signs).toContain("win");
    expect(signs).toContain("loss");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test -- lib/journal/histogram.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// lib/journal/histogram.ts
export type BinSign = "win" | "loss" | "zero";

export interface HistogramBin {
  start: number;
  end: number;
  count: number;
  sign: BinSign;
}

export interface HistogramResult {
  bins: HistogramBin[];
  min: number;
  max: number;
}

export function binPnlDistribution(values: number[], binCount: number): HistogramResult {
  if (values.length === 0 || binCount <= 0) {
    return { bins: [], min: 0, max: 0 };
  }
  const min = Math.min(...values);
  const max = Math.max(...values);
  if (min === max) {
    const sign: BinSign = min > 0 ? "win" : min < 0 ? "loss" : "zero";
    return { bins: [{ start: min, end: max, count: values.length, sign }], min, max };
  }
  const step = (max - min) / binCount;
  const bins: HistogramBin[] = Array.from({ length: binCount }, (_, i) => {
    const start = min + step * i;
    const end = i === binCount - 1 ? max : start + step;
    const mid = (start + end) / 2;
    const sign: BinSign = mid > 0.0001 ? "win" : mid < -0.0001 ? "loss" : "zero";
    return { start, end, count: 0, sign };
  });
  for (const v of values) {
    const idx = Math.min(binCount - 1, Math.max(0, Math.floor((v - min) / step)));
    bins[idx].count += 1;
  }
  return { bins, min, max };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test -- lib/journal/histogram.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/journal/histogram.ts lib/journal/histogram.test.ts
git commit -m "feat(journal): per-trade P/L distribution binning helper"
```

---

*Phase 1 checkpoint:* `pnpm test -- lib/journal/` should pass.

---

## Phase 2 — Chrome context + primitives

### Task 8: `JournalChromeContext` + hooks

**Files:**
- Create: `components/journal/preferences/journal-chrome-context.tsx`
- Create: `components/journal/preferences/use-pnl-display.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// components/journal/preferences/use-pnl-display.test.tsx
import { render, screen, act } from "@testing-library/react";
import { JournalChromeProvider, usePnlDisplay, useRangeScope } from "./journal-chrome-context";

function Probe() {
  const { mode, setMode, source } = usePnlDisplay();
  const { range, setRange } = useRangeScope();
  return (
    <div>
      <span data-testid="mode">{mode}</span>
      <span data-testid="source">{source}</span>
      <span data-testid="range">{range}</span>
      <button onClick={() => setMode("dollar")}>D</button>
      <button onClick={() => setRange(7)}>7d</button>
    </div>
  );
}

describe("JournalChromeProvider", () => {
  beforeEach(() => window.localStorage.clear());

  it("starts in global preference, source=global", () => {
    render(<JournalChromeProvider licenseId={1} initialPnlDisplay="percent" initialRangeDays={30}><Probe /></JournalChromeProvider>);
    expect(screen.getByTestId("mode").textContent).toBe("percent");
    expect(screen.getByTestId("source").textContent).toBe("global");
    expect(screen.getByTestId("range").textContent).toBe("30");
  });

  it("setMode writes localStorage and flips source to override", () => {
    render(<JournalChromeProvider licenseId={1} initialPnlDisplay="percent" initialRangeDays={30}><Probe /></JournalChromeProvider>);
    act(() => { screen.getByText("D").click(); });
    expect(screen.getByTestId("mode").textContent).toBe("dollar");
    expect(screen.getByTestId("source").textContent).toBe("override");
    expect(window.localStorage.getItem("journal:pnl-display:1")).toBe("dollar");
  });

  it("hydrates from localStorage override on mount", () => {
    window.localStorage.setItem("journal:pnl-display:1", "dollar");
    render(<JournalChromeProvider licenseId={1} initialPnlDisplay="percent" initialRangeDays={30}><Probe /></JournalChromeProvider>);
    expect(screen.getByTestId("mode").textContent).toBe("dollar");
    expect(screen.getByTestId("source").textContent).toBe("override");
  });

  it("setRange updates the range scope", () => {
    render(<JournalChromeProvider licenseId={1} initialPnlDisplay="percent" initialRangeDays={30}><Probe /></JournalChromeProvider>);
    act(() => { screen.getByText("7d").click(); });
    expect(screen.getByTestId("range").textContent).toBe("7");
  });
});
```

- [ ] **Step 2: Add @testing-library if missing**

Check `package.json` dependencies. If `@testing-library/react` / `@testing-library/jest-dom` are absent, install:

```bash
pnpm add -D @testing-library/react @testing-library/jest-dom jest-environment-jsdom
```

Update `jest.config.ts` to use `jest-environment-jsdom` for `*.test.tsx`:

```ts
// jest.config.ts (after edit)
const config = {
  preset: "ts-jest",
  testEnvironment: "node",
  testMatch: ["**/*.test.ts", "**/*.test.tsx"],
  moduleNameMapper: { "^@/(.*)$": "<rootDir>/$1" },
  projects: [
    {
      displayName: "node",
      testEnvironment: "node",
      testMatch: ["**/*.test.ts"],
      preset: "ts-jest",
      moduleNameMapper: { "^@/(.*)$": "<rootDir>/$1" },
    },
    {
      displayName: "jsdom",
      testEnvironment: "jsdom",
      testMatch: ["**/*.test.tsx"],
      preset: "ts-jest",
      moduleNameMapper: { "^@/(.*)$": "<rootDir>/$1" },
    },
  ],
};
export default config;
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm test -- components/journal/preferences/use-pnl-display.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement the provider**

```tsx
// components/journal/preferences/journal-chrome-context.tsx
"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { PnlDisplay } from "@/lib/preferences/server";

export type PnlDisplaySource = "global" | "override";
export type RangeDays = 7 | 30 | 90 | 0;

interface ChromeState {
  mode: PnlDisplay;
  source: PnlDisplaySource;
  setMode: (v: PnlDisplay) => void;
  range: RangeDays;
  setRange: (v: RangeDays) => void;
  licenseId: number;
}

const Ctx = createContext<ChromeState | null>(null);

function storageKey(licenseId: number) {
  return `journal:pnl-display:${licenseId}`;
}

export function JournalChromeProvider({
  licenseId, initialPnlDisplay, initialRangeDays, children,
}: {
  licenseId: number;
  initialPnlDisplay: PnlDisplay;
  initialRangeDays: RangeDays;
  children: React.ReactNode;
}) {
  const [mode, setModeState] = useState<PnlDisplay>(initialPnlDisplay);
  const [source, setSource] = useState<PnlDisplaySource>("global");
  const [range, setRange] = useState<RangeDays>(initialRangeDays);

  // Hydrate from localStorage on mount.
  useEffect(() => {
    const raw = window.localStorage.getItem(storageKey(licenseId));
    if (raw === "percent" || raw === "dollar") {
      setModeState(raw);
      setSource("override");
    }
  }, [licenseId]);

  const setMode = useCallback((v: PnlDisplay) => {
    setModeState(v);
    setSource("override");
    window.localStorage.setItem(storageKey(licenseId), v);
  }, [licenseId]);

  const value = useMemo<ChromeState>(() => ({
    mode, source, setMode, range, setRange, licenseId,
  }), [mode, source, setMode, range, licenseId]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function usePnlDisplay() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("usePnlDisplay must be used inside <JournalChromeProvider>");
  return { mode: ctx.mode, setMode: ctx.setMode, source: ctx.source };
}

export function useRangeScope() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useRangeScope must be used inside <JournalChromeProvider>");
  return { range: ctx.range, setRange: ctx.setRange };
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm test -- components/journal/preferences/use-pnl-display.test.tsx`
Expected: PASS, 4 tests.

- [ ] **Step 6: Commit**

```bash
git add components/journal/preferences jest.config.* package.json pnpm-lock.yaml
git commit -m "feat(journal): JournalChromeProvider + usePnlDisplay/useRangeScope"
```

---

### Task 9: `components/journal/sparkline.tsx`

**Files:**
- Create: `components/journal/sparkline.tsx`

- [ ] **Step 1: Implement the primitive**

```tsx
// components/journal/sparkline.tsx
"use client";

import { useId } from "react";
import { cn } from "@/lib/utils";

export type SparklineTone = "positive" | "negative" | "neutral";

interface Props {
  values: number[];
  tone?: SparklineTone;
  className?: string;
  height?: number;
}

const TONE = {
  positive: "#059669",
  negative: "#dc2626",
  neutral:  "#64748b",
} as const;

export function Sparkline({ values, tone = "neutral", className, height = 44 }: Props) {
  const gradId = useId();
  if (values.length < 2) {
    return <div className={cn("w-full", className)} style={{ height }} />;
  }
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const w = 200;
  const padTop = 6;
  const padBot = 6;
  const innerH = height - padTop - padBot;
  const points = values.map((v, i) => {
    const x = (i / (values.length - 1)) * w;
    const y = padTop + (1 - (v - min) / span) * innerH;
    return [x, y] as const;
  });
  const pathLine = points.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`).join(" ");
  const pathArea = `${pathLine} L${w},${height} L0,${height} Z`;
  const stroke = TONE[tone];

  return (
    <svg className={cn("block w-full", className)} viewBox={`0 0 ${w} ${height}`} preserveAspectRatio="none" height={height}>
      <defs>
        <linearGradient id={gradId} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={stroke} stopOpacity={0.18} />
          <stop offset="100%" stopColor={stroke} stopOpacity={0} />
        </linearGradient>
      </defs>
      <path d={pathArea} fill={`url(#${gradId})`} />
      <path d={pathLine} fill="none" stroke={stroke} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add components/journal/sparkline.tsx
git commit -m "feat(journal): Sparkline area-strip primitive"
```

---

### Task 10: `components/journal/kpi-card.tsx`

**Files:**
- Create: `components/journal/kpi-card.tsx`

- [ ] **Step 1: Implement**

```tsx
// components/journal/kpi-card.tsx
import { cn } from "@/lib/utils";
import { Sparkline, type SparklineTone } from "./sparkline";

interface Props {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  tone?: "positive" | "negative" | "neutral";
  series?: number[];
  seriesTone?: SparklineTone;
  className?: string;
  featured?: boolean;
}

const VALUE_TONE = {
  positive: "text-emerald-600 dark:text-emerald-400",
  negative: "text-red-600 dark:text-red-400",
  neutral:  "text-foreground",
} as const;

export function KpiCard({
  label, value, sub, tone = "neutral", series, seriesTone, className, featured,
}: Props) {
  const hasStrip = Array.isArray(series) && series.length >= 2;
  return (
    <div
      className={cn(
        "flex flex-col overflow-hidden rounded-xl border bg-card",
        featured && "bg-gradient-to-br from-muted/40 to-card",
        className,
      )}
    >
      <div className="px-4 py-3">
        <div className="text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</div>
        <div className={cn("mt-1 text-[22px] font-bold leading-tight tracking-tight tabular-nums", VALUE_TONE[tone])}>
          {value}
        </div>
        {sub != null && <div className="mt-1 text-xs text-muted-foreground">{sub}</div>}
      </div>
      {hasStrip && (
        <div className="border-t border-border/60 bg-gradient-to-b from-transparent to-muted/30">
          <Sparkline values={series} tone={seriesTone ?? tone === "neutral" ? "neutral" : seriesTone ?? tone} height={44} />
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add components/journal/kpi-card.tsx
git commit -m "feat(journal): KpiCard with bottom-strip sparkline lane"
```

---

### Task 11: `SidePill` + `StatePill` + `RowRail`

**Files:**
- Create: `components/journal/tables/side-pill.tsx`
- Create: `components/journal/tables/state-pill.tsx`
- Create: `components/journal/tables/row-rail.tsx`

- [ ] **Step 1: Implement SidePill**

```tsx
// components/journal/tables/side-pill.tsx
import { cn } from "@/lib/utils";

type Variant = "buy" | "sell" | "neutral";

const STYLES: Record<Variant, string> = {
  buy:     "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400",
  sell:    "bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-400",
  neutral: "bg-muted text-muted-foreground",
};

export function SidePill({ variant, outline, children }: {
  variant: Variant;
  outline?: boolean;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-wider",
        STYLES[variant],
        outline && "border border-dashed",
        outline && variant === "buy" && "border-emerald-400/70",
        outline && variant === "sell" && "border-red-400/70",
        outline && variant === "neutral" && "border-muted-foreground/30",
      )}
    >
      {children}
    </span>
  );
}
```

- [ ] **Step 2: Implement StatePill**

```tsx
// components/journal/tables/state-pill.tsx
import { cn } from "@/lib/utils";

type Variant = "ok" | "warn" | "bad" | "info" | "neutral";

const STYLES: Record<Variant, string> = {
  ok:      "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400",
  warn:    "bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-400",
  bad:     "bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-400",
  info:    "bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400",
  neutral: "bg-muted text-muted-foreground",
};

export function StatePill({ variant, children }: { variant: Variant; children: React.ReactNode }) {
  return (
    <span className={cn("inline-flex items-center rounded-md px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-wider", STYLES[variant])}>
      {children}
    </span>
  );
}
```

- [ ] **Step 3: Implement RowRail wrapper**

```tsx
// components/journal/tables/row-rail.tsx
import { cn } from "@/lib/utils";

type Variant = "buy" | "sell" | "neutral";

export function RowRailCell({ variant, children, className }: {
  variant: Variant;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <td className={cn("relative py-3 pl-3.5 pr-2", className)}>
      <span
        aria-hidden
        className={cn(
          "pointer-events-none absolute left-0 top-2 bottom-2 w-[3px] rounded-sm",
          variant === "buy" && "bg-emerald-500",
          variant === "sell" && "bg-red-500",
          variant === "neutral" && "bg-slate-300 dark:bg-slate-600",
        )}
      />
      {children}
    </td>
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add components/journal/tables/side-pill.tsx components/journal/tables/state-pill.tsx components/journal/tables/row-rail.tsx
git commit -m "feat(journal): shared SidePill / StatePill / RowRail primitives"
```

---

### Task 12: `FilterChip` + `FilterSearch`

**Files:**
- Create: `components/journal/filters/filter-chip.tsx`
- Create: `components/journal/filters/filter-search.tsx`

- [ ] **Step 1: Implement FilterChip**

```tsx
// components/journal/filters/filter-chip.tsx
"use client";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface Option { value: string; label: string }

interface BaseProps {
  label: string;
  active?: boolean;
  className?: string;
}

export function ToggleChip({ label, active, count, onClick }: BaseProps & {
  count?: number; onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs transition-colors",
        active
          ? "border-foreground bg-foreground text-background"
          : "border-border bg-background text-muted-foreground hover:text-foreground"
      )}
    >
      {label}
      {typeof count === "number" && (
        <span className={cn(
          "rounded px-1.5 text-[10px] font-bold",
          active ? "bg-background text-foreground" : "bg-muted text-muted-foreground"
        )}>{count}</span>
      )}
    </button>
  );
}

export function SelectChip({ label, value, options, onChange, className }: BaseProps & {
  value: string | null;
  options: Option[];
  onChange: (v: string | null) => void;
}) {
  const current = options.find((o) => o.value === value) ?? null;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-3 py-1 text-xs text-muted-foreground hover:text-foreground",
            current && "text-foreground",
            className
          )}
        >
          <span>{label}: {current?.label ?? "All"}</span>
          <span aria-hidden>▾</span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-48 p-1">
        <Button variant="ghost" size="sm" className="w-full justify-start text-xs" onClick={() => onChange(null)}>
          Clear
        </Button>
        {options.map((o) => (
          <Button
            key={o.value}
            variant="ghost"
            size="sm"
            className={cn(
              "w-full justify-start text-xs",
              value === o.value && "bg-muted"
            )}
            onClick={() => onChange(o.value)}
          >
            {o.label}
          </Button>
        ))}
      </PopoverContent>
    </Popover>
  );
}
```

- [ ] **Step 2: Implement FilterSearch**

```tsx
// components/journal/filters/filter-search.tsx
"use client";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export function FilterSearch({ value, onChange, placeholder = "Search…", className }: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
}) {
  return (
    <Input
      type="search"
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.currentTarget.value)}
      className={cn("h-7 w-44 rounded-lg text-xs", className)}
    />
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add components/journal/filters/filter-chip.tsx components/journal/filters/filter-search.tsx
git commit -m "feat(journal): FilterChip (toggle + select) and FilterSearch"
```

---

### Task 13: `Pagination` component

**Files:**
- Create: `components/journal/filters/pagination.tsx`
- Create: `components/journal/filters/pagination.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// components/journal/filters/pagination.test.tsx
import { render, screen, fireEvent } from "@testing-library/react";
import { Pagination } from "./pagination";

describe("Pagination", () => {
  it("shows range indicator and page buttons", () => {
    render(<Pagination total={73} page={2} pageSize={25} onPageChange={() => {}} onPageSizeChange={() => {}} />);
    expect(screen.getByText("Showing 26–50 of 73")).toBeInTheDocument();
    expect(screen.getByText("1")).toBeInTheDocument();
    expect(screen.getByText("2")).toHaveAttribute("aria-current", "page");
    expect(screen.getByText("3")).toBeInTheDocument();
  });
  it("calls onPageChange when a page button is clicked", () => {
    const onPageChange = jest.fn();
    render(<Pagination total={73} page={1} pageSize={25} onPageChange={onPageChange} onPageSizeChange={() => {}} />);
    fireEvent.click(screen.getByText("Next ›"));
    expect(onPageChange).toHaveBeenCalledWith(2);
  });
  it("disables prev on first page and next on last", () => {
    const { rerender } = render(<Pagination total={50} page={1} pageSize={25} onPageChange={() => {}} onPageSizeChange={() => {}} />);
    expect(screen.getByText("‹ Prev")).toBeDisabled();
    rerender(<Pagination total={50} page={2} pageSize={25} onPageChange={() => {}} onPageSizeChange={() => {}} />);
    expect(screen.getByText("Next ›")).toBeDisabled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- components/journal/filters/pagination.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```tsx
// components/journal/filters/pagination.tsx
"use client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface Props {
  total: number;
  page: number;             // 1-based
  pageSize: number;
  pageSizeOptions?: number[];
  onPageChange: (p: number) => void;
  onPageSizeChange: (n: number) => void;
}

export function Pagination({
  total, page, pageSize, pageSizeOptions = [10, 25, 50, 100], onPageChange, onPageSizeChange,
}: Props) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const startIdx = total === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const endIdx = Math.min(total, safePage * pageSize);

  const windowSize = 5;
  const half = Math.floor(windowSize / 2);
  let first = Math.max(1, safePage - half);
  let last = Math.min(totalPages, first + windowSize - 1);
  first = Math.max(1, last - windowSize + 1);
  const pages: number[] = [];
  for (let p = first; p <= last; p++) pages.push(p);

  return (
    <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
      <label className="flex items-center gap-2">
        <span>Show</span>
        <select
          className="rounded border bg-background px-2 py-1 text-xs"
          value={pageSize}
          onChange={(e) => onPageSizeChange(Number(e.currentTarget.value))}
        >
          {pageSizeOptions.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
        <span>per page</span>
      </label>

      <span className="tabular-nums">Showing {startIdx}–{endIdx} of {total}</span>

      <div className="flex items-center gap-1">
        <Button variant="outline" size="sm" className="h-7 px-2 text-xs"
          disabled={safePage <= 1} onClick={() => onPageChange(safePage - 1)}>
          ‹ Prev
        </Button>
        {pages.map((p) => (
          <Button
            key={p}
            size="sm"
            className={cn("h-7 min-w-7 px-2 text-xs", p === safePage && "bg-foreground text-background hover:bg-foreground/90 hover:text-background")}
            variant={p === safePage ? "default" : "outline"}
            aria-current={p === safePage ? "page" : undefined}
            onClick={() => onPageChange(p)}
          >
            {p}
          </Button>
        ))}
        <Button variant="outline" size="sm" className="h-7 px-2 text-xs"
          disabled={safePage >= totalPages} onClick={() => onPageChange(safePage + 1)}>
          Next ›
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- components/journal/filters/pagination.test.tsx`
Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

```bash
git add components/journal/filters/pagination.tsx components/journal/filters/pagination.test.tsx
git commit -m "feat(journal): Pagination component"
```

---

### Task 14: `useTableState` hook (URL + sort + filter + page)

**Files:**
- Create: `components/journal/filters/use-table-state.ts`
- Create: `components/journal/filters/use-table-state.test.tsx`

- [ ] **Step 1: Write the failing tests**

```tsx
// components/journal/filters/use-table-state.test.tsx
import { renderHook, act } from "@testing-library/react";
import { useTableState } from "./use-table-state";

describe("useTableState", () => {
  it("starts with defaults", () => {
    const { result } = renderHook(() => useTableState({ defaultSort: "closed_desc", defaultSize: 25 }));
    expect(result.current.state.sort).toBe("closed_desc");
    expect(result.current.state.page).toBe(1);
    expect(result.current.state.size).toBe(25);
    expect(result.current.state.filters).toEqual({});
    expect(result.current.state.search).toBe("");
  });
  it("setFilter resets page to 1", () => {
    const { result } = renderHook(() => useTableState({ defaultSort: "closed_desc", defaultSize: 25 }));
    act(() => result.current.setPage(3));
    expect(result.current.state.page).toBe(3);
    act(() => result.current.setFilter("symbol", "GBPUSD"));
    expect(result.current.state.page).toBe(1);
    expect(result.current.state.filters.symbol).toBe("GBPUSD");
  });
  it("setSort flips direction on same key", () => {
    const { result } = renderHook(() => useTableState({ defaultSort: "closed_desc", defaultSize: 25 }));
    act(() => result.current.setSort("closed"));
    expect(result.current.state.sort).toBe("closed_asc");
    act(() => result.current.setSort("closed"));
    expect(result.current.state.sort).toBe("closed_desc");
  });
  it("setSearch resets page to 1", () => {
    const { result } = renderHook(() => useTableState({ defaultSort: "closed_desc", defaultSize: 25 }));
    act(() => result.current.setPage(2));
    act(() => result.current.setSearch("ABC"));
    expect(result.current.state.page).toBe(1);
    expect(result.current.state.search).toBe("ABC");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- components/journal/filters/use-table-state.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// components/journal/filters/use-table-state.ts
"use client";

import { useCallback, useState } from "react";

export type SortKey = string;
export type SortValue = `${SortKey}_asc` | `${SortKey}_desc`;

export interface TableState {
  sort: SortValue;
  page: number;
  size: number;
  filters: Record<string, string | null>;
  search: string;
}

export interface UseTableStateOptions {
  defaultSort: SortValue;
  defaultSize: number;
}

export function useTableState({ defaultSort, defaultSize }: UseTableStateOptions) {
  const [state, setState] = useState<TableState>({
    sort: defaultSort, page: 1, size: defaultSize, filters: {}, search: "",
  });

  const setSort = useCallback((key: SortKey) => {
    setState((s) => {
      const [currentKey, currentDir] = s.sort.split(/_(?=asc$|desc$)/) as [SortKey, "asc" | "desc"];
      if (currentKey === key) {
        const nextDir = currentDir === "asc" ? "desc" : "asc";
        return { ...s, sort: `${key}_${nextDir}` as SortValue, page: 1 };
      }
      return { ...s, sort: `${key}_desc` as SortValue, page: 1 };
    });
  }, []);

  const setPage = useCallback((page: number) => setState((s) => ({ ...s, page })), []);
  const setSize = useCallback((size: number) => setState((s) => ({ ...s, size, page: 1 })), []);
  const setFilter = useCallback((key: string, value: string | null) => setState((s) => ({
    ...s, filters: { ...s.filters, [key]: value }, page: 1,
  })), []);
  const setSearch = useCallback((search: string) => setState((s) => ({ ...s, search, page: 1 })), []);
  const reset = useCallback(() => setState({
    sort: defaultSort, page: 1, size: defaultSize, filters: {}, search: "",
  }), [defaultSort, defaultSize]);

  return { state, setSort, setPage, setSize, setFilter, setSearch, reset };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- components/journal/filters/use-table-state.test.tsx`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add components/journal/filters/use-table-state.ts components/journal/filters/use-table-state.test.tsx
git commit -m "feat(journal): useTableState hook for sort/filter/page state"
```

---

*Phase 2 checkpoint:* `pnpm test` passes. Primitives exist but no consumer yet — the next phase wires them into the page chrome.

---

## Phase 3 — Chrome rebuild

### Task 15: Polish `JournalHeader`

**Files:**
- Modify: `components/journal/journal-header.tsx`

- [ ] **Step 1: Inspect current implementation**

Read the file; identify the existing badge row markup.

- [ ] **Step 2: Replace badge styles to match the locked design**

The header renders title + breadcrumb on the left; status badges on the right. Update badge classes to use the locked palette:

| Badge | Classes |
|---|---|
| Active | `border border-emerald-200 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400` |
| Tier (Yearly/Monthly/Trial) | `border border-indigo-200 bg-indigo-50 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-400` |
| Env (LIVE/DEMO) | `border border-orange-200 bg-orange-50 text-orange-700 dark:bg-orange-950/40 dark:text-orange-400` |
| Online | `border bg-card text-foreground` + leading `<span class="size-1.5 rounded-full bg-emerald-500 ring-2 ring-emerald-500/20" />` |

Each badge: `inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-[11px] font-semibold tracking-wide`.

Title: `text-2xl font-bold tracking-tight`. Subline (broker + key chip): `text-sm text-muted-foreground`, key wrapped in `<code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px]">`.

- [ ] **Step 3: Manual verification**

Run dev server, load a license journal, confirm badges render and align with the mockup styling.

- [ ] **Step 4: Commit**

```bash
git add components/journal/journal-header.tsx
git commit -m "refactor(journal): polish JournalHeader badge styling"
```

---

### Task 16: Rebuild `LiveAccountPanel`

**Files:**
- Modify: `components/journal/live-account-panel.tsx`
- Create: `components/journal/account-metadata-strip.tsx`

- [ ] **Step 1: Implement metadata strip**

```tsx
// components/journal/account-metadata-strip.tsx
import type { AccountSnapshotCurrent } from "@/lib/types";
import { fmtCash } from "@/lib/journal/format-pnl";

export function AccountMetadataStrip({ snapshot }: { snapshot: AccountSnapshotCurrent | null }) {
  if (!snapshot) return null;
  const parts: Array<[string, string]> = [
    ["Margin", fmtCash(snapshot.margin, snapshot.currency)],
    ["Free", fmtCash(snapshot.free_margin, snapshot.currency)],
    ["Margin Level", snapshot.margin_level === null ? "—" : `${snapshot.margin_level.toFixed(2)}%`],
    ["Leverage", `1:${snapshot.leverage}`],
  ];
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-1 text-xs text-muted-foreground">
      {parts.map(([k, v], i) => (
        <span key={k} className="inline-flex items-center gap-1.5 tabular-nums">
          <span>{k}</span>
          <span className="text-foreground">{v}</span>
          {i < parts.length - 1 && <span aria-hidden className="text-muted-foreground/50">·</span>}
        </span>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Rewrite `live-account-panel.tsx` to use `KpiCard`**

```tsx
// components/journal/live-account-panel.tsx
"use client";

import { useMemo } from "react";
import type { AccountSnapshotCurrent, AccountSnapshotDaily } from "@/lib/types";
import { KpiCard } from "./kpi-card";
import { AccountMetadataStrip } from "./account-metadata-strip";
import { fmtCash, fmtPct } from "@/lib/journal/format-pnl";
import { usePnlDisplay } from "./preferences/journal-chrome-context";

interface Props {
  snapshot: AccountSnapshotCurrent | null;
  daily: AccountSnapshotDaily[];
  baseline: number;
}

export function LiveAccountPanel({ snapshot, daily, baseline }: Props) {
  const { mode } = usePnlDisplay();
  const currency = snapshot?.currency ?? "USD";
  const balance = snapshot?.balance ?? 0;
  const equity = snapshot?.equity ?? 0;
  const floating = snapshot?.floating_pnl ?? 0;

  const cumulativeReturn = useMemo(() => {
    if (baseline <= 0 || daily.length === 0) return null;
    const last = daily[daily.length - 1].balance_close;
    return { pct: ((last - baseline) / baseline) * 100, cash: last - baseline };
  }, [daily, baseline]);

  const drawdownPct = snapshot?.drawdown_pct ?? 0;
  const drawdownCash = baseline > 0 ? (baseline * drawdownPct) / 100 : 0;

  const equitySeries = useMemo(() => daily.map((d) => d.equity_close), [daily]);
  const balanceSeries = useMemo(() => daily.map((d) => d.balance_close), [daily]);
  const drawdownSeries = useMemo(() => daily.map((d) => Math.max(0, baseline - d.balance_close)), [daily, baseline]);

  const showPct = mode === "percent" && baseline > 0;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <KpiCard
          featured
          label="Net Return"
          tone={cumulativeReturn === null ? "neutral" : cumulativeReturn.pct > 0 ? "positive" : cumulativeReturn.pct < 0 ? "negative" : "neutral"}
          value={cumulativeReturn === null ? "—" : showPct ? fmtPct(cumulativeReturn.pct) : fmtCash(cumulativeReturn.cash, currency)}
          sub={cumulativeReturn === null ? "no daily history yet" : showPct
            ? `since start · ${fmtCash(cumulativeReturn.cash, currency)}`
            : `since start · ${fmtPct(cumulativeReturn.pct)}`}
          series={balanceSeries}
          seriesTone={cumulativeReturn && cumulativeReturn.pct < 0 ? "negative" : "positive"}
        />
        <KpiCard
          label="Equity"
          value={fmtCash(equity, currency)}
          sub={`balance ${fmtCash(balance, currency)}`}
          series={equitySeries}
          seriesTone="neutral"
        />
        <KpiCard
          label="Floating P/L"
          tone={floating > 0 ? "positive" : floating < 0 ? "negative" : "neutral"}
          value={showPct ? fmtPct(baseline > 0 ? (floating / baseline) * 100 : 0) : fmtCash(floating, currency)}
          sub={`${fmtCash(floating, currency)}`}
        />
        <KpiCard
          label="Drawdown"
          tone={drawdownPct > 0 ? "negative" : "neutral"}
          value={showPct ? fmtPct(drawdownPct) : fmtCash(drawdownCash, currency)}
          sub={`peak → trough · ${fmtCash(drawdownCash, currency)}`}
          series={drawdownSeries}
          seriesTone="negative"
        />
      </div>
      <AccountMetadataStrip snapshot={snapshot} />
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add components/journal/live-account-panel.tsx components/journal/account-metadata-strip.tsx
git commit -m "feat(journal): rebuild LiveAccountPanel as KPI grid + metadata strip"
```

---

### Task 17: New `JournalToolbar`

**Files:**
- Create: `components/journal/journal-toolbar.tsx`

- [ ] **Step 1: Implement**

```tsx
// components/journal/journal-toolbar.tsx
"use client";

import { format, parseISO } from "date-fns";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { usePnlDisplay, useRangeScope, type RangeDays } from "./preferences/journal-chrome-context";

const RANGES: { label: string; value: RangeDays }[] = [
  { label: "7d", value: 7 },
  { label: "30d", value: 30 },
  { label: "90d", value: 90 },
  { label: "All", value: 0 },
];

export function JournalToolbar({ pushedAt }: { pushedAt: string | null }) {
  const { mode, setMode, source } = usePnlDisplay();
  const { range, setRange } = useRangeScope();

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-muted/30 px-3 py-2">
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <span className="font-medium">Display:</span>
        <Segment>
          <SegmentButton on={mode === "percent"} onClick={() => setMode("percent")}>%</SegmentButton>
          <SegmentButton on={mode === "dollar"} onClick={() => setMode("dollar")}>$</SegmentButton>
        </Segment>
        {source === "override" && <span className="text-[10px] uppercase tracking-wider text-amber-600 dark:text-amber-400">overridden</span>}
        <Divider />
        <span className="font-medium">Range:</span>
        <Segment>
          {RANGES.map((r) => (
            <SegmentButton key={r.value} on={range === r.value} onClick={() => setRange(r.value)}>
              {r.label}
            </SegmentButton>
          ))}
        </Segment>
      </div>
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span className="inline-flex size-1.5 rounded-full bg-emerald-500 ring-2 ring-emerald-500/20" />
        Live · {pushedAt ? format(parseISO(pushedAt), "HH:mm:ss") : "—"}
      </div>
    </div>
  );
}

function Segment({ children }: { children: React.ReactNode }) {
  return <div className="inline-flex rounded-md border bg-background p-0.5">{children}</div>;
}

function SegmentButton({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      onClick={onClick}
      className={cn(
        "h-6 px-2.5 text-[11px] font-medium",
        on && "bg-foreground text-background hover:bg-foreground/90 hover:text-background"
      )}
    >
      {children}
    </Button>
  );
}

function Divider() {
  return <span aria-hidden className="mx-1 h-4 w-px bg-border" />;
}
```

- [ ] **Step 2: Commit**

```bash
git add components/journal/journal-toolbar.tsx
git commit -m "feat(journal): JournalToolbar with % / $ + Range segments"
```

---

### Task 18: Wire context + thread `Range` through polls in `JournalShell`

**Files:**
- Modify: `components/journal/journal-shell.tsx`
- Modify: `app/dashboard/licenses/[id]/page.tsx`

- [ ] **Step 1: Update the page to fetch baseline + global preference + propfirm rule**

Modify `app/dashboard/licenses/[id]/page.tsx` `UserJournalPage` to resolve baseline and global pnl preference, and pass through.

After existing `const [snapshot, positions, deals, orders, daily, rule] = await Promise.all(...)`:

```ts
import { resolveBaseline } from "@/lib/journal/baseline";
import { getPnlDisplay } from "@/lib/preferences/server";
// ...
const baseline = resolveBaseline(rule, daily, snapshot);
const pnlDisplay = await getPnlDisplay(user.id);

return (
  <JournalShell
    license={license}
    initialSnapshot={snapshot}
    initialDaily={daily}
    initialPositions={positions}
    initialDeals={deals}
    initialOrders={orders}
    rule={rule}
    pushIntervalSeconds={pushIntervalSeconds}
    baseline={baseline}
    initialPnlDisplay={pnlDisplay}
  />
);
```

- [ ] **Step 2: Rewrite `journal-shell.tsx` to provide context + use toolbar**

Replace the whole `JournalShell` component:

```tsx
"use client";

import { useJournalPoll } from "@/lib/hooks/use-journal-poll";
import { fetchJson } from "@/lib/utils";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { JournalHeader } from "./journal-header";
import { LiveAccountPanel } from "./live-account-panel";
import { JournalToolbar } from "./journal-toolbar";
import { JournalChromeProvider, useRangeScope } from "./preferences/journal-chrome-context";
import { OverviewTab } from "./tabs/overview-tab";
import { TradesTab } from "./tabs/trades-tab";
import { CalendarTab } from "./tabs/calendar-tab";
import { PerformanceTab } from "./tabs/performance-tab";
import { OrdersTab } from "./tabs/orders-tab";
import { ObjectivesTab } from "./tabs/objectives-tab";
import type {
  AccountSnapshotCurrent, AccountSnapshotDaily, Deal, License, OrderRow,
  Position, PropfirmRule,
} from "@/lib/types";
import type { BaselineResult } from "@/lib/journal/baseline";
import type { PnlDisplay } from "@/lib/preferences/server";

interface Props {
  license: License;
  initialSnapshot: AccountSnapshotCurrent | null;
  initialDaily: AccountSnapshotDaily[];
  initialPositions: Position[];
  initialDeals: Deal[];
  initialOrders: OrderRow[];
  rule: PropfirmRule | null;
  pushIntervalSeconds: number;
  baseline: BaselineResult;
  initialPnlDisplay: PnlDisplay;
}

export function JournalShell(props: Props) {
  return (
    <JournalChromeProvider
      licenseId={props.license.id}
      initialPnlDisplay={props.baseline.source === null ? "dollar" : props.initialPnlDisplay}
      initialRangeDays={30}
    >
      <Inner {...props} />
    </JournalChromeProvider>
  );
}

function Inner(props: Props) {
  const { license } = props;
  const pushIntervalMs = props.pushIntervalSeconds * 1000;
  const acct = license.mt5_account;
  const { range } = useRangeScope();
  const days = range === 0 ? 0 : range;

  const snapshot = useJournalPoll<AccountSnapshotCurrent | null>({
    fetcher: () => fetchJson<AccountSnapshotCurrent | null>(`/api/journal/${acct}/snapshot`),
    initialData: props.initialSnapshot, pushIntervalMs,
  });
  const positions = useJournalPoll<Position[]>({
    fetcher: () => fetchJson<Position[]>(`/api/journal/${acct}/positions`),
    initialData: props.initialPositions, pushIntervalMs,
  });
  const deals = useJournalPoll<Deal[]>({
    fetcher: () => fetchJson<Deal[]>(`/api/journal/${acct}/deals?days=${days}`),
    initialData: props.initialDeals, pushIntervalMs, fixedIntervalMs: 30_000,
    deps: [days],
  });
  const orders = useJournalPoll<OrderRow[]>({
    fetcher: () => fetchJson<OrderRow[]>(`/api/journal/${acct}/orders?days=${days}`),
    initialData: props.initialOrders, pushIntervalMs, fixedIntervalMs: 30_000,
    deps: [days],
  });
  const daily = useJournalPoll<AccountSnapshotDaily[]>({
    fetcher: () => fetchJson<AccountSnapshotDaily[]>(`/api/journal/${acct}/snapshots-daily?days=${days}`),
    initialData: props.initialDaily, pushIntervalMs, fixedIntervalMs: 5 * 60_000,
    deps: [days],
  });

  const currency = snapshot.data?.currency ?? "USD";
  const baseline = props.baseline.baseline;

  return (
    <div className="mx-auto max-w-6xl space-y-4 px-6 py-6">
      <JournalHeader license={license} pushedAt={snapshot.data?.pushed_at ?? null} pushIntervalSeconds={props.pushIntervalSeconds} />
      <LiveAccountPanel snapshot={snapshot.data} daily={daily.data} baseline={baseline} />
      <JournalToolbar pushedAt={snapshot.data?.pushed_at ?? null} />
      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="trades">Trades {deals.data.length ? <CountPill n={deals.data.length} /> : null}</TabsTrigger>
          <TabsTrigger value="calendar">Calendar</TabsTrigger>
          <TabsTrigger value="performance">Performance</TabsTrigger>
          <TabsTrigger value="orders">Orders {orders.data.length ? <CountPill n={orders.data.length} /> : null}</TabsTrigger>
          <TabsTrigger value="objectives">Objectives</TabsTrigger>
        </TabsList>
        <TabsContent value="overview">
          <OverviewTab license={license} rule={props.rule} snapshot={snapshot.data} daily={daily.data} positions={positions.data} deals={deals.data} currency={currency} baseline={baseline} />
        </TabsContent>
        <TabsContent value="trades"><TradesTab deals={deals.data} currency={currency} baseline={baseline} /></TabsContent>
        <TabsContent value="calendar"><CalendarTab deals={deals.data} currency={currency} baseline={baseline} /></TabsContent>
        <TabsContent value="performance"><PerformanceTab deals={deals.data} daily={daily.data} currency={currency} baseline={baseline} /></TabsContent>
        <TabsContent value="orders"><OrdersTab orders={orders.data} /></TabsContent>
        <TabsContent value="objectives">
          <ObjectivesTab license={license} rule={props.rule} snapshot={snapshot.data} daily={daily.data} currency={currency} baseline={baseline} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function CountPill({ n }: { n: number }) {
  return <span className="ml-1 rounded bg-muted px-1.5 py-0.5 text-[10px] font-bold tabular-nums text-muted-foreground">{n}</span>;
}
```

- [ ] **Step 3: Update `useJournalPoll` to accept `deps`**

Check `lib/hooks/use-journal-poll.ts`. If the hook does not already accept `deps`, add it: when `deps` change, the hook should re-run the fetcher. Implementation outline (drop into existing file's effect array):

```ts
useEffect(() => {
  void refetch();
}, [JSON.stringify(deps ?? [])]);
```

Verify with a quick smoke test by toggling Range in the dev server — Trades / Orders / Equity should refetch.

- [ ] **Step 4: Manual verification**

`pnpm dev`, load a journal:
- All four KPI cards render with values + sparklines.
- Metadata strip under KPIs.
- Toolbar segments work; `Display` flips between % and $ visibly on the Net Return / Floating / Drawdown cards.
- Range buttons trigger refetches in the network tab.

- [ ] **Step 5: Commit**

```bash
git add app/dashboard/licenses/[id]/page.tsx components/journal/journal-shell.tsx lib/hooks/use-journal-poll.ts
git commit -m "feat(journal): provider + toolbar wiring; thread Range through polls"
```

---

*Phase 3 checkpoint:* The page renders the new chrome but tabs still use the old content. Acceptable intermediate state to merge as a milestone.

---

## Phase 4 — Tables

Each table follows the same shape:
1. A pure helper that **filters, sorts, and paginates** `Deal[]` / `OrderRow[]` / `Position[]` given a `TableState` — unit-tested.
2. A component that wires `useTableState`, renders chips + table + pagination.

### Task 19: `TradesTable`

**Files:**
- Create: `components/journal/tables/trades-table.tsx`
- Create: `lib/journal/trade-filters.ts`
- Create: `lib/journal/trade-filters.test.ts`
- Delete after migration: `components/journal/deals-table.tsx` (Phase 6 cleanup)

- [ ] **Step 1: Write the filter helper tests**

```ts
// lib/journal/trade-filters.test.ts
import { applyTradeFilters } from "./trade-filters";
import type { Deal } from "@/lib/types";

const D = (over: Partial<Deal>): Deal => ({
  mt5_account: 1, ticket: 1, ea_source: "impulse",
  symbol: "GBPUSD", side: "buy", volume: 0.05,
  open_price: 1.35, close_price: 1.34, sl: null, tp: null,
  open_time: "2026-05-15T00:00:00Z", close_time: "2026-05-15T01:00:00Z",
  profit: 0, commission: 0, swap: 0, comment: null, magic: null,
  ...over,
});

describe("applyTradeFilters", () => {
  const rows: Deal[] = [
    D({ ticket: 1, profit: 48.55, side: "sell", symbol: "GBPUSD", close_time: "2026-05-15T01:00:00Z" }),
    D({ ticket: 2, profit: -13.71, side: "buy", symbol: "GBPUSD", close_time: "2026-05-12T17:00:00Z" }),
    D({ ticket: 3, profit: -15.45, side: "sell", symbol: "EURUSD", close_time: "2026-05-06T16:00:00Z" }),
  ];

  it("returns everything when filters empty", () => {
    const r = applyTradeFilters(rows, { sort: "closed_desc", page: 1, size: 25, filters: {}, search: "" });
    expect(r.total).toBe(3);
    expect(r.rows.map((d) => d.ticket)).toEqual([1, 2, 3]);
  });
  it("filters wins / losses", () => {
    expect(applyTradeFilters(rows, { sort: "closed_desc", page: 1, size: 25, filters: { outcome: "wins" }, search: "" }).total).toBe(1);
    expect(applyTradeFilters(rows, { sort: "closed_desc", page: 1, size: 25, filters: { outcome: "losses" }, search: "" }).total).toBe(2);
  });
  it("filters by symbol", () => {
    expect(applyTradeFilters(rows, { sort: "closed_desc", page: 1, size: 25, filters: { symbol: "EURUSD" }, search: "" }).total).toBe(1);
  });
  it("filters by side", () => {
    expect(applyTradeFilters(rows, { sort: "closed_desc", page: 1, size: 25, filters: { side: "buy" }, search: "" }).total).toBe(1);
  });
  it("searches across ticket / symbol", () => {
    expect(applyTradeFilters(rows, { sort: "closed_desc", page: 1, size: 25, filters: {}, search: "EUR" }).total).toBe(1);
    expect(applyTradeFilters(rows, { sort: "closed_desc", page: 1, size: 25, filters: {}, search: "2" }).total).toBe(1);
  });
  it("sorts and paginates", () => {
    const r = applyTradeFilters(rows, { sort: "closed_asc", page: 1, size: 2, filters: {}, search: "" });
    expect(r.rows.map((d) => d.ticket)).toEqual([3, 2]);
    expect(r.total).toBe(3);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test -- lib/journal/trade-filters.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the filter helper**

```ts
// lib/journal/trade-filters.ts
import type { Deal } from "@/lib/types";
import type { TableState } from "@/components/journal/filters/use-table-state";

export interface TradeFilterResult {
  rows: Deal[];
  total: number;
  summary: { count: number; netCash: number; wins: number; losses: number };
}

export function applyTradeFilters(input: Deal[], state: TableState): TradeFilterResult {
  let rows = input;
  const { outcome, symbol, side } = state.filters;
  if (outcome === "wins") rows = rows.filter((d) => d.profit > 0);
  if (outcome === "losses") rows = rows.filter((d) => d.profit < 0);
  if (symbol) rows = rows.filter((d) => d.symbol === symbol);
  if (side === "buy" || side === "sell") rows = rows.filter((d) => d.side === side);
  if (state.search) {
    const q = state.search.toLowerCase();
    rows = rows.filter((d) =>
      d.symbol.toLowerCase().includes(q) || String(d.ticket).includes(q)
    );
  }

  const wins = rows.reduce((a, d) => a + (d.profit > 0 ? 1 : 0), 0);
  const losses = rows.reduce((a, d) => a + (d.profit < 0 ? 1 : 0), 0);
  const netCash = rows.reduce((a, d) => a + d.profit, 0);
  const total = rows.length;

  const [key, dir] = state.sort.split(/_(?=asc$|desc$)/) as [string, "asc" | "desc"];
  rows = [...rows].sort((a, b) => {
    let cmp = 0;
    switch (key) {
      case "closed":  cmp = a.close_time < b.close_time ? -1 : a.close_time > b.close_time ? 1 : 0; break;
      case "symbol":  cmp = a.symbol.localeCompare(b.symbol); break;
      case "side":    cmp = a.side.localeCompare(b.side); break;
      case "vol":     cmp = a.volume - b.volume; break;
      case "profit":  cmp = a.profit - b.profit; break;
      default:        cmp = a.ticket - b.ticket;
    }
    return dir === "asc" ? cmp : -cmp;
  });

  const start = (state.page - 1) * state.size;
  const sliced = rows.slice(start, start + state.size);

  return { rows: sliced, total, summary: { count: total, netCash, wins, losses } };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test -- lib/journal/trade-filters.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Implement `TradesTable`**

```tsx
// components/journal/tables/trades-table.tsx
"use client";

import { useMemo } from "react";
import { format, parseISO } from "date-fns";
import type { Deal } from "@/lib/types";
import { applyTradeFilters } from "@/lib/journal/trade-filters";
import { fmtCash, fmtPct, fmtPctOrCash } from "@/lib/journal/format-pnl";
import { useTableState, type SortValue } from "@/components/journal/filters/use-table-state";
import { ToggleChip, SelectChip } from "@/components/journal/filters/filter-chip";
import { FilterSearch } from "@/components/journal/filters/filter-search";
import { Pagination } from "@/components/journal/filters/pagination";
import { SidePill } from "./side-pill";
import { RowRailCell } from "./row-rail";
import { usePnlDisplay } from "@/components/journal/preferences/journal-chrome-context";
import { cn } from "@/lib/utils";

export function TradesTable({ deals, currency, baseline }: { deals: Deal[]; currency: string; baseline: number }) {
  const { mode } = usePnlDisplay();
  const { state, setSort, setPage, setSize, setFilter, setSearch } =
    useTableState({ defaultSort: "closed_desc" as SortValue, defaultSize: 25 });

  const symbolOptions = useMemo(() => {
    const set = new Set<string>(); for (const d of deals) set.add(d.symbol);
    return [...set].sort().map((s) => ({ value: s, label: s }));
  }, [deals]);

  const result = useMemo(() => applyTradeFilters(deals, state), [deals, state]);
  const maxAbsPct = useMemo(() => {
    if (baseline <= 0) return 0;
    return Math.max(0.0001, ...result.rows.map((d) => Math.abs((d.profit / baseline) * 100)));
  }, [result.rows, baseline]);

  const winRatePct = result.summary.count > 0 ? (result.summary.wins / result.summary.count) * 100 : 0;
  const netDisplay = mode === "percent" && baseline > 0
    ? fmtPct((result.summary.netCash / baseline) * 100)
    : fmtCash(result.summary.netCash, currency);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold">Closed Trades</h3>
        <div className="text-xs text-muted-foreground tabular-nums">
          {result.summary.count} trades · net <span className={cn(
            result.summary.netCash > 0 && "text-emerald-600 dark:text-emerald-400 font-semibold",
            result.summary.netCash < 0 && "text-red-600 dark:text-red-400 font-semibold",
          )}>{netDisplay}</span>
          {result.summary.count > 0 && <> · win rate {fmtPct(winRatePct).replace("+","")}</>}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-b pb-3">
        <ToggleChip label="All" count={deals.length}
          active={!state.filters.outcome}
          onClick={() => setFilter("outcome", null)} />
        <ToggleChip label="▲ Wins" count={deals.filter((d) => d.profit > 0).length}
          active={state.filters.outcome === "wins"}
          onClick={() => setFilter("outcome", state.filters.outcome === "wins" ? null : "wins")} />
        <ToggleChip label="▼ Losses" count={deals.filter((d) => d.profit < 0).length}
          active={state.filters.outcome === "losses"}
          onClick={() => setFilter("outcome", state.filters.outcome === "losses" ? null : "losses")} />
        <SelectChip label="Symbol" value={state.filters.symbol ?? null} options={symbolOptions}
          onChange={(v) => setFilter("symbol", v)} />
        <SelectChip label="Side" value={state.filters.side ?? null}
          options={[{ value: "buy", label: "Buy" }, { value: "sell", label: "Sell" }]}
          onChange={(v) => setFilter("side", v)} />
        <FilterSearch value={state.search} onChange={setSearch} placeholder="Search ticket, symbol…" className="ml-auto" />
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-[11px] uppercase tracking-wider text-muted-foreground">
              <Th sortKey="closed" state={state.sort} onClick={() => setSort("closed")}>Closed</Th>
              <Th sortKey="symbol" state={state.sort} onClick={() => setSort("symbol")}>Symbol</Th>
              <Th sortKey="side" state={state.sort} onClick={() => setSort("side")}>Side</Th>
              <Th sortKey="vol" state={state.sort} num onClick={() => setSort("vol")}>Vol</Th>
              <th className="px-2 py-2 text-right font-medium">Entry</th>
              <th className="px-2 py-2 text-right font-medium">Exit</th>
              <th className="px-2 py-2 text-right font-medium">Pips</th>
              <Th sortKey="profit" state={state.sort} num onClick={() => setSort("profit")}>P/L</Th>
            </tr>
          </thead>
          <tbody>
            {result.rows.length === 0 ? (
              <tr><td colSpan={8}>
                <div className="my-4 rounded-lg border border-dashed py-8 text-center text-sm text-muted-foreground">No trades match this filter.</div>
              </td></tr>
            ) : result.rows.map((d) => {
              const pips = computePips(d);
              const pnlPct = baseline > 0 ? (d.profit / baseline) * 100 : 0;
              const barW = maxAbsPct > 0 ? Math.min(100, (Math.abs(pnlPct) / maxAbsPct) * 100) : 0;
              return (
                <tr key={d.ticket} className="border-b hover:bg-muted/40">
                  <RowRailCell variant={d.side}>
                    <span className="text-xs tabular-nums">{format(parseISO(d.close_time), "MMM dd · HH:mm")}</span>
                  </RowRailCell>
                  <td className="px-2 py-2 font-semibold">{d.symbol}</td>
                  <td className="px-2 py-2"><SidePill variant={d.side}>{d.side}</SidePill></td>
                  <td className="px-2 py-2 text-right tabular-nums">{d.volume.toFixed(2)}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{d.open_price.toFixed(5)}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{d.close_price.toFixed(5)}</td>
                  <td className={cn("px-2 py-2 text-right tabular-nums", pips > 0 ? "text-emerald-600 dark:text-emerald-400" : pips < 0 ? "text-red-600 dark:text-red-400" : "")}>{pips > 0 ? "+" : ""}{pips.toFixed(1)}</td>
                  <td className="px-2 py-2 text-right" title={`${fmtCash(d.profit, currency)} cash · ${fmtPct(pnlPct)} of baseline`}>
                    <span className={cn("tabular-nums font-semibold", d.profit > 0 ? "text-emerald-600 dark:text-emerald-400" : d.profit < 0 ? "text-red-600 dark:text-red-400" : "")}>
                      {fmtPctOrCash(d.profit, mode, baseline, currency)}
                    </span>
                    <span aria-hidden className="ml-1.5 inline-block h-1 w-[38px] rounded-sm align-middle"
                      style={{
                        background: d.profit >= 0
                          ? `linear-gradient(to right, #10b981 ${barW}%, var(--border) ${barW}%)`
                          : `linear-gradient(to left, #ef4444 ${barW}%, var(--border) ${barW}%)`,
                      }}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <Pagination total={result.total} page={state.page} pageSize={state.size}
        onPageChange={setPage} onPageSizeChange={setSize} />
    </div>
  );
}

function computePips(d: Deal): number {
  const factor = d.symbol.endsWith("JPY") ? 100 : 10_000;
  const diff = (d.close_price - d.open_price) * factor;
  return d.side === "buy" ? diff : -diff;
}

function Th({ sortKey, state, num, onClick, children }: {
  sortKey: string; state: string; num?: boolean; onClick: () => void; children: React.ReactNode;
}) {
  const [key, dir] = state.split(/_(?=asc$|desc$)/) as [string, "asc" | "desc"];
  const active = key === sortKey;
  return (
    <th className={cn("px-2 py-2 font-medium", num && "text-right")}>
      <button type="button" onClick={onClick} className={cn("inline-flex items-center gap-1 hover:text-foreground", active && "text-foreground")}>
        {children}
        <span aria-hidden className={cn("text-[10px]", !active && "text-muted-foreground/40")}>{active && dir === "asc" ? "↑" : "↓"}</span>
      </button>
    </th>
  );
}
```

- [ ] **Step 6: Wire into `trades-tab.tsx`**

```tsx
// components/journal/tabs/trades-tab.tsx
import { TradesTable } from "../tables/trades-table";
import type { Deal } from "@/lib/types";

export function TradesTab({ deals, currency, baseline }: { deals: Deal[]; currency: string; baseline: number }) {
  return <TradesTable deals={deals} currency={currency} baseline={baseline} />;
}
```

- [ ] **Step 7: Commit**

```bash
git add components/journal/tables/trades-table.tsx components/journal/tabs/trades-tab.tsx lib/journal/trade-filters.ts lib/journal/trade-filters.test.ts
git commit -m "feat(journal): TradesTable on new row anatomy with filters + pagination"
```

---

### Task 20: `OrdersTable`

**Files:**
- Create: `components/journal/tables/orders-table.tsx`
- Create: `lib/journal/order-filters.ts`
- Create: `lib/journal/order-filters.test.ts`

- [ ] **Step 1: Write the filter helper tests**

```ts
// lib/journal/order-filters.test.ts
import { applyOrderFilters, classifyOrderState } from "./order-filters";
import type { OrderRow } from "@/lib/types";

const O = (over: Partial<OrderRow>): OrderRow => ({
  mt5_account: 1, ticket: 1, ea_source: "impulse", symbol: "GBPUSD",
  type: "order_type_buy", state: "order_state_filled",
  volume_initial: 0.05, volume_current: 0,
  price_open: 1.34, price_current: null, sl: null, tp: null,
  time_setup: "2026-05-15T01:58:00Z", time_done: "2026-05-15T01:58:00Z",
  comment: null, magic: null, ...over,
});

describe("classifyOrderState", () => {
  it("maps filled / canceled / partial / open buckets", () => {
    expect(classifyOrderState("order_state_filled")).toBe("filled");
    expect(classifyOrderState("order_state_canceled")).toBe("canceled");
    expect(classifyOrderState("order_state_partial")).toBe("partial");
    expect(classifyOrderState("order_state_placed")).toBe("open");
  });
});

describe("applyOrderFilters", () => {
  const rows: OrderRow[] = [
    O({ ticket: 1, state: "order_state_filled" }),
    O({ ticket: 2, state: "order_state_canceled" }),
    O({ ticket: 3, state: "order_state_filled", symbol: "EURUSD", type: "order_type_sell_stop" }),
  ];
  it("filters by state bucket", () => {
    expect(applyOrderFilters(rows, { sort: "setup_desc", page: 1, size: 25, filters: { state: "filled" }, search: "" }).total).toBe(2);
    expect(applyOrderFilters(rows, { sort: "setup_desc", page: 1, size: 25, filters: { state: "canceled" }, search: "" }).total).toBe(1);
  });
  it("filters by type and symbol", () => {
    expect(applyOrderFilters(rows, { sort: "setup_desc", page: 1, size: 25, filters: { type: "order_type_sell_stop" }, search: "" }).total).toBe(1);
    expect(applyOrderFilters(rows, { sort: "setup_desc", page: 1, size: 25, filters: { symbol: "EURUSD" }, search: "" }).total).toBe(1);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test -- lib/journal/order-filters.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// lib/journal/order-filters.ts
import type { OrderRow } from "@/lib/types";
import type { TableState } from "@/components/journal/filters/use-table-state";

export type StateBucket = "filled" | "canceled" | "partial" | "open" | "other";

export function classifyOrderState(raw: string): StateBucket {
  if (raw === "order_state_filled") return "filled";
  if (raw === "order_state_canceled" || raw === "order_state_expired" || raw === "order_state_rejected") return "canceled";
  if (raw === "order_state_partial") return "partial";
  if (raw === "order_state_placed") return "open";
  return "other";
}

export interface OrderFilterResult {
  rows: OrderRow[];
  total: number;
  summary: { count: number; filled: number; canceled: number };
}

export function applyOrderFilters(input: OrderRow[], state: TableState): OrderFilterResult {
  let rows = input;
  const { state: stateBucket, type, symbol } = state.filters;
  if (stateBucket) rows = rows.filter((o) => classifyOrderState(o.state) === stateBucket);
  if (type) rows = rows.filter((o) => o.type === type);
  if (symbol) rows = rows.filter((o) => o.symbol === symbol);
  if (state.search) {
    const q = state.search.toLowerCase();
    rows = rows.filter((o) => o.symbol.toLowerCase().includes(q) || String(o.ticket).includes(q));
  }

  const filled = rows.reduce((a, o) => a + (classifyOrderState(o.state) === "filled" ? 1 : 0), 0);
  const canceled = rows.reduce((a, o) => a + (classifyOrderState(o.state) === "canceled" ? 1 : 0), 0);
  const total = rows.length;

  const [key, dir] = state.sort.split(/_(?=asc$|desc$)/) as [string, "asc" | "desc"];
  rows = [...rows].sort((a, b) => {
    let cmp = 0;
    switch (key) {
      case "setup":  cmp = a.time_setup < b.time_setup ? -1 : a.time_setup > b.time_setup ? 1 : 0; break;
      case "symbol": cmp = a.symbol.localeCompare(b.symbol); break;
      case "type":   cmp = a.type.localeCompare(b.type); break;
      case "state":  cmp = a.state.localeCompare(b.state); break;
      default:       cmp = a.ticket - b.ticket;
    }
    return dir === "asc" ? cmp : -cmp;
  });

  const start = (state.page - 1) * state.size;
  return { rows: rows.slice(start, start + state.size), total, summary: { count: total, filled, canceled } };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test -- lib/journal/order-filters.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 5: Implement `OrdersTable`**

```tsx
// components/journal/tables/orders-table.tsx
"use client";

import { useMemo } from "react";
import { format, parseISO } from "date-fns";
import type { OrderRow } from "@/lib/types";
import { applyOrderFilters, classifyOrderState } from "@/lib/journal/order-filters";
import { humanizeOrderState, humanizeOrderType } from "@/lib/journal/order-display";
import { useTableState, type SortValue } from "@/components/journal/filters/use-table-state";
import { ToggleChip, SelectChip } from "@/components/journal/filters/filter-chip";
import { FilterSearch } from "@/components/journal/filters/filter-search";
import { Pagination } from "@/components/journal/filters/pagination";
import { SidePill } from "./side-pill";
import { StatePill } from "./state-pill";
import { RowRailCell } from "./row-rail";
import { cn } from "@/lib/utils";

export function OrdersTable({ orders }: { orders: OrderRow[] }) {
  const { state, setSort, setPage, setSize, setFilter, setSearch } =
    useTableState({ defaultSort: "setup_desc" as SortValue, defaultSize: 25 });

  const symbolOptions = useMemo(() => {
    const set = new Set<string>(); for (const o of orders) set.add(o.symbol);
    return [...set].sort().map((s) => ({ value: s, label: s }));
  }, [orders]);
  const typeOptions = useMemo(() => {
    const set = new Set<string>(); for (const o of orders) set.add(o.type);
    return [...set].sort().map((t) => ({ value: t, label: humanizeOrderType(t).label }));
  }, [orders]);

  const result = useMemo(() => applyOrderFilters(orders, state), [orders, state]);
  const totalFilled = orders.reduce((a, o) => a + (classifyOrderState(o.state) === "filled" ? 1 : 0), 0);
  const totalCanceled = orders.reduce((a, o) => a + (classifyOrderState(o.state) === "canceled" ? 1 : 0), 0);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold">Orders</h3>
        <div className="text-xs text-muted-foreground tabular-nums">
          {orders.length} orders · {totalFilled} filled · {totalCanceled} canceled
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-b pb-3">
        <ToggleChip label="All" count={orders.length}
          active={!state.filters.state}
          onClick={() => setFilter("state", null)} />
        <ToggleChip label="Filled" count={totalFilled}
          active={state.filters.state === "filled"}
          onClick={() => setFilter("state", state.filters.state === "filled" ? null : "filled")} />
        <ToggleChip label="Canceled" count={totalCanceled}
          active={state.filters.state === "canceled"}
          onClick={() => setFilter("state", state.filters.state === "canceled" ? null : "canceled")} />
        <SelectChip label="Type" value={state.filters.type ?? null} options={typeOptions}
          onChange={(v) => setFilter("type", v)} />
        <SelectChip label="Symbol" value={state.filters.symbol ?? null} options={symbolOptions}
          onChange={(v) => setFilter("symbol", v)} />
        <FilterSearch value={state.search} onChange={setSearch} placeholder="Search ticket, symbol…" className="ml-auto" />
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-[11px] uppercase tracking-wider text-muted-foreground">
              <Th k="setup"  state={state.sort} onClick={() => setSort("setup")}>Setup</Th>
              <Th k="symbol" state={state.sort} onClick={() => setSort("symbol")}>Symbol</Th>
              <Th k="type"   state={state.sort} onClick={() => setSort("type")}>Type</Th>
              <Th k="state"  state={state.sort} onClick={() => setSort("state")}>State</Th>
              <th className="px-2 py-2 text-right font-medium">Vol Init</th>
              <th className="px-2 py-2 text-right font-medium">Vol Now</th>
              <th className="px-2 py-2 text-right font-medium">Price</th>
              <th className="px-2 py-2 font-medium">Done</th>
            </tr>
          </thead>
          <tbody>
            {result.rows.length === 0 ? (
              <tr><td colSpan={8}>
                <div className="my-4 rounded-lg border border-dashed py-8 text-center text-sm text-muted-foreground">No orders match this filter.</div>
              </td></tr>
            ) : result.rows.map((o) => {
              const type = humanizeOrderType(o.type);
              const st = humanizeOrderState(o.state);
              const rail = type.variant === "buy" || type.variant === "sell" ? type.variant : "neutral";
              return (
                <tr key={o.ticket} className="border-b hover:bg-muted/40">
                  <RowRailCell variant={rail}>
                    <span className="text-xs tabular-nums">{format(parseISO(o.time_setup), "MMM dd · HH:mm")}</span>
                  </RowRailCell>
                  <td className="px-2 py-2 font-semibold">{o.symbol}</td>
                  <td className="px-2 py-2"><SidePill variant={type.variant} outline={type.outline}>{type.label}</SidePill></td>
                  <td className="px-2 py-2"><StatePill variant={st.variant}>{st.label}</StatePill></td>
                  <td className="px-2 py-2 text-right tabular-nums">{o.volume_initial.toFixed(2)}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{o.volume_current.toFixed(2)}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{o.price_open === null ? "—" : o.price_open.toFixed(5)}</td>
                  <td className="px-2 py-2 text-xs tabular-nums text-muted-foreground">{o.time_done ? format(parseISO(o.time_done), "MMM dd · HH:mm") : "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <Pagination total={result.total} page={state.page} pageSize={state.size}
        onPageChange={setPage} onPageSizeChange={setSize} />
    </div>
  );
}

function Th({ k, state, onClick, children }: {
  k: string; state: string; onClick: () => void; children: React.ReactNode;
}) {
  const [key, dir] = state.split(/_(?=asc$|desc$)/) as [string, "asc" | "desc"];
  const active = key === k;
  return (
    <th className="px-2 py-2 font-medium">
      <button type="button" onClick={onClick} className={cn("inline-flex items-center gap-1 hover:text-foreground", active && "text-foreground")}>
        {children}
        <span aria-hidden className={cn("text-[10px]", !active && "text-muted-foreground/40")}>{active && dir === "asc" ? "↑" : "↓"}</span>
      </button>
    </th>
  );
}
```

- [ ] **Step 6: Wire into `orders-tab.tsx`**

```tsx
// components/journal/tabs/orders-tab.tsx
import { OrdersTable } from "../tables/orders-table";
import type { OrderRow } from "@/lib/types";

export function OrdersTab({ orders }: { orders: OrderRow[] }) {
  return <OrdersTable orders={orders} />;
}
```

- [ ] **Step 7: Commit**

```bash
git add components/journal/tables/orders-table.tsx components/journal/tabs/orders-tab.tsx lib/journal/order-filters.ts lib/journal/order-filters.test.ts
git commit -m "feat(journal): OrdersTable with humanized enums + filters"
```

---

### Task 21: `PositionsTable`

**Files:**
- Create: `components/journal/tables/positions-table.tsx`

- [ ] **Step 1: Implement**

```tsx
// components/journal/tables/positions-table.tsx
"use client";

import type { Position } from "@/lib/types";
import { SidePill } from "./side-pill";
import { RowRailCell } from "./row-rail";
import { fmtCash, fmtPct, fmtPctOrCash } from "@/lib/journal/format-pnl";
import { usePnlDisplay } from "@/components/journal/preferences/journal-chrome-context";
import { cn } from "@/lib/utils";

export function PositionsTable({ positions, currency, baseline }: {
  positions: Position[]; currency: string; baseline: number;
}) {
  const { mode } = usePnlDisplay();

  if (positions.length === 0) {
    return (
      <div className="rounded-lg border border-dashed py-8 text-center text-sm text-muted-foreground">
        No open positions.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-[11px] uppercase tracking-wider text-muted-foreground">
            <th className="px-2 py-2 text-left font-medium">Symbol</th>
            <th className="px-2 py-2 text-left font-medium">Side</th>
            <th className="px-2 py-2 text-right font-medium">Vol</th>
            <th className="px-2 py-2 text-right font-medium">Open</th>
            <th className="px-2 py-2 text-right font-medium">Current</th>
            <th className="px-2 py-2 text-right font-medium">SL</th>
            <th className="px-2 py-2 text-right font-medium">TP</th>
            <th className="px-2 py-2 text-right font-medium">P/L</th>
          </tr>
        </thead>
        <tbody>
          {positions.map((p) => {
            const pnlPct = baseline > 0 ? (p.profit / baseline) * 100 : 0;
            return (
              <tr key={p.ticket} className="border-b hover:bg-muted/40">
                <RowRailCell variant={p.side}>
                  <span className="font-semibold">{p.symbol}</span>
                </RowRailCell>
                <td className="px-2 py-2"><SidePill variant={p.side}>{p.side}</SidePill></td>
                <td className="px-2 py-2 text-right tabular-nums">{p.volume.toFixed(2)}</td>
                <td className="px-2 py-2 text-right tabular-nums">{p.open_price.toFixed(5)}</td>
                <td className="px-2 py-2 text-right tabular-nums">{p.current_price.toFixed(5)}</td>
                <td className="px-2 py-2 text-right tabular-nums">{p.sl === null ? "—" : p.sl.toFixed(5)}</td>
                <td className="px-2 py-2 text-right tabular-nums">{p.tp === null ? "—" : p.tp.toFixed(5)}</td>
                <td className={cn("px-2 py-2 text-right tabular-nums font-semibold",
                  p.profit > 0 && "text-emerald-600 dark:text-emerald-400",
                  p.profit < 0 && "text-red-600 dark:text-red-400")}
                  title={`${fmtCash(p.profit, currency)} cash · ${fmtPct(pnlPct)} of baseline`}>
                  {fmtPctOrCash(p.profit, mode, baseline, currency)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add components/journal/tables/positions-table.tsx
git commit -m "feat(journal): PositionsTable on new row anatomy"
```

---

*Phase 4 checkpoint:* `pnpm test` passes. Trades & Orders tabs now show the new tables. Positions table built but not yet wired into Overview (Phase 5).

---

## Phase 5 — Tab content

### Task 22: Calendar heatmap rebuild

**Files:**
- Modify: `components/journal/trade-calendar.tsx`
- Modify: `components/journal/tabs/calendar-tab.tsx`

- [ ] **Step 1: Add a "go to trades for a date" callback prop**

```tsx
// components/journal/tabs/calendar-tab.tsx
"use client";

import { TradeCalendar } from "../trade-calendar";
import type { Deal } from "@/lib/types";

export function CalendarTab({ deals, currency, baseline }: { deals: Deal[]; currency: string; baseline: number }) {
  // Hook into URL on click — defer real filter wiring to writing-plans follow-up.
  const onDayClick = (yyyy_mm_dd: string) => {
    const url = new URL(window.location.href);
    url.hash = `#trades?date=${yyyy_mm_dd}`;
    window.location.replace(url.toString());
  };
  return <TradeCalendar deals={deals} currency={currency} baseline={baseline} onDayClick={onDayClick} />;
}
```

- [ ] **Step 2: Rebuild `trade-calendar.tsx`**

```tsx
// components/journal/trade-calendar.tsx
"use client";

import { useMemo, useState } from "react";
import {
  addMonths, eachDayOfInterval, endOfMonth, format, getDay, isSameMonth,
  startOfMonth, startOfWeek, subMonths,
} from "date-fns";
import { Button } from "@/components/ui/button";
import { aggregateCalendar } from "@/lib/journal/calendar-aggregate";
import type { Deal } from "@/lib/types";
import { cn } from "@/lib/utils";
import { fmtCash, fmtPct } from "@/lib/journal/format-pnl";
import { usePnlDisplay } from "./preferences/journal-chrome-context";

interface Props {
  deals: Deal[];
  currency: string;
  baseline: number;
  onDayClick?: (yyyy_mm_dd: string) => void;
}

export function TradeCalendar({ deals, currency, baseline, onDayClick }: Props) {
  const { mode } = usePnlDisplay();
  const [cursor, setCursor] = useState<Date>(() => new Date());
  const calendar = useMemo(() => aggregateCalendar(deals), [deals]);
  const monthStart = startOfMonth(cursor);
  const monthEnd = endOfMonth(cursor);
  const days = eachDayOfInterval({ start: monthStart, end: monthEnd });
  const leadingBlanks = getDay(monthStart);

  const monthTotals = useMemo(() => {
    let net = 0, trades = 0;
    for (const d of days) {
      const cell = calendar.get(format(d, "yyyy-MM-dd"));
      if (cell) { net += cell.netPnl; trades += cell.tradeCount; }
    }
    return { net, trades };
  }, [calendar, days]);

  // Compute "strong" threshold = top-quartile |%| / |$| of the month
  const strong = useMemo(() => {
    const mags: number[] = [];
    for (const d of days) {
      const cell = calendar.get(format(d, "yyyy-MM-dd"));
      if (cell) mags.push(Math.abs(cell.netPnl));
    }
    if (mags.length === 0) return Number.POSITIVE_INFINITY;
    mags.sort((a, b) => a - b);
    return mags[Math.floor(mags.length * 0.75)] || mags[mags.length - 1];
  }, [calendar, days]);

  const showPct = mode === "percent" && baseline > 0;

  // Build week rows: 6 weeks × 7 days incl. blanks.
  const weeks: Array<Date | null>[] = [];
  let current: Array<Date | null> = Array.from({ length: leadingBlanks }, () => null);
  for (const d of days) {
    if (current.length === 7) { weeks.push(current); current = []; }
    current.push(d);
  }
  while (current.length < 7) current.push(null);
  weeks.push(current);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setCursor((c) => subMonths(c, 1))}>‹</Button>
          <span className="text-sm font-semibold min-w-[7rem] text-center">{format(cursor, "MMMM yyyy")}</span>
          <Button variant="outline" size="sm" onClick={() => setCursor((c) => addMonths(c, 1))} disabled={isSameMonth(cursor, new Date())}>›</Button>
        </div>
        <div className="text-xs text-muted-foreground tabular-nums">
          {monthTotals.trades} trades, net{" "}
          <span className={cn("font-semibold",
            monthTotals.net > 0 && "text-emerald-600 dark:text-emerald-400",
            monthTotals.net < 0 && "text-red-600 dark:text-red-400")}>
            {showPct ? fmtPct((monthTotals.net / baseline) * 100) : fmtCash(monthTotals.net, currency)}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-[repeat(7,minmax(0,1fr))_5rem] gap-1.5 text-xs">
        {["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map((d) => (
          <div key={d} className="text-center text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70 py-1">{d}</div>
        ))}
        <div className="text-center text-[10px] font-semibold uppercase tracking-wider text-foreground py-1">Wk</div>

        {weeks.map((week, wi) => {
          let weekNet = 0;
          const cells = week.map((d, di) => {
            if (!d) return <div key={`b${wi}-${di}`} />;
            const isWeekend = di === 0 || di === 6;
            const key = format(d, "yyyy-MM-dd");
            const cell = calendar.get(key);
            if (cell) weekNet += cell.netPnl;
            const tier = !cell ? "none"
              : cell.netPnl > 0 ? (cell.netPnl >= strong ? "strong-win" : "win")
              : cell.netPnl < 0 ? (Math.abs(cell.netPnl) >= strong ? "strong-loss" : "loss")
              : "none";
            const toneClass =
              tier === "strong-win"  ? "bg-emerald-200 border-emerald-400 dark:bg-emerald-900/60 dark:border-emerald-700"
            : tier === "win"         ? "bg-emerald-50 border-emerald-200 dark:bg-emerald-950/40 dark:border-emerald-900/40"
            : tier === "strong-loss" ? "bg-red-200 border-red-400 dark:bg-red-900/60 dark:border-red-700"
            : tier === "loss"        ? "bg-red-50 border-red-200 dark:bg-red-950/40 dark:border-red-900/40"
            : "bg-muted/30 border-border/50";
            return (
              <button
                key={key}
                type="button"
                disabled={!cell || !onDayClick}
                onClick={() => cell && onDayClick?.(key)}
                className={cn(
                  "min-h-[60px] rounded-md border p-1.5 text-left transition-colors",
                  toneClass,
                  isWeekend && "opacity-50",
                  cell && onDayClick && "cursor-pointer hover:-translate-y-0.5",
                )}
              >
                <div className="text-[10px] font-semibold text-muted-foreground">{format(d, "d")}</div>
                {cell && (
                  <>
                    <div className={cn("mt-0.5 text-[12px] font-bold leading-tight tabular-nums",
                      cell.netPnl > 0 ? "text-emerald-700 dark:text-emerald-300"
                      : cell.netPnl < 0 ? "text-red-700 dark:text-red-300" : "")}>
                      {showPct ? fmtPct((cell.netPnl / baseline) * 100) : fmtCash(cell.netPnl, currency)}
                    </div>
                    <div className="text-[10px] text-muted-foreground">{cell.tradeCount}t</div>
                  </>
                )}
              </button>
            );
          });
          const weekTotalCls = weekNet > 0 ? "text-emerald-600 dark:text-emerald-400"
                              : weekNet < 0 ? "text-red-600 dark:text-red-400"
                              : "text-muted-foreground";
          return (
            <div key={`w${wi}`} className="contents">
              {cells}
              <div className="flex flex-col items-center justify-center rounded-md border bg-muted/40 px-1 py-1 text-[11px]">
                <div className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground/70">Net</div>
                <div className={cn("font-bold tabular-nums text-[12px]", weekTotalCls)}>
                  {weekNet === 0 ? "—" : showPct ? fmtPct((weekNet / baseline) * 100) : fmtCash(weekNet, currency)}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
        <Legend className="bg-red-200 dark:bg-red-900/60" label="Strong loss" />
        <Legend className="bg-red-50 dark:bg-red-950/40" label="Loss" />
        <Legend className="bg-muted/30" label="No trades" />
        <Legend className="bg-emerald-50 dark:bg-emerald-950/40" label="Win" />
        <Legend className="bg-emerald-200 dark:bg-emerald-900/60" label="Strong win" />
        {onDayClick && <span className="ml-auto">Click a day to filter Trades →</span>}
      </div>
    </div>
  );
}

function Legend({ className, label }: { className: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span className={cn("inline-block size-3 rounded-sm border", className)} />
      {label}
    </span>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add components/journal/trade-calendar.tsx components/journal/tabs/calendar-tab.tsx
git commit -m "feat(journal): Calendar heatmap with strong-tier coloring + week column"
```

---

### Task 23: Performance grid + chart + extras

**Files:**
- Modify: `components/journal/tabs/performance-tab.tsx`
- Modify: `components/journal/equity-chart.tsx`
- Create: `components/journal/pnl-histogram.tsx`
- Modify: `components/journal/streaks-table.tsx`

- [ ] **Step 1: Rewrite `streaks-table.tsx` as a row of 3 stats**

```tsx
// components/journal/streaks-table.tsx
import { cn } from "@/lib/utils";
import type { StreaksResult } from "@/lib/journal/streaks";

export function StreaksTable({ streaks }: { streaks: StreaksResult }) {
  const items: Array<[string, number, "pos" | "neg" | "neutral"]> = [
    ["Max Wins",   streaks.maxWinStreak,  "pos"],
    ["Max Losses", streaks.maxLossStreak, "neg"],
    [streaks.currentKind === "win" ? "Current (win)" : streaks.currentKind === "loss" ? "Current (loss)" : "Current",
     streaks.currentLength, "neutral"],
  ];
  return (
    <div className="rounded-lg border bg-card p-4">
      <h4 className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Streaks</h4>
      <div className="grid grid-cols-3 gap-3">
        {items.map(([label, n, tone]) => (
          <div key={label} className="text-center">
            <div className={cn("text-2xl font-bold tabular-nums",
              tone === "pos" && "text-emerald-600 dark:text-emerald-400",
              tone === "neg" && "text-red-600 dark:text-red-400")}>{n}</div>
            <div className="mt-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
```

(If `streaks-table.tsx` has different export types, adapt rather than rewrite — keep the public shape.)

- [ ] **Step 2: Create `PnlHistogram`**

```tsx
// components/journal/pnl-histogram.tsx
import { binPnlDistribution } from "@/lib/journal/histogram";
import { fmtCash, fmtPct } from "@/lib/journal/format-pnl";
import { cn } from "@/lib/utils";

interface Props {
  values: number[];           // per-trade cash P/L
  baseline: number;
  currency: string;
  showPct: boolean;
  binCount?: number;
}

export function PnlHistogram({ values, baseline, currency, showPct, binCount = 11 }: Props) {
  const { bins, min, max } = binPnlDistribution(values, binCount);
  const maxCount = Math.max(1, ...bins.map((b) => b.count));

  if (values.length === 0) {
    return (
      <div className="rounded-lg border bg-card p-4">
        <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Per-trade P/L distribution</h4>
        <div className="rounded-md border border-dashed py-6 text-center text-xs text-muted-foreground">No trades yet.</div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border bg-card p-4">
      <h4 className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Per-trade P/L distribution</h4>
      <div className="flex h-[90px] items-end gap-1 px-1">
        {bins.map((b, i) => (
          <div key={i} className={cn("flex-1 rounded-t-sm",
            b.sign === "win"  && "bg-emerald-500",
            b.sign === "loss" && "bg-red-500",
            b.sign === "zero" && "bg-border")}
            style={{ height: `${Math.max(4, (b.count / maxCount) * 100)}%` }}
            title={`${b.count} trade${b.count === 1 ? "" : "s"} from ${showPct ? fmtPct(baseline ? (b.start / baseline) * 100 : 0) : fmtCash(b.start, currency)} to ${showPct ? fmtPct(baseline ? (b.end / baseline) * 100 : 0) : fmtCash(b.end, currency)}`}
          />
        ))}
      </div>
      <div className="mt-2 flex justify-between text-[10px] text-muted-foreground tabular-nums">
        <span>{showPct ? fmtPct(baseline ? (min / baseline) * 100 : 0) : fmtCash(min, currency)}</span>
        <span>0</span>
        <span>{showPct ? fmtPct(baseline ? (max / baseline) * 100 : 0) : fmtCash(max, currency)}</span>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Update `equity-chart.tsx` to plot cumulative % return**

The existing chart uses recharts with daily equity values. Update to plot **cumulative return** since the start of the visible window — `((balance_close - baseline) / baseline) * 100` when `mode === "percent"`, else `balance_close - baseline`. Add a horizontal reference line at zero, fill area below in light red and above in light green.

Add these props:

```tsx
// equity-chart.tsx — function signature change
export function EquityChart({ data, currency, baseline }: {
  data: AccountSnapshotDaily[];
  currency: string;
  baseline: number;
}) {
  // Inside: const { mode } = usePnlDisplay();
  // Transform data points:
  //   const series = data.map((d) => ({
  //     date: d.trade_date,
  //     value: mode === "percent" && baseline > 0
  //       ? ((d.balance_close - baseline) / baseline) * 100
  //       : d.balance_close - baseline,
  //   }));
  // Render with recharts AreaChart, ReferenceLine y={0}, Area fill with gradient.
}
```

(Reuse existing recharts boilerplate; only the series mapping and reference line change. If the current chart shows raw equity, swap the mapping and add `ReferenceLine`.)

- [ ] **Step 4: Rebuild `performance-tab.tsx`**

```tsx
// components/journal/tabs/performance-tab.tsx
"use client";

import { useMemo } from "react";
import { computeTradeStats } from "@/lib/journal/trade-stats";
import { computeStreaks } from "@/lib/journal/streaks";
import { StreaksTable } from "../streaks-table";
import { EquityChart } from "../equity-chart";
import { PnlHistogram } from "../pnl-histogram";
import { fmtCash, fmtPct, fmtPctOrCash } from "@/lib/journal/format-pnl";
import { usePnlDisplay } from "../preferences/journal-chrome-context";
import type { AccountSnapshotDaily, Deal } from "@/lib/types";
import { cn } from "@/lib/utils";

export function PerformanceTab({ deals, daily, currency, baseline }: {
  deals: Deal[]; daily: AccountSnapshotDaily[]; currency: string; baseline: number;
}) {
  const { mode } = usePnlDisplay();
  const stats = useMemo(() => computeTradeStats(deals), [deals]);
  const streaks = useMemo(() => computeStreaks(deals), [deals]);
  const showPct = mode === "percent" && baseline > 0;

  return (
    <section className="space-y-5">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatTile featured label="Net Return"
          tone={stats.netProfit > 0 ? "pos" : stats.netProfit < 0 ? "neg" : "neutral"}
          value={fmtPctOrCash(stats.netProfit, mode, baseline, currency)}
          sub={showPct ? `${fmtCash(stats.netProfit, currency)} cash` : `${fmtPct(baseline > 0 ? (stats.netProfit/baseline)*100 : 0)}`} />
        <StatTile label="Win Rate" value={`${(stats.winRate * 100).toFixed(1)}%`}
          sub={`${stats.wins} win${stats.wins === 1 ? "" : "s"} / ${stats.totalTrades} trade${stats.totalTrades === 1 ? "" : "s"}`} />
        <StatTile label="Profit Factor"
          value={Number.isFinite(stats.profitFactor) ? stats.profitFactor.toFixed(2) : "∞"}
          sub={`${fmtCash(stats.grossProfit, currency)} gain / ${fmtCash(stats.grossLoss, currency)} loss`} />
        <StatTile label="Expected Payoff"
          tone={stats.expectedPayoff > 0 ? "pos" : stats.expectedPayoff < 0 ? "neg" : "neutral"}
          value={fmtPctOrCash(stats.expectedPayoff, mode, baseline, currency)}
          sub="avg P/L per trade" />
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatTile label="Avg Win" tone="pos" value={fmtPctOrCash(stats.avgWin, mode, baseline, currency)} sub={fmtCash(stats.avgWin, currency)} />
        <StatTile label="Avg Loss" tone="neg" value={fmtPctOrCash(-stats.avgLoss, mode, baseline, currency)} sub={fmtCash(-stats.avgLoss, currency)} />
        <StatTile label="Best Trade" tone="pos" value={fmtPctOrCash(stats.bestTrade, mode, baseline, currency)} sub={fmtCash(stats.bestTrade, currency)} />
        <StatTile label="Worst Trade" tone="neg" value={fmtPctOrCash(stats.worstTrade, mode, baseline, currency)} sub={fmtCash(stats.worstTrade, currency)} />
      </div>

      <div className="rounded-lg border bg-card p-4">
        <div className="mb-2 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold">Equity Curve</h3>
            <p className="text-xs text-muted-foreground">cumulative return since start · daily</p>
          </div>
        </div>
        <EquityChart data={daily} currency={currency} baseline={baseline} />
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <StreaksTable streaks={streaks} />
        <PnlHistogram values={deals.map((d) => d.profit)} baseline={baseline} currency={currency} showPct={showPct} />
      </div>
    </section>
  );
}

function StatTile({ label, value, sub, tone = "neutral", featured }: {
  label: string; value: React.ReactNode; sub?: React.ReactNode;
  tone?: "pos" | "neg" | "neutral"; featured?: boolean;
}) {
  return (
    <div className={cn(
      "rounded-lg border p-4",
      featured ? "bg-gradient-to-br from-muted/40 to-card" : "bg-card",
    )}>
      <div className="text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={cn(
        "mt-1 text-xl font-bold tabular-nums tracking-tight",
        tone === "pos" && "text-emerald-600 dark:text-emerald-400",
        tone === "neg" && "text-red-600 dark:text-red-400",
      )}>{value}</div>
      {sub != null && <div className="mt-1 text-[11px] text-muted-foreground">{sub}</div>}
    </div>
  );
}
```

- [ ] **Step 5: Commit**

```bash
git add components/journal/tabs/performance-tab.tsx components/journal/streaks-table.tsx components/journal/pnl-histogram.tsx components/journal/equity-chart.tsx
git commit -m "feat(journal): Performance grid + cumulative-return equity + histogram"
```

---

### Task 24: Objectives banner + card grid

**Files:**
- Modify: `components/journal/tabs/objectives-tab.tsx`
- Create: `components/journal/objective-card.tsx`
- Create: `components/journal/objective-banner.tsx`

- [ ] **Step 1: Create banner**

```tsx
// components/journal/objective-banner.tsx
import { cn } from "@/lib/utils";
import type { ObjectiveStatus } from "@/lib/journal/objectives";

const STYLE = {
  passed: { box: "bg-emerald-50 border-emerald-300 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300", icon: "bg-emerald-500 text-white" },
  failed: { box: "bg-red-50 border-red-300 text-red-800 dark:bg-red-950/40 dark:text-red-300", icon: "bg-red-500 text-white" },
  in_progress: { box: "bg-amber-50 border-amber-300 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300", icon: "bg-amber-500 text-white" },
} as const;

export function ObjectiveBanner({ status, title, detail }: { status: ObjectiveStatus; title: string; detail: string }) {
  const s = STYLE[status];
  const glyph = status === "passed" ? "✓" : status === "failed" ? "✕" : "!";
  return (
    <div className={cn("flex items-center gap-3 rounded-lg border p-3 text-sm", s.box)}>
      <div className={cn("inline-flex size-7 items-center justify-center rounded-md text-base font-bold", s.icon)}>{glyph}</div>
      <div className="flex-1">
        <div className="font-semibold">{title}</div>
        <div className="text-xs opacity-85">{detail}</div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create card**

```tsx
// components/journal/objective-card.tsx
import { cn } from "@/lib/utils";

type State = "ok" | "warn" | "bad" | "neutral";

export function ObjectiveCard({
  name, state, value, sub, fillPct, tickLow, tickHigh,
}: {
  name: string;
  state: State;
  value: React.ReactNode;
  sub: React.ReactNode;
  fillPct: number;
  tickLow: string;
  tickHigh: string;
}) {
  const stateStyles = {
    ok:      { pill: "bg-emerald-50 text-emerald-700", bar: "bg-emerald-500" },
    warn:    { pill: "bg-amber-50 text-amber-700",     bar: "bg-amber-500" },
    bad:     { pill: "bg-red-50 text-red-700",         bar: "bg-red-500" },
    neutral: { pill: "bg-muted text-muted-foreground", bar: "bg-foreground/40" },
  }[state];
  const stateLabel = state === "ok" ? "Safe" : state === "warn" ? "Watch" : state === "bad" ? "Breach" : "—";
  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="flex items-center justify-between">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{name}</div>
        <span className={cn("rounded px-2 py-0.5 text-[11px] font-bold uppercase", stateStyles.pill)}>{stateLabel}</span>
      </div>
      <div className="mt-2 text-2xl font-bold tabular-nums">{value}</div>
      <div className="text-[11px] text-muted-foreground">{sub}</div>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted">
        <div className={cn("h-full rounded-full", stateStyles.bar)} style={{ width: `${Math.max(0, Math.min(100, fillPct))}%` }} />
      </div>
      <div className="mt-1 flex justify-between text-[10px] text-muted-foreground tabular-nums">
        <span>{tickLow}</span><span>{tickHigh}</span>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Rebuild `objectives-tab.tsx`**

```tsx
// components/journal/tabs/objectives-tab.tsx
"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { evaluateObjectives } from "@/lib/journal/objectives";
import type { AccountSnapshotCurrent, AccountSnapshotDaily, License, PropfirmRule } from "@/lib/types";
import { ObjectiveBanner } from "../objective-banner";
import { ObjectiveCard } from "../objective-card";
import { fmtCash, fmtPct, fmtPctOrCash } from "@/lib/journal/format-pnl";
import { usePnlDisplay } from "../preferences/journal-chrome-context";

interface Props {
  license: License;
  rule: PropfirmRule | null;
  snapshot: AccountSnapshotCurrent | null;
  daily: AccountSnapshotDaily[];
  currency: string;
  baseline: number;
}

export function ObjectivesTab({ license, rule, snapshot, daily, currency, baseline }: Props) {
  const { mode } = usePnlDisplay();

  if (rule === null) {
    return (
      <div className="rounded-lg border border-dashed p-6 text-center text-sm">
        <p className="text-muted-foreground">No challenge rule assigned.</p>
        <Button asChild size="sm" variant="outline" className="mt-4">
          <Link href={`/admin/licenses/${license.id}`}>Assign rule</Link>
        </Button>
      </div>
    );
  }
  if (!snapshot) {
    return <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">Waiting for first EA push…</p>;
  }

  const todayUtc = new Date().toISOString().slice(0, 10);
  const r = evaluateObjectives({ rule, currentSnapshot: snapshot, dailySnapshots: daily, todayUtc });
  const title = r.status === "passed" ? "Passed"
              : r.status === "failed" ? "Failed"
              : "In Progress";
  const detail = r.status === "passed"
    ? "All thresholds satisfied · congratulations."
    : r.status === "failed"
    ? r.dailyLossBreached ? "Daily loss limit breached."
    : r.totalLossBreached ? "Total drawdown limit breached."
    : "Failed."
    : `Profit target ${r.profitTargetMet ? "met" : "not yet hit"} · ${r.tradingDaysCount} / min ${rule.min_trading_days} trading days · no rule breaches`;

  const showPct = mode === "percent" && baseline > 0;

  const profitFill = r.profitTargetThreshold > 0 ? (Math.max(0, r.netProfit) / r.profitTargetThreshold) * 100 : 0;
  const dailyLossFill = r.dailyLossThreshold > 0 ? ((r.todaysPnl < 0 ? -r.todaysPnl : 0) / r.dailyLossThreshold) * 100 : 0;
  const totalLossFill = r.totalLossThreshold > 0 ? (r.totalDrawdown / r.totalLossThreshold) * 100 : 0;

  return (
    <section className="space-y-4">
      <ObjectiveBanner status={r.status} title={title} detail={detail} />

      <div className="grid gap-3 md:grid-cols-3">
        <ObjectiveCard
          name="Profit Target"
          state={r.profitTargetMet ? "ok" : "warn"}
          value={fmtPctOrCash(r.netProfit, mode, baseline, currency)}
          sub={`target ${showPct ? fmtPct((r.profitTargetThreshold / baseline) * 100) : fmtCash(r.profitTargetThreshold, currency)} · ${fmtCash(r.profitTargetThreshold, currency)} cash`}
          fillPct={profitFill}
          tickLow="0%"
          tickHigh={`${showPct ? fmtPct((r.profitTargetThreshold / baseline) * 100) : fmtCash(r.profitTargetThreshold, currency)} target`}
        />

        {rule.max_daily_loss > 0 && (
          <ObjectiveCard
            name="Today's Loss Limit"
            state={r.dailyLossBreached ? "bad" : dailyLossFill > 60 ? "warn" : "ok"}
            value={fmtPctOrCash(r.todaysPnl < 0 ? r.todaysPnl : 0, mode, baseline, currency)}
            sub={`limit ${showPct ? fmtPct(-(r.dailyLossThreshold / baseline) * 100) : fmtCash(-r.dailyLossThreshold, currency)} · resets 00:00 UTC`}
            fillPct={dailyLossFill}
            tickLow="0%"
            tickHigh={`${showPct ? fmtPct(-(r.dailyLossThreshold / baseline) * 100) : fmtCash(-r.dailyLossThreshold, currency)} breach`}
          />
        )}

        {rule.max_total_loss > 0 && (
          <ObjectiveCard
            name="Total Drawdown"
            state={r.totalLossBreached ? "bad" : totalLossFill > 60 ? "warn" : "ok"}
            value={fmtPctOrCash(-r.totalDrawdown, mode, baseline, currency)}
            sub={`limit ${showPct ? fmtPct(-(r.totalLossThreshold / baseline) * 100) : fmtCash(-r.totalLossThreshold, currency)} · ${fmtCash(r.totalLossThreshold, currency)} cash`}
            fillPct={totalLossFill}
            tickLow="0%"
            tickHigh={`${showPct ? fmtPct(-(r.totalLossThreshold / baseline) * 100) : fmtCash(-r.totalLossThreshold, currency)} breach`}
          />
        )}
      </div>

      {(rule.min_trading_days || rule.max_trading_days) && (
        <div className="rounded-lg border bg-muted/30 px-4 py-3 text-xs text-muted-foreground">
          <span className="font-semibold text-foreground">Trading days:</span>{" "}
          {r.tradingDaysCount} of min {rule.min_trading_days}
          {rule.max_trading_days ? ` (max ${rule.max_trading_days})` : ""}
          {r.tradingDaysCount < rule.min_trading_days && (
            <> — need {rule.min_trading_days - r.tradingDaysCount} more day(s) with at least one closed trade to qualify.</>
          )}
        </div>
      )}
    </section>
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add components/journal/tabs/objectives-tab.tsx components/journal/objective-banner.tsx components/journal/objective-card.tsx
git commit -m "feat(journal): Objectives banner + 3-card grid with state pills"
```

---

### Task 25: Overview hero + recent trades + positions

**Files:**
- Modify: `components/journal/tabs/overview-tab.tsx`
- Create: `components/journal/overview-hero.tsx`
- Create: `components/journal/recent-trades.tsx`
- Create: `components/journal/challenge-mini.tsx`

- [ ] **Step 1: Create `OverviewHero`**

```tsx
// components/journal/overview-hero.tsx
import { Sparkline } from "./sparkline";
import { fmtCash, fmtPct, fmtPctOrCash } from "@/lib/journal/format-pnl";
import { usePnlDisplay } from "./preferences/journal-chrome-context";
import { cn } from "@/lib/utils";

export function OverviewHero({
  cumulativePct, cumulativeCash, currency, baseline, series, winRatePct, bestDay, worstDay,
}: {
  cumulativePct: number; cumulativeCash: number; currency: string; baseline: number;
  series: number[]; winRatePct: number; bestDay: number; worstDay: number;
}) {
  const { mode } = usePnlDisplay();
  const tone = cumulativePct > 0 ? "pos" : cumulativePct < 0 ? "neg" : "neutral";
  return (
    <div className="rounded-xl border bg-gradient-to-br from-muted/40 to-card p-5">
      <div className="flex items-start justify-between gap-5">
        <div>
          <div className="text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">Net Return · since start</div>
          <div className={cn("mt-1 text-4xl font-extrabold tracking-tight tabular-nums",
            tone === "pos" && "text-emerald-600 dark:text-emerald-400",
            tone === "neg" && "text-red-600 dark:text-red-400")}>
            {mode === "percent" && baseline > 0 ? fmtPct(cumulativePct) : fmtCash(cumulativeCash, currency)}
          </div>
          <div className="mt-1 text-xs text-muted-foreground">
            {mode === "percent" ? fmtCash(cumulativeCash, currency) : fmtPct(cumulativePct)}
          </div>
        </div>
        <div className="w-36 shrink-0">
          <Sparkline values={series} tone={tone === "pos" ? "positive" : tone === "neg" ? "negative" : "neutral"} height={40} />
        </div>
      </div>
      <div className="mt-4 grid grid-cols-3 gap-3 border-t pt-3">
        <Mini label="Win Rate" value={`${winRatePct.toFixed(1)}%`} />
        <Mini label="Best Day"  value={fmtPctOrCash(bestDay, mode, baseline, currency)} tone="pos" />
        <Mini label="Worst Day" value={fmtPctOrCash(worstDay, mode, baseline, currency)} tone="neg" />
      </div>
    </div>
  );
}

function Mini({ label, value, tone }: { label: string; value: React.ReactNode; tone?: "pos" | "neg" }) {
  return (
    <div>
      <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={cn("text-base font-bold tabular-nums",
        tone === "pos" && "text-emerald-600 dark:text-emerald-400",
        tone === "neg" && "text-red-600 dark:text-red-400")}>{value}</div>
    </div>
  );
}
```

- [ ] **Step 2: Create `ChallengeMini`**

```tsx
// components/journal/challenge-mini.tsx
import Link from "next/link";
import type { AccountSnapshotCurrent, AccountSnapshotDaily, PropfirmRule } from "@/lib/types";
import { evaluateObjectives } from "@/lib/journal/objectives";
import { fmtPct, fmtCash } from "@/lib/journal/format-pnl";
import { usePnlDisplay } from "./preferences/journal-chrome-context";
import { cn } from "@/lib/utils";

export function ChallengeMini({ rule, snapshot, daily, baseline, currency, licenseId }: {
  rule: PropfirmRule | null; snapshot: AccountSnapshotCurrent | null; daily: AccountSnapshotDaily[];
  baseline: number; currency: string; licenseId: number;
}) {
  const { mode } = usePnlDisplay();
  if (!rule || !snapshot) {
    return (
      <div className="rounded-xl border bg-card p-4 text-sm text-muted-foreground">
        No challenge rule assigned.{" "}
        <Link href={`/admin/licenses/${licenseId}`} className="text-foreground underline-offset-2 hover:underline">Assign one →</Link>
      </div>
    );
  }
  const todayUtc = new Date().toISOString().slice(0, 10);
  const r = evaluateObjectives({ rule, currentSnapshot: snapshot, dailySnapshots: daily, todayUtc });
  const showPct = mode === "percent" && baseline > 0;
  const fmt = (cash: number) => showPct ? fmtPct(baseline > 0 ? (cash / baseline) * 100 : 0) : fmtCash(cash, currency);

  const rows: Array<{ name: string; value: string; target: string; fill: number; tone: "ok"|"warn"|"bad"|"neutral" }> = [
    { name: "Profit target",     value: fmt(r.netProfit),        target: fmt(r.profitTargetThreshold), fill: r.profitTargetThreshold ? (Math.max(0, r.netProfit) / r.profitTargetThreshold) * 100 : 0, tone: r.profitTargetMet ? "ok" : "warn" },
    { name: "Daily loss limit",  value: fmt(r.todaysPnl < 0 ? r.todaysPnl : 0), target: fmt(-r.dailyLossThreshold), fill: r.dailyLossThreshold ? ((r.todaysPnl < 0 ? -r.todaysPnl : 0) / r.dailyLossThreshold) * 100 : 0, tone: r.dailyLossBreached ? "bad" : "warn" },
    { name: "Total drawdown",    value: fmt(-r.totalDrawdown),   target: fmt(-r.totalLossThreshold), fill: r.totalLossThreshold ? (r.totalDrawdown / r.totalLossThreshold) * 100 : 0, tone: r.totalLossBreached ? "bad" : "warn" },
    { name: "Trading days",      value: `${r.tradingDaysCount}`, target: `min ${rule.min_trading_days}`, fill: rule.min_trading_days ? Math.min(100, (r.tradingDaysCount / rule.min_trading_days) * 100) : 0, tone: "neutral" },
  ];

  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="mb-3 flex items-center justify-between">
        <h4 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Challenge Status</h4>
        <span className={cn("rounded px-2 py-0.5 text-[10px] font-bold uppercase",
          r.status === "passed" && "bg-emerald-50 text-emerald-700",
          r.status === "failed" && "bg-red-50 text-red-700",
          r.status === "in_progress" && "bg-amber-50 text-amber-700",
        )}>{r.status.replace("_", " ")}</span>
      </div>
      <div className="space-y-2.5">
        {rows.map((row) => (
          <div key={row.name}>
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">{row.name}</span>
              <span className="font-semibold tabular-nums">{row.value} / {row.target}</span>
            </div>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
              <div className={cn("h-full",
                row.tone === "ok" && "bg-emerald-500",
                row.tone === "warn" && "bg-amber-500",
                row.tone === "bad" && "bg-red-500",
                row.tone === "neutral" && "bg-foreground/40",
              )} style={{ width: `${Math.max(0, Math.min(100, row.fill))}%` }} />
            </div>
          </div>
        ))}
      </div>
      <Link href="#objectives" className="mt-3 inline-block text-xs font-medium text-foreground underline-offset-2 hover:underline">
        Go to Objectives →
      </Link>
    </div>
  );
}
```

- [ ] **Step 3: Create `RecentTrades`**

```tsx
// components/journal/recent-trades.tsx
import { format, parseISO } from "date-fns";
import type { Deal } from "@/lib/types";
import { SidePill } from "./tables/side-pill";
import { fmtCash, fmtPct, fmtPctOrCash } from "@/lib/journal/format-pnl";
import { usePnlDisplay } from "./preferences/journal-chrome-context";
import { cn } from "@/lib/utils";

export function RecentTrades({ deals, currency, baseline }: { deals: Deal[]; currency: string; baseline: number }) {
  const { mode } = usePnlDisplay();
  const last5 = [...deals]
    .sort((a, b) => a.close_time < b.close_time ? 1 : -1)
    .slice(0, 5);

  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="mb-2 flex items-center justify-between">
        <h4 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Recent Trades · last 5</h4>
        <a href="#trades" className="text-[11px] text-muted-foreground hover:text-foreground">View all ({deals.length}) →</a>
      </div>
      {last5.length === 0 ? (
        <div className="rounded-md border border-dashed py-6 text-center text-xs text-muted-foreground">No trades yet.</div>
      ) : (
        <div className="divide-y">
          {last5.map((d) => {
            const pnlPct = baseline > 0 ? (d.profit / baseline) * 100 : 0;
            return (
              <div key={d.ticket} className="grid grid-cols-[3px_1fr_auto] items-center gap-3 py-2.5">
                <span className={cn("h-6 w-[3px] rounded-sm", d.side === "buy" ? "bg-emerald-500" : "bg-red-500")} />
                <div>
                  <div className="text-sm font-semibold">
                    {d.symbol} <SidePill variant={d.side}>{d.side}</SidePill>
                  </div>
                  <div className="text-[11px] text-muted-foreground tabular-nums">
                    {format(parseISO(d.close_time), "MMM dd · HH:mm")} · {d.volume.toFixed(2)} lot
                  </div>
                </div>
                <div className={cn("text-sm font-bold tabular-nums",
                  d.profit > 0 && "text-emerald-600 dark:text-emerald-400",
                  d.profit < 0 && "text-red-600 dark:text-red-400")}
                  title={`${fmtCash(d.profit, currency)} cash · ${fmtPct(pnlPct)} of baseline`}>
                  {fmtPctOrCash(d.profit, mode, baseline, currency)}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Rebuild `overview-tab.tsx`**

```tsx
// components/journal/tabs/overview-tab.tsx
"use client";

import { useMemo } from "react";
import type { AccountSnapshotCurrent, AccountSnapshotDaily, Deal, License, Position, PropfirmRule } from "@/lib/types";
import { OverviewHero } from "../overview-hero";
import { ChallengeMini } from "../challenge-mini";
import { RecentTrades } from "../recent-trades";
import { PositionsTable } from "../tables/positions-table";
import { aggregateCalendar } from "@/lib/journal/calendar-aggregate";

interface Props {
  license: License;
  rule: PropfirmRule | null;
  snapshot: AccountSnapshotCurrent | null;
  daily: AccountSnapshotDaily[];
  positions: Position[];
  deals: Deal[];
  currency: string;
  baseline: number;
}

export function OverviewTab({ license, rule, snapshot, daily, positions, deals, currency, baseline }: Props) {
  const series = useMemo(() => daily.map((d) => d.balance_close), [daily]);
  const winRatePct = useMemo(() => {
    if (deals.length === 0) return 0;
    return (deals.filter((d) => d.profit > 0).length / deals.length) * 100;
  }, [deals]);
  const { cumulativePct, cumulativeCash, bestDay, worstDay } = useMemo(() => {
    const last = daily.at(-1)?.balance_close ?? baseline;
    const cumCash = last - baseline;
    const cumPct = baseline > 0 ? (cumCash / baseline) * 100 : 0;
    let best = 0, worst = 0;
    for (const cell of aggregateCalendar(deals).values()) {
      if (cell.netPnl > best) best = cell.netPnl;
      if (cell.netPnl < worst) worst = cell.netPnl;
    }
    return { cumulativePct: cumPct, cumulativeCash: cumCash, bestDay: best, worstDay: worst };
  }, [daily, deals, baseline]);

  return (
    <section className="space-y-4">
      <div className="grid gap-4 md:grid-cols-[1.4fr_1fr]">
        <OverviewHero
          cumulativePct={cumulativePct}
          cumulativeCash={cumulativeCash}
          currency={currency}
          baseline={baseline}
          series={series}
          winRatePct={winRatePct}
          bestDay={bestDay}
          worstDay={worstDay}
        />
        <ChallengeMini rule={rule} snapshot={snapshot} daily={daily} baseline={baseline} currency={currency} licenseId={license.id} />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <RecentTrades deals={deals} currency={currency} baseline={baseline} />
        <div className="rounded-xl border bg-card p-4">
          <div className="mb-2 flex items-center justify-between">
            <h4 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Open Positions · <span className="text-foreground">{positions.length}</span>
            </h4>
            <span className="text-[11px] text-muted-foreground">
              Floating {baseline > 0 ? `${((snapshot?.floating_pnl ?? 0) / baseline * 100).toFixed(2)}%` : `${(snapshot?.floating_pnl ?? 0).toFixed(2)}`}
            </span>
          </div>
          <PositionsTable positions={positions} currency={currency} baseline={baseline} />
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 5: Commit**

```bash
git add components/journal/tabs/overview-tab.tsx components/journal/overview-hero.tsx components/journal/challenge-mini.tsx components/journal/recent-trades.tsx
git commit -m "feat(journal): Overview hero + ChallengeMini + RecentTrades"
```

---

*Phase 5 checkpoint:* All 6 tabs rebuilt. Full journal redesign is now visible end-to-end. Worth a merge.

---

## Phase 6 — Smoke + cleanup

### Task 26: Playwright E2E smoke

**Files:**
- Create: `e2e/user-journal-redesign.spec.ts`

- [ ] **Step 1: Inspect helper signatures**

Read `e2e/helpers/auth.ts` and `e2e/helpers/seed.ts` to confirm the available helpers (signed-in user fixture, seeded license). Mirror the patterns from `e2e/admin-issues-trial.spec.ts`.

- [ ] **Step 2: Write the spec**

```ts
// e2e/user-journal-redesign.spec.ts
import { test, expect } from "@playwright/test";
import { loginAsSeededUser } from "./helpers/auth";
import { seedLicenseWithJournalData } from "./helpers/seed";

test.describe("User journal redesign smoke", () => {
  test("user toggles % / $, filters trades, paginates orders, opens calendar", async ({ page }) => {
    const { licenseId } = await seedLicenseWithJournalData();
    await loginAsSeededUser(page);
    await page.goto(`/dashboard/licenses/${licenseId}`);

    // Chrome present
    await expect(page.getByText(/Net Return/i)).toBeVisible();
    await expect(page.getByText(/Margin/i)).toBeVisible();
    await expect(page.getByRole("button", { name: /^%$/ })).toBeVisible();

    // Flip to $
    await page.getByRole("button", { name: /^\$$/ }).click();
    await expect(page.getByText(/overridden/i)).toBeVisible();

    // Trades tab + Wins filter
    await page.getByRole("tab", { name: /Trades/ }).click();
    await page.getByRole("button", { name: /Wins/ }).click();
    await expect(page.getByText(/win rate/i)).toBeVisible();

    // Orders pagination
    await page.getByRole("tab", { name: /Orders/ }).click();
    await expect(page.getByText(/Showing 1–/i)).toBeVisible();

    // Calendar tab
    await page.getByRole("tab", { name: /Calendar/i }).click();
    await expect(page.getByText(/Click a day to filter Trades/i)).toBeVisible();

    // Objectives tab
    await page.getByRole("tab", { name: /Objectives/i }).click();
    await expect(page.getByText(/Profit Target/i)).toBeVisible();
  });

  test("global preference defaults to % when user has no row", async ({ page }) => {
    const { licenseId } = await seedLicenseWithJournalData();
    await loginAsSeededUser(page);
    await page.goto(`/dashboard/licenses/${licenseId}`);
    // % button is the on state
    const pctBtn = page.getByRole("button", { name: /^%$/ }).first();
    await expect(pctBtn).toHaveClass(/bg-foreground/);
  });
});
```

If `seedLicenseWithJournalData` does not yet exist, add a minimal helper that creates a license with at least 5 deals, 5 orders, and 5 daily snapshots — model after the trial seed in `e2e/helpers/seed.ts`.

- [ ] **Step 3: Run E2E**

Run: `pnpm e2e -- user-journal-redesign`
Expected: 2 tests pass.

- [ ] **Step 4: Commit**

```bash
git add e2e/user-journal-redesign.spec.ts e2e/helpers/
git commit -m "test(e2e): smoke user journal redesign"
```

---

### Task 27: Cleanup dead components

**Files:**
- Delete: `components/journal/deals-table.tsx`
- Delete: `components/journal/open-positions-table.tsx`
- Delete: `components/journal/stat-card.tsx`
- Delete: `components/journal/rule-progress.tsx`
- Delete: `components/journal/data-age-indicator.tsx` (only if its callers are gone — verify)

- [ ] **Step 1: Verify nothing imports the old files**

```bash
grep -RIn "from .*\(deals-table\|open-positions-table\|stat-card\|rule-progress\|data-age-indicator\)" \
  --include="*.ts" --include="*.tsx" \
  app components lib | grep -v ".next" | grep -v "node_modules"
```

Expected: no matches. If there are matches, fix the importers first (they should have been retargeted to the new components in earlier phases).

- [ ] **Step 2: Delete the files**

```bash
git rm components/journal/deals-table.tsx \
        components/journal/open-positions-table.tsx \
        components/journal/stat-card.tsx \
        components/journal/rule-progress.tsx
# Only delete data-age-indicator if step 1 confirmed it has no callers.
```

- [ ] **Step 3: Run the build to confirm nothing breaks**

Run: `pnpm build`
Expected: build succeeds, no TS errors.

- [ ] **Step 4: Run all tests**

Run: `pnpm test && pnpm e2e`
Expected: all green.

- [ ] **Step 5: Commit**

```bash
git commit -m "chore(journal): remove components superseded by redesign"
```

---

*Phase 6 checkpoint:* Final state — redesign complete, smoke tested, dead code removed.

---

## Self-Review

**Spec coverage map** (each spec section → task that implements it):

| Spec section | Tasks |
|---|---|
| Page chrome: header | T15 |
| Page chrome: KPI cards + sparkline + Net Return featured | T9, T10, T16 |
| Page chrome: Account metadata strip | T16 |
| Page chrome: persistent toolbar (`%/$` + Range) | T8, T17, T18 |
| Page chrome: tab nav with counts | T18 |
| Tables: shared row anatomy (side-rail, pills) | T11 |
| Tables: filter chips + search + pagination | T12, T13, T14 |
| Tables: Trades | T19 |
| Tables: Orders + enum humanization | T6, T20 |
| Tables: Open Positions | T21 |
| Tables: sortable headers | T19, T20 |
| Tables: empty states | T19, T20, T21 |
| Calendar heatmap + week column + click-to-filter | T22 |
| Performance: stat grid (Net Return hero + companions) | T23 |
| Performance: equity curve as cumulative return | T23 |
| Performance: streaks + histogram | T23 |
| Objectives: banner + 3-card grid | T24 |
| Objectives: trading days footer | T24 |
| Objectives: no-rule placeholder | T24 |
| Overview: hero + recent trades + open positions | T25 |
| Overview: challenge status mini | T25 |
| `%`/`$` system: data model + RLS | T1 |
| `%`/`$` system: server helper | T2 |
| `%`/`$` system: settings UI + nav entry | T3 |
| `%`/`$` system: per-journal session override | T8 |
| `%`/`$` system: baseline resolution | T5, T18 |
| `%`/`$` system: formatting helpers | T4 |
| `%`/`$` system: tooltip `$` peek on `%` cells | T19, T20, T21, T25 (via `title=` attribute) |
| Architectural notes: file boundaries | All tasks adhere to listed paths |
| Testing: unit coverage | T2, T4–T7, T8, T13, T14, T19, T20 |
| Testing: E2E smoke | T26 |
| Cleanup of superseded files | T27 |

No spec section is unimplemented.

**Placeholder scan:** none. All steps have concrete code or commands. The two narrative steps (T15 step 2, T22 step 3) describe class-by-class changes against an existing file; they're acceptable because the existing files are short and the diff is precise.

**Type consistency:** verified.
- `PnlDisplay` defined in `lib/preferences/server.ts` (T2), reused in `lib/journal/format-pnl.ts` (T4) and `journal-chrome-context.tsx` (T8) — all reference the same union.
- `BaselineResult` defined in T5, consumed by T18.
- `TableState` defined in T14, consumed by T19 (`applyTradeFilters`) and T20 (`applyOrderFilters`).
- `SortValue` template type defined in T14, used in T19 and T20.
- `JournalChromeProvider` props (`licenseId`, `initialPnlDisplay`, `initialRangeDays`) match between T8 (definition) and T18 (caller).
- `KpiCard` props match between T10 (definition) and T16 (caller).
- `useTableState` return shape used identically in T19 and T20.

No mismatches found.

---

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-05-15-user-journal-redesign.md`. Two execution options:**

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration. Best for a plan this size — context stays clean and each task gets independent verification.

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints. Better if you want to ride along and steer.

**Which approach?**
