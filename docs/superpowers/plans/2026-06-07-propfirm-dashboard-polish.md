# Prop-Firm Dashboard Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a rule-based Drawdown KPI card to the prop-firm dashboard, make the $/% display preference truly site-wide (DB-backed single source of truth, applied to the Prop Firms page), and open a searchable/sortable/paginated trades modal when a calendar day is clicked.

**Architecture:** Display-layer changes only — no new tables or API routes. A new pure helper (`lib/journal/dashboard-drawdown.ts`) mirrors the Prop Firms page drawdown math for the dashboard card. The per-license localStorage override in `JournalChromeProvider` is deleted; `setMode` persists via the existing `updatePnlDisplay` server action. The Prop Firms page (server component) fetches the preference and passes it as a prop. The day modal is a new client component reusing existing table primitives (`useTableState`, `applyTradeFilters`, `Pagination`, `Th`).

**Tech Stack:** Next.js 16 (App Router), React 19, Supabase, Radix Dialog, date-fns, Jest (ts-jest; `node` project for `*.test.ts`, `jsdom` for `*.test.tsx`), Testing Library. Package manager: `pnpm`. Run tests with `pnpm test`.

**Spec:** `docs/superpowers/specs/2026-06-07-propfirm-dashboard-polish-design.md`

**UI polish note (user request):** for the UI tasks (2, 5, 6, 9, 10), invoke the `frontend-design:frontend-design` skill before writing component JSX. The code in those tasks is the functional baseline — polish visuals within the existing dark dashboard aesthetic, but keep the DOM/text the tests assert on (labels, placeholders, link text) intact.

**Branch:** work on a feature branch, e.g. `git checkout -b feature/propfirm-dashboard-polish` (or a worktree via superpowers:using-git-worktrees).

---

## Task 1: Drawdown card helper (`lib/journal/dashboard-drawdown.ts`)

Pure function that computes the dashboard Drawdown card data, mirroring `getPropFirmOverview` (`lib/prop-firm-data.ts:76-90`): challenge accounts use `evaluateObjectives().totalDrawdown` against `rule.account_size`; funded accounts use the MT5-native `snapshot.drawdown_pct`.

**Files:**
- Create: `lib/journal/dashboard-drawdown.ts`
- Test: `lib/journal/dashboard-drawdown.test.ts`

- [ ] **Step 1: Write the failing test**

Create `lib/journal/dashboard-drawdown.test.ts`:

```ts
import { computeDrawdownCard } from "./dashboard-drawdown";
import { evaluateObjectives } from "./objectives";
import type { AccountSnapshotCurrent, PropfirmRule } from "@/lib/types";

function rule(partial: Partial<PropfirmRule> = {}): PropfirmRule {
  return {
    id: 1,
    user_id: "00000000-0000-0000-0000-000000000001",
    name: "FTMO Phase 2 - 10k",
    account_size: 10_000,
    max_daily_loss: 5,
    daily_loss_type: "percent",
    daily_loss_calc: "balance",
    max_total_loss: 10,
    total_loss_type: "percent",
    profit_target: 5,
    target_type: "percent",
    min_trading_days: 4,
    max_trading_days: null,
    created_at: "2026-05-01T00:00:00Z",
    ...partial,
  };
}

function snapshot(partial: Partial<AccountSnapshotCurrent> = {}): AccountSnapshotCurrent {
  return {
    mt5_account: 531290109,
    balance: 9_697.73,
    equity: 9_697.73,
    margin: 0,
    free_margin: 9_697.73,
    margin_level: null,
    floating_pnl: 0,
    drawdown_pct: 0,
    leverage: 100,
    currency: "USD",
    server: null,
    pushed_at: "2026-06-07T00:00:00Z",
    ...partial,
  };
}

function challengeCard(r: PropfirmRule, s: AccountSnapshotCurrent) {
  const evaluation = evaluateObjectives({
    rule: r, currentSnapshot: s, dailySnapshots: [], todayUtc: "2026-06-07",
  });
  return computeDrawdownCard({ product: "ctx-prop-passer", rule: r, snapshot: s, evaluation });
}

describe("computeDrawdownCard — challenge accounts", () => {
  it("uses rule-based total drawdown against account size (matches Prop Firms page)", () => {
    const card = challengeCard(rule(), snapshot());
    expect(card.drawdownCash).toBeCloseTo(302.27, 2);
    expect(card.drawdownPct).toBeCloseTo(3.0227, 3);
    expect(card.limitCash).toBe(1_000);   // 10% of 10k
    expect(card.limitPct).toBe(10);
    expect(card.tone).toBe("neutral");
  });

  it("uses equity when it is below balance (floating loss eats the buffer)", () => {
    const card = challengeCard(rule(), snapshot({ balance: 9_700, equity: 9_500 }));
    expect(card.drawdownCash).toBeCloseTo(500, 2);
  });

  it("turns warn at >= 70% of the total-loss limit (WATCH threshold)", () => {
    const card = challengeCard(rule(), snapshot({ balance: 9_250, equity: 9_250 })); // dd 750 >= 700
    expect(card.tone).toBe("warn");
  });

  it("turns negative when the total-loss limit is breached", () => {
    const card = challengeCard(rule(), snapshot({ balance: 8_900, equity: 8_900 })); // dd 1100 >= 1000
    expect(card.tone).toBe("negative");
  });

  it("handles account_size 0 without dividing by zero", () => {
    const card = challengeCard(rule({ account_size: 0 }), snapshot({ balance: 0, equity: 0 }));
    expect(card.drawdownPct).toBe(0);
    expect(card.tone).toBe("neutral");
  });
});

describe("computeDrawdownCard — funded accounts", () => {
  function fundedCard(s: AccountSnapshotCurrent) {
    const r = rule();
    const evaluation = evaluateObjectives({
      rule: r, currentSnapshot: s, dailySnapshots: [], todayUtc: "2026-06-07",
    });
    return computeDrawdownCard({ product: "ctx-prop-funded", rule: r, snapshot: s, evaluation });
  }

  it("uses MT5-native drawdown_pct with no limits", () => {
    const card = fundedCard(snapshot({ drawdown_pct: 2.5 }));
    expect(card.drawdownPct).toBe(2.5);
    expect(card.drawdownCash).toBeCloseTo(250, 2); // 2.5% of 10k
    expect(card.limitCash).toBeNull();
    expect(card.limitPct).toBeNull();
    expect(card.tone).toBe("negative");
  });

  it("is neutral at zero drawdown", () => {
    const card = fundedCard(snapshot({ drawdown_pct: 0 }));
    expect(card.drawdownPct).toBe(0);
    expect(card.tone).toBe("neutral");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test -- lib/journal/dashboard-drawdown.test.ts`
Expected: FAIL — `Cannot find module './dashboard-drawdown'`

- [ ] **Step 3: Write the implementation**

Create `lib/journal/dashboard-drawdown.ts`:

```ts
import type { AccountSnapshotCurrent, PropfirmRule } from "@/lib/types";
import type { ObjectivesResult } from "@/lib/journal/objectives";
import type { Product } from "@/lib/products";

/** Subset of KpiCard's CardTone — drawdown is never "positive". */
export type DrawdownTone = "neutral" | "warn" | "negative";

export interface DrawdownCard {
  /** >= 0 — cash currently drawn down from account size. */
  drawdownCash: number;
  /** >= 0 — percent of account size; matches the Prop Firms page figure. */
  drawdownPct: number;
  /** Total-loss limit in cash; null for funded accounts (no challenge thresholds). */
  limitCash: number | null;
  /** Total-loss limit as percent of account size; null for funded accounts. */
  limitPct: number | null;
  tone: DrawdownTone;
}

/**
 * Drawdown card data for the prop-firm dashboard, mirroring the per-product
 * logic in getPropFirmOverview (lib/prop-firm-data.ts) so both pages show the
 * same number:
 * - challenge: rule-based totalDrawdown vs account_size, toned by the hero's
 *   WATCH (>= 70% of limit) / breach thresholds
 * - funded: MT5-native snapshot.drawdown_pct, plain negative when > 0
 */
export function computeDrawdownCard(input: {
  product: Product;
  rule: PropfirmRule;
  snapshot: AccountSnapshotCurrent;
  evaluation: ObjectivesResult;
}): DrawdownCard {
  const { product, rule, snapshot, evaluation } = input;
  const size = rule.account_size;

  if (product === "ctx-prop-funded") {
    const pct = Math.max(0, snapshot.drawdown_pct);
    return {
      drawdownCash: size > 0 ? (pct / 100) * size : 0,
      drawdownPct: pct,
      limitCash: null,
      limitPct: null,
      tone: pct > 0 ? "negative" : "neutral",
    };
  }

  const cash = evaluation.totalDrawdown;
  const limit = evaluation.totalLossThreshold;
  const tone: DrawdownTone =
    limit > 0 && cash >= limit ? "negative"
    : limit > 0 && cash >= limit * 0.7 ? "warn"
    : "neutral";

  return {
    drawdownCash: cash,
    drawdownPct: size > 0 ? (cash / size) * 100 : 0,
    limitCash: limit,
    limitPct: size > 0 ? (limit / size) * 100 : null,
    tone,
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test -- lib/journal/dashboard-drawdown.test.ts`
Expected: PASS (7 tests)

- [ ] **Step 5: Commit**

```bash
git add lib/journal/dashboard-drawdown.ts lib/journal/dashboard-drawdown.test.ts
git commit -m "feat(dashboard): add rule-based drawdown card helper"
```

---

## Task 2: Render the Drawdown card in `DashboardObjective`

**Files:**
- Modify: `components/dashboard/dashboard-objective.tsx`

- [ ] **Step 1: Invoke the frontend-design skill** (see UI polish note in the header), then replace the file contents with:

```tsx
"use client";

import { useMemo } from "react";
import { useAccountContext } from "@/lib/hooks/use-account-context";
import { KpiCard } from "@/components/journal/kpi-card";
import { EquityChart } from "@/components/journal/equity-chart";
import { ChallengeProgressHero } from "./challenge-progress-hero";
import { RecentTradesList } from "./recent-trades-list";
import { computeTradeEquity } from "@/lib/journal/trade-equity";
import { evaluateObjectives } from "@/lib/journal/objectives";
import { computeDrawdownCard } from "@/lib/journal/dashboard-drawdown";
import { fmtCash, fmtPct } from "@/lib/journal/format-pnl";
import { usePnlDisplay } from "@/components/journal/preferences/journal-chrome-context";

export function DashboardObjective() {
  const { license, deals, snapshot, baseline, currency, rule, daily } = useAccountContext();
  const { mode } = usePnlDisplay();

  const trade = useMemo(() => computeTradeEquity(deals), [deals]);

  // Same evaluation the hero runs — cheap pure function, no extra queries.
  const dd = useMemo(() => {
    if (!rule || !snapshot) return null;
    const todayUtc = new Date().toISOString().slice(0, 10);
    const evaluation = evaluateObjectives({ rule, currentSnapshot: snapshot, dailySnapshots: daily, todayUtc });
    return computeDrawdownCard({ product: license.product, rule, snapshot, evaluation });
  }, [license.product, rule, snapshot, daily]);

  const showPct = mode === "percent" && baseline.baseline > 0;
  const fmtVal = (cash: number) => showPct ? fmtPct((cash / baseline.baseline) * 100) : fmtCash(cash, currency);

  const winCount = deals.filter((d) => d.profit > 0).length;
  const winRate = deals.length > 0 ? (winCount / deals.length) * 100 : 0;
  const hasHistory = trade.curve.length > 0;

  // Drawdown is shown against account size (not baseline) so the % matches
  // the Prop Firms page; the 0-guards avoid "−0.00%" / "-$0.00" displays.
  const ddValue = !dd ? "—"
    : mode === "percent"
      ? fmtPct(dd.drawdownPct > 0 ? -dd.drawdownPct : 0)
      : fmtCash(dd.drawdownCash > 0 ? -dd.drawdownCash : 0, currency);
  const ddSub = !dd ? "no data"
    : dd.limitCash === null || dd.limitPct === null
      ? "MT5 reported"
      : mode === "percent"
        ? `limit ${fmtPct(-dd.limitPct)}`
        : `limit ${fmtCash(-dd.limitCash, currency)}`;

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Dashboard</h1>

      <ChallengeProgressHero />

      <div className="grid gap-4 md:grid-cols-[auto_1fr]">
        <div className="flex flex-col gap-3 md:w-48">
          <KpiCard
            featured
            label="Net P&L"
            tone={!hasHistory ? "neutral" : trade.netPnl > 0 ? "positive" : "negative"}
            value={!hasHistory ? "—" : fmtVal(trade.netPnl)}
            sub={!hasHistory ? "no trades" : `${trade.curve.length} trades`}
          />
          <KpiCard
            label="Win Rate"
            value={deals.length === 0 ? "—" : `${winRate.toFixed(1)}%`}
            sub={deals.length === 0 ? "no trades" : `${winCount}W / ${deals.length}`}
          />
          <KpiCard
            label="Equity"
            value={fmtCash(snapshot?.equity ?? 0, currency)}
            sub={`balance ${fmtCash(snapshot?.balance ?? 0, currency)}`}
          />
          <KpiCard
            label="Drawdown"
            tone={dd?.tone ?? "neutral"}
            value={ddValue}
            sub={ddSub}
          />
        </div>
        <div className="rounded-xl border bg-card p-4">
          <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Equity Curve</h3>
          <EquityChart deals={deals} currency={currency} baseline={baseline.baseline} />
        </div>
      </div>

      <RecentTradesList />
    </div>
  );
}
```

Note: `DrawdownTone` (`"neutral" | "warn" | "negative"`) is a literal subset of KpiCard's `CardTone`, so `dd.tone` is directly assignable.

- [ ] **Step 2: Verify it compiles and existing tests still pass**

Run: `pnpm exec tsc --noEmit && pnpm test`
Expected: tsc exits 0; all tests PASS

- [ ] **Step 3: Commit**

```bash
git add components/dashboard/dashboard-objective.tsx
git commit -m "feat(dashboard): show rule-based drawdown card on prop-firm dashboard"
```

---

## Task 3: Make the $/% mode global-only (remove the per-license override)

The DB preference becomes the single source of truth. `setMode` updates optimistically and persists via the existing `updatePnlDisplay` server action; the localStorage override layer and the `source` field are deleted.

**Files:**
- Modify: `components/journal/preferences/journal-chrome-context.tsx`
- Modify: `components/journal/journal-toolbar.tsx:16,27` (drop `source` + "overridden" badge)
- Test: `components/journal/preferences/use-pnl-display.test.tsx` (rewrite)

- [ ] **Step 1: Rewrite the test to describe the new behavior**

Replace the contents of `components/journal/preferences/use-pnl-display.test.tsx` with:

```tsx
import { render, screen, act, waitFor } from "@testing-library/react";
import { JournalChromeProvider, usePnlDisplay, useRangeScope } from "./journal-chrome-context";
import { updatePnlDisplay } from "@/app/dashboard/settings/actions";

jest.mock("@/app/dashboard/settings/actions", () => ({
  updatePnlDisplay: jest.fn(),
}));

const mockUpdate = updatePnlDisplay as jest.MockedFunction<typeof updatePnlDisplay>;

function Probe() {
  const { mode, setMode } = usePnlDisplay();
  const { range, setRange } = useRangeScope();
  return (
    <div>
      <span data-testid="mode">{mode}</span>
      <span data-testid="range">{range}</span>
      <button onClick={() => setMode("dollar")}>D</button>
      <button onClick={() => setRange(7)}>7d</button>
    </div>
  );
}

function renderProvider() {
  return render(
    <JournalChromeProvider licenseId={1} initialPnlDisplay="percent" initialRangeDays={30}>
      <Probe />
    </JournalChromeProvider>,
  );
}

describe("JournalChromeProvider (global-only $/% mode)", () => {
  beforeEach(() => {
    window.localStorage.clear();
    mockUpdate.mockReset();
    mockUpdate.mockResolvedValue({ ok: true });
  });

  it("starts with the global preference", () => {
    renderProvider();
    expect(screen.getByTestId("mode").textContent).toBe("percent");
    expect(screen.getByTestId("range").textContent).toBe("30");
  });

  it("ignores stale per-license localStorage overrides", () => {
    window.localStorage.setItem("journal:pnl-display:1", "dollar");
    renderProvider();
    expect(screen.getByTestId("mode").textContent).toBe("percent");
  });

  it("setMode updates optimistically and persists via the server action", async () => {
    renderProvider();
    act(() => { screen.getByText("D").click(); });
    expect(screen.getByTestId("mode").textContent).toBe("dollar");
    await waitFor(() => expect(mockUpdate).toHaveBeenCalledWith("dollar"));
    expect(window.localStorage.getItem("journal:pnl-display:1")).toBeNull();
  });

  it("reverts the optimistic update when the server action fails", async () => {
    mockUpdate.mockResolvedValue({ error: "write_failed" });
    renderProvider();
    act(() => { screen.getByText("D").click(); });
    expect(screen.getByTestId("mode").textContent).toBe("dollar");
    await waitFor(() => expect(screen.getByTestId("mode").textContent).toBe("percent"));
  });

  it("setRange updates the range scope", () => {
    renderProvider();
    act(() => { screen.getByText("7d").click(); });
    expect(screen.getByTestId("range").textContent).toBe("7");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test -- components/journal/preferences/use-pnl-display.test.tsx`
Expected: FAIL — the "ignores stale localStorage" and "persists via server action" tests fail against the old override behavior.

- [ ] **Step 3: Rewrite the provider**

Replace the contents of `components/journal/preferences/journal-chrome-context.tsx` with:

```tsx
"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";
import type { PnlDisplay } from "@/lib/preferences/server";
import { updatePnlDisplay } from "@/app/dashboard/settings/actions";

export type RangeDays = 7 | 30 | 90 | 0;

interface ChromeState {
  mode: PnlDisplay;
  setMode: (v: PnlDisplay) => void;
  range: RangeDays;
  setRange: (v: RangeDays) => void;
  licenseId: number;
}

const Ctx = createContext<ChromeState | null>(null);

export function JournalChromeProvider({
  licenseId, initialPnlDisplay, initialRangeDays, children,
}: {
  licenseId: number;
  initialPnlDisplay: PnlDisplay;
  initialRangeDays: RangeDays;
  children: React.ReactNode;
}) {
  const [mode, setModeState] = useState<PnlDisplay>(initialPnlDisplay);
  const [range, setRange] = useState<RangeDays>(initialRangeDays);

  // The user_preferences row is the single source of truth, site-wide:
  // update optimistically, persist via the settings server action, revert on
  // failure. (The old per-license localStorage override is gone — stale
  // journal:pnl-display:* keys are simply ignored.)
  const setMode = useCallback((v: PnlDisplay) => {
    if (v === mode) return;
    const prev = mode;
    setModeState(v);
    void updatePnlDisplay(v)
      .then((res) => { if ("error" in res) setModeState(prev); })
      .catch(() => setModeState(prev));
  }, [mode]);

  const value = useMemo<ChromeState>(() => ({
    mode, setMode, range, setRange, licenseId,
  }), [mode, setMode, range, licenseId]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function usePnlDisplay() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("usePnlDisplay must be used inside <JournalChromeProvider>");
  return { mode: ctx.mode, setMode: ctx.setMode };
}

export function useRangeScope() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useRangeScope must be used inside <JournalChromeProvider>");
  return { range: ctx.range, setRange: ctx.setRange };
}
```

(Deleted: `PnlDisplaySource` type, `storageKey()`, the localStorage hydration effect, and `source` — its only consumers were the toolbar badge and the old test.)

- [ ] **Step 4: Update the toolbar**

In `components/journal/journal-toolbar.tsx`, change line 16 from:

```tsx
  const { mode, setMode, source } = usePnlDisplay();
```

to:

```tsx
  const { mode, setMode } = usePnlDisplay();
```

and delete line 27 (the override badge):

```tsx
        {source === "override" && <span className="text-[10px] uppercase tracking-wider text-amber-600 dark:text-amber-400">overridden</span>}
```

- [ ] **Step 5: Run the full test suite and typecheck**

Run: `pnpm exec tsc --noEmit && pnpm test`
Expected: tsc exits 0; all tests PASS (including the rewritten provider tests)

- [ ] **Step 6: Commit**

```bash
git add components/journal/preferences/journal-chrome-context.tsx components/journal/preferences/use-pnl-display.test.tsx components/journal/journal-toolbar.tsx
git commit -m "feat(prefs): make \$/% display mode global-only, persist toolbar toggle to user_preferences"
```

---

## Task 4: Weighted overview data in `getPropFirmOverview`

Add `accountSize` per row and `totalAccountSize` to the overview so the UI can compute weighted percentages (`sum(pnl) / sum(account_size)`). `totalAccountSize` accumulates over exactly the same rows whose `pnl` feeds `totalPnl` (non-breached), so the weighted % denominator matches the numerator.

**Files:**
- Modify: `lib/prop-firm-data.ts`

(No dedicated unit test: `getPropFirmOverview` is Supabase-bound and this repo's lib tests cover pure functions. The new fields' display behavior is test-driven in Tasks 5–6.)

- [ ] **Step 1: Add the fields**

In `lib/prop-firm-data.ts`, add to the `PropFirmRow` interface (after `pnl: number;`):

```ts
  /** rule.account_size, null when the subscription has no rule assigned. */
  accountSize: number | null;
```

Add to the `PropFirmOverview` interface (after `totalPnl: number;`):

```ts
  /** Sum of account_size over the non-breached rows included in totalPnl. */
  totalAccountSize: number;
```

- [ ] **Step 2: Accumulate and populate**

In `getPropFirmOverview`, update the empty-input return (line 43) to:

```ts
    return { rows: [], totalPnl: 0, totalAccountSize: 0, avgWinRate: 0, activeCount: 0, fundedCount: 0 };
```

After `let totalPnl = 0;` (line 54), add:

```ts
  let totalAccountSize = 0;
```

Replace `if (status !== "breached") totalPnl += pnl;` (line 109) with:

```ts
    if (status !== "breached") {
      totalPnl += pnl;
      totalAccountSize += rule?.account_size ?? 0;
    }
```

In the `rows.push({...})` call, add after `pnl,`:

```ts
      accountSize: rule?.account_size ?? null,
```

Update the final return (line 131) to:

```ts
  return { rows, totalPnl, totalAccountSize, avgWinRate: 0, activeCount, fundedCount };
```

- [ ] **Step 3: Typecheck**

Run: `pnpm exec tsc --noEmit`
Expected: exits 0 (the strip/table don't consume the new fields yet)

- [ ] **Step 4: Commit**

```bash
git add lib/prop-firm-data.ts
git commit -m "feat(prop-firms): expose accountSize per row + weighted totalAccountSize in overview"
```

---

## Task 5: `PropFirmSummaryStrip` respects the $/% mode

`fmtPctOrCash(cash, mode, baseline, currency)` already implements "percent when mode=percent and baseline>0, else cash" — reuse it with `totalAccountSize` as the baseline. This gives the weighted % and the zero-denominator cash fallback for free.

**Files:**
- Modify: `components/prop-firms/prop-firm-summary-strip.tsx`
- Test: `components/prop-firms/prop-firm-summary-strip.test.tsx` (create)

- [ ] **Step 1: Write the failing test**

Create `components/prop-firms/prop-firm-summary-strip.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { PropFirmSummaryStrip } from "./prop-firm-summary-strip";
import type { PropFirmOverview } from "@/lib/prop-firm-data";

function overview(partial: Partial<PropFirmOverview> = {}): PropFirmOverview {
  return {
    rows: [],
    totalPnl: -302.27,
    totalAccountSize: 10_000,
    avgWinRate: 0,
    activeCount: 1,
    fundedCount: 0,
    ...partial,
  };
}

describe("PropFirmSummaryStrip", () => {
  it("shows Total P&L as weighted percent in percent mode", () => {
    render(<PropFirmSummaryStrip data={overview()} mode="percent" />);
    expect(screen.getByText("−3.02%")).toBeInTheDocument(); // -302.27 / 10000
  });

  it("shows Total P&L as cash in dollar mode", () => {
    render(<PropFirmSummaryStrip data={overview()} mode="dollar" />);
    expect(screen.getByText("-$302.27")).toBeInTheDocument();
  });

  it("falls back to cash in percent mode when totalAccountSize is 0", () => {
    render(<PropFirmSummaryStrip data={overview({ totalAccountSize: 0 })} mode="percent" />);
    expect(screen.getByText("-$302.27")).toBeInTheDocument();
  });
});
```

(The `−` in `−3.02%` is the minus-sign character `fmtPct` emits — copy it from `lib/journal/format-pnl.ts:1`, not the ASCII hyphen.)

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test -- components/prop-firms/prop-firm-summary-strip.test.tsx`
Expected: FAIL — the component doesn't accept a `mode` prop yet (TS error / `-$302.27` rendered in percent test)

- [ ] **Step 3: Update the component** (invoke frontend-design first — header note)

Replace the contents of `components/prop-firms/prop-firm-summary-strip.tsx` with:

```tsx
import { KpiCard } from "@/components/journal/kpi-card";
import { fmtPctOrCash, type PnlDisplay } from "@/lib/journal/format-pnl";
import type { PropFirmOverview } from "@/lib/prop-firm-data";

export function PropFirmSummaryStrip({ data, mode }: { data: PropFirmOverview; mode: PnlDisplay }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <KpiCard
        label="Total P&L"
        tone={data.totalPnl > 0 ? "positive" : data.totalPnl < 0 ? "negative" : "neutral"}
        value={fmtPctOrCash(data.totalPnl, mode, data.totalAccountSize, "USD")}
        sub="active + funded accounts"
      />
      <KpiCard label="Avg Win Rate" value="—" sub="across active accounts" />
      <KpiCard label="Active" value={String(data.activeCount)} sub="on track + watch" />
      <KpiCard label="Funded" value={String(data.fundedCount)} sub="funded accounts" tone={data.fundedCount > 0 ? "positive" : "neutral"} />
    </div>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test -- components/prop-firms/prop-firm-summary-strip.test.tsx`
Expected: PASS (3 tests). Note: `app/dashboard/prop-firms/page.tsx` now has a TS error (missing `mode` prop) — fixed in Task 7; `pnpm exec tsc --noEmit` is expected to fail until then.

- [ ] **Step 5: Commit**

```bash
git add components/prop-firms/prop-firm-summary-strip.tsx components/prop-firms/prop-firm-summary-strip.test.tsx
git commit -m "feat(prop-firms): Total P&L card shows weighted % in percent mode"
```

---

## Task 6: `PropFirmTable` P&L column respects the $/% mode

Per-row percent = `pnl / accountSize`; rows without a rule (`accountSize` null) fall back to cash via the same `fmtPctOrCash` baseline guard.

**Files:**
- Modify: `components/prop-firms/prop-firm-table.tsx`
- Test: `components/prop-firms/prop-firm-table.test.tsx` (create)

- [ ] **Step 1: Write the failing test**

Create `components/prop-firms/prop-firm-table.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { PropFirmTable } from "./prop-firm-table";
import type { PropFirmRow } from "@/lib/prop-firm-data";

function row(partial: Partial<PropFirmRow> = {}): PropFirmRow {
  return {
    licenseId: 18,
    mt5Account: 531290109,
    name: "FTMO Phase 2 - 10k",
    product: "ctx-prop-passer",
    productDisplay: "CTX Prop Passer",
    status: "on_track",
    pnl: -302.27,
    accountSize: 10_000,
    drawdownPct: 3.0,
    profitProgressPct: 0,
    tradingDays: 24,
    maxTradingDays: null,
    minTradingDays: 4,
    currency: "USD",
    ...partial,
  };
}

describe("PropFirmTable", () => {
  it("shows P&L as percent of account size in percent mode", () => {
    render(<PropFirmTable rows={[row()]} mode="percent" />);
    expect(screen.getByText("−3.02%")).toBeInTheDocument();
  });

  it("shows P&L as cash in dollar mode", () => {
    render(<PropFirmTable rows={[row()]} mode="dollar" />);
    expect(screen.getByText("-$302.27")).toBeInTheDocument();
  });

  it("falls back to cash in percent mode when the row has no account size", () => {
    render(<PropFirmTable rows={[row({ accountSize: null })]} mode="percent" />);
    expect(screen.getByText("-$302.27")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test -- components/prop-firms/prop-firm-table.test.tsx`
Expected: FAIL — no `mode` prop / cash rendered in percent test

- [ ] **Step 3: Update the component** (invoke frontend-design first — header note)

In `components/prop-firms/prop-firm-table.tsx`:

Change the import on line 4 from:

```tsx
import { fmtCash } from "@/lib/journal/format-pnl";
```

to:

```tsx
import { fmtPctOrCash, type PnlDisplay } from "@/lib/journal/format-pnl";
```

Change the signature on line 22 from:

```tsx
export function PropFirmTable({ rows }: { rows: PropFirmRow[] }) {
```

to:

```tsx
export function PropFirmTable({ rows, mode }: { rows: PropFirmRow[]; mode: PnlDisplay }) {
```

Change the P&L cell body on line 73 from:

```tsx
                {fmtCash(row.pnl, row.currency)}
```

to:

```tsx
                {fmtPctOrCash(row.pnl, mode, row.accountSize ?? 0, row.currency)}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test -- components/prop-firms/prop-firm-table.test.tsx`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add components/prop-firms/prop-firm-table.tsx components/prop-firms/prop-firm-table.test.tsx
git commit -m "feat(prop-firms): P&L column follows \$/% display mode"
```

---

## Task 7: Prop Firms page fetches and passes the mode

**Files:**
- Modify: `app/dashboard/prop-firms/page.tsx`

- [ ] **Step 1: Update the page**

Replace the contents of `app/dashboard/prop-firms/page.tsx` with:

```tsx
import { redirect } from "next/navigation";
import { getSupabaseSSR } from "@/lib/supabase/ssr";
import { getPropFirmOverview } from "@/lib/prop-firm-data";
import { getPnlDisplay } from "@/lib/preferences/server";
import { PropFirmSummaryStrip } from "@/components/prop-firms/prop-firm-summary-strip";
import { PropFirmTable } from "@/components/prop-firms/prop-firm-table";

export const dynamic = "force-dynamic";

export default async function PropFirmsPage() {
  const sb = await getSupabaseSSR();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect("/login");

  const [data, mode] = await Promise.all([
    getPropFirmOverview(user.id),
    getPnlDisplay(user.id),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Prop Firms</h1>
        <p className="text-sm text-muted-foreground">
          {data.activeCount} active · {data.fundedCount} funded
        </p>
      </div>
      <PropFirmSummaryStrip data={data} mode={mode} />
      <PropFirmTable rows={data.rows} mode={mode} />
    </div>
  );
}
```

- [ ] **Step 2: Typecheck and run all tests**

Run: `pnpm exec tsc --noEmit && pnpm test`
Expected: tsc exits 0 (the Task 5 prop error is now resolved); all tests PASS

- [ ] **Step 3: Commit**

```bash
git add app/dashboard/prop-firms/page.tsx
git commit -m "feat(prop-firms): apply global \$/% display mode to overview page"
```

---

## Task 8: Export shared table primitives

The day modal reuses `Th` (sortable header) and `computePips` from the trades table, and the day-keying function from the calendar aggregate — export them instead of duplicating.

**Files:**
- Modify: `components/journal/tables/trades-table.tsx:135,141`
- Modify: `lib/journal/calendar-aggregate.ts:11`

- [ ] **Step 1: Export the helpers**

In `components/journal/tables/trades-table.tsx`, change line 135 from `function computePips(d: Deal): number {` to:

```tsx
export function computePips(d: Deal): number {
```

and line 141 from `function Th({ sortKey, state, num, onClick, children }: {` to:

```tsx
export function Th({ sortKey, state, num, onClick, children }: {
```

In `lib/journal/calendar-aggregate.ts`, change line 11 from `function utcDateKey(iso: string): string {` to:

```ts
export function utcDateKey(iso: string): string {
```

- [ ] **Step 2: Verify nothing broke**

Run: `pnpm exec tsc --noEmit && pnpm test`
Expected: tsc exits 0; all tests PASS

- [ ] **Step 3: Commit**

```bash
git add components/journal/tables/trades-table.tsx lib/journal/calendar-aggregate.ts
git commit -m "refactor(journal): export Th, computePips, utcDateKey for reuse"
```

---

## Task 9: `DayTradesModal` component

Radix Dialog wrapping a slim trades table: search (ticket/symbol), sortable columns, pagination (default 10/page, ascending close time), header summary matching the calendar cell, "Open in Journal" footer link. No outcome/side filter chips.

**Files:**
- Create: `components/journal/day-trades-modal.tsx`
- Test: `components/journal/day-trades-modal.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `components/journal/day-trades-modal.test.tsx`:

```tsx
import { render, screen, fireEvent } from "@testing-library/react";
import { JournalChromeProvider } from "@/components/journal/preferences/journal-chrome-context";
import { DayTradesModal } from "./day-trades-modal";
import type { Deal } from "@/lib/types";

jest.mock("@/app/dashboard/settings/actions", () => ({
  updatePnlDisplay: jest.fn().mockResolvedValue({ ok: true }),
}));

function deal(partial: Partial<Deal> = {}): Deal {
  return {
    mt5_account: 531290109,
    ticket: 1001,
    ea_source: "ctx-prop-passer",
    symbol: "GBPUSD",
    side: "buy",
    volume: 0.5,
    open_price: 1.265,
    close_price: 1.267,
    sl: null,
    tp: null,
    open_time: "2026-06-01T08:00:00Z",
    close_time: "2026-06-01T09:30:00Z",
    profit: -148,
    commission: -2,
    swap: 0,
    comment: null,
    magic: null,
    ...partial,
  };
}

function renderModal(deals: Deal[], onClose = jest.fn()) {
  render(
    <JournalChromeProvider licenseId={18} initialPnlDisplay="dollar" initialRangeDays={30}>
      <DayTradesModal
        date="2026-06-01"
        deals={deals}
        currency="USD"
        baseline={10_000}
        journalHref="/dashboard/18/journal#trades?date=2026-06-01"
        onClose={onClose}
      />
    </JournalChromeProvider>,
  );
  return onClose;
}

describe("DayTradesModal", () => {
  it("renders the day header with trade count, net P&L, and W/L split", () => {
    renderModal([deal(), deal({ ticket: 1002, profit: 200 })]);
    expect(screen.getByText("Mon, Jun 1 2026")).toBeInTheDocument();
    expect(screen.getByText(/2 trades/)).toBeInTheDocument();
    expect(screen.getByText(/1W \/ 1L/)).toBeInTheDocument();
  });

  it("lists the day's trades", () => {
    renderModal([deal(), deal({ ticket: 1002, symbol: "EURUSD" })]);
    expect(screen.getByText("GBPUSD")).toBeInTheDocument();
    expect(screen.getByText("EURUSD")).toBeInTheDocument();
  });

  it("search filters rows by symbol", () => {
    renderModal([deal(), deal({ ticket: 1002, symbol: "EURUSD" })]);
    fireEvent.change(screen.getByPlaceholderText("Search ticket, symbol…"), { target: { value: "EUR" } });
    expect(screen.queryByText("GBPUSD")).not.toBeInTheDocument();
    expect(screen.getByText("EURUSD")).toBeInTheDocument();
  });

  it("shows the empty state when no trades match the search", () => {
    renderModal([deal()]);
    fireEvent.change(screen.getByPlaceholderText("Search ticket, symbol…"), { target: { value: "XAU" } });
    expect(screen.getByText("No trades match.")).toBeInTheDocument();
  });

  it("renders the Open in Journal footer link and closes on click", () => {
    const onClose = renderModal([deal()]);
    const link = screen.getByText("Open in Journal →");
    expect(link).toHaveAttribute("href", "/dashboard/18/journal#trades?date=2026-06-01");
    fireEvent.click(link);
    expect(onClose).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test -- components/journal/day-trades-modal.test.tsx`
Expected: FAIL — `Cannot find module './day-trades-modal'`

- [ ] **Step 3: Write the component** (invoke frontend-design first — header note)

Create `components/journal/day-trades-modal.tsx`:

```tsx
"use client";

import { useMemo } from "react";
import { format, parseISO } from "date-fns";
import type { Deal } from "@/lib/types";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { applyTradeFilters } from "@/lib/journal/trade-filters";
import { fmtCash, fmtPctOrCash } from "@/lib/journal/format-pnl";
import { useTableState, type SortValue } from "@/components/journal/filters/use-table-state";
import { FilterSearch } from "@/components/journal/filters/filter-search";
import { Pagination } from "@/components/journal/filters/pagination";
import { Th, computePips } from "@/components/journal/tables/trades-table";
import { SidePill } from "@/components/journal/tables/side-pill";
import { usePnlDisplay } from "@/components/journal/preferences/journal-chrome-context";
import { cn } from "@/lib/utils";

interface Props {
  /** YYYY-MM-DD (UTC) — the clicked calendar day. */
  date: string;
  /** Deals already filtered to `date` by the caller (utcDateKey on close_time). */
  deals: Deal[];
  currency: string;
  baseline: number;
  /** Target for the "Open in Journal" footer link. */
  journalHref: string;
  onClose: () => void;
}

export function DayTradesModal({ date, deals, currency, baseline, journalHref, onClose }: Props) {
  const { mode } = usePnlDisplay();
  // Ascending close time: read the day chronologically (journal default is desc).
  const { state, setSort, setPage, setSize, setSearch } =
    useTableState({ defaultSort: "closed_asc" as SortValue, defaultSize: 10 });

  const result = useMemo(() => applyTradeFilters(deals, state), [deals, state]);

  const dayNet = useMemo(() => deals.reduce((a, d) => a + d.profit, 0), [deals]);
  const wins = deals.filter((d) => d.profit > 0).length;
  const losses = deals.filter((d) => d.profit < 0).length;

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{format(parseISO(date), "EEE, MMM d yyyy")}</DialogTitle>
          <DialogDescription className="tabular-nums">
            {deals.length} trade{deals.length === 1 ? "" : "s"} · net{" "}
            <span className={cn("font-semibold",
              dayNet > 0 && "text-emerald-600 dark:text-emerald-400",
              dayNet < 0 && "text-red-600 dark:text-red-400")}>
              {fmtPctOrCash(dayNet, mode, baseline, currency)}
            </span>
            {" "}· {wins}W / {losses}L
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center justify-end">
          <FilterSearch value={state.search} onChange={setSearch} placeholder="Search ticket, symbol…" />
        </div>

        <div className="max-h-[55vh] overflow-y-auto overflow-x-auto">
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
                  <div className="my-4 rounded-lg border border-dashed py-8 text-center text-sm text-muted-foreground">
                    No trades match.
                  </div>
                </td></tr>
              ) : result.rows.map((d) => {
                const pips = computePips(d);
                return (
                  <tr key={d.ticket} className="border-b hover:bg-muted/40">
                    <td className="px-2 py-2 text-xs tabular-nums">{format(parseISO(d.close_time), "HH:mm:ss")}</td>
                    <td className="px-2 py-2 font-semibold">{d.symbol}</td>
                    <td className="px-2 py-2"><SidePill variant={d.side}>{d.side}</SidePill></td>
                    <td className="px-2 py-2 text-right tabular-nums">{d.volume.toFixed(2)}</td>
                    <td className="px-2 py-2 text-right tabular-nums">{d.open_price.toFixed(5)}</td>
                    <td className="px-2 py-2 text-right tabular-nums">{d.close_price.toFixed(5)}</td>
                    <td className={cn("px-2 py-2 text-right tabular-nums",
                      pips > 0 ? "text-emerald-600 dark:text-emerald-400" : pips < 0 ? "text-red-600 dark:text-red-400" : "")}>
                      {pips > 0 ? "+" : ""}{pips.toFixed(1)}
                    </td>
                    <td className="px-2 py-2 text-right" title={`${fmtCash(d.profit, currency)} cash`}>
                      <span className={cn("tabular-nums font-semibold",
                        d.profit > 0 ? "text-emerald-600 dark:text-emerald-400" : d.profit < 0 ? "text-red-600 dark:text-red-400" : "")}>
                        {fmtPctOrCash(d.profit, mode, baseline, currency)}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <Pagination total={result.total} page={state.page} pageSize={state.size}
          pageSizeOptions={[10, 25, 50]} onPageChange={setPage} onPageSizeChange={setSize} />

        <div className="flex items-center justify-between border-t pt-3">
          <a
            href={journalHref}
            onClick={onClose}
            className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
          >
            Open in Journal →
          </a>
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test -- components/journal/day-trades-modal.test.tsx`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add components/journal/day-trades-modal.tsx components/journal/day-trades-modal.test.tsx
git commit -m "feat(journal): add day-trades modal with search, sort, and pagination"
```

---

## Task 10: Wire the modal into the calendar

Day click sets local state instead of the URL hash; zero-trade days are already no-ops (`TradeCalendar` disables cell buttons without trades, `trade-calendar.tsx:110`). The day's deals are filtered with `utcDateKey` — the same keying `aggregateCalendar` uses — so the modal always matches the cell count. The legend copy is updated to match the new behavior.

**Files:**
- Modify: `components/journal/tabs/calendar-tab.tsx` (rewrite)
- Modify: `app/dashboard/[id]/calendar/page.tsx` (pass `licenseId`)
- Modify: `components/journal/trade-calendar.tsx:156` (legend copy)
- Test: `components/journal/tabs/calendar-tab.test.tsx` (create)

- [ ] **Step 1: Write the failing test**

Create `components/journal/tabs/calendar-tab.test.tsx`:

```tsx
import { render, screen, fireEvent } from "@testing-library/react";
import { JournalChromeProvider } from "@/components/journal/preferences/journal-chrome-context";
import { CalendarTab } from "./calendar-tab";
import type { Deal } from "@/lib/types";

jest.mock("@/app/dashboard/settings/actions", () => ({
  updatePnlDisplay: jest.fn().mockResolvedValue({ ok: true }),
}));

// Local noon today: the UTC date slice matches the locally-rendered calendar
// cell for any timezone offset < 12h, keeping the test deterministic.
const NOON_TODAY = new Date(new Date().setHours(12, 0, 0, 0)).toISOString();

function deal(partial: Partial<Deal> = {}): Deal {
  return {
    mt5_account: 531290109,
    ticket: 1001,
    ea_source: "ctx-prop-passer",
    symbol: "GBPUSD",
    side: "buy",
    volume: 0.5,
    open_price: 1.265,
    close_price: 1.267,
    sl: null,
    tp: null,
    open_time: NOON_TODAY,
    close_time: NOON_TODAY,
    profit: -148,
    commission: -2,
    swap: 0,
    comment: null,
    magic: null,
    ...partial,
  };
}

function renderTab(deals: Deal[]) {
  render(
    <JournalChromeProvider licenseId={18} initialPnlDisplay="dollar" initialRangeDays={30}>
      <CalendarTab deals={deals} currency="USD" baseline={10_000} licenseId={18} />
    </JournalChromeProvider>,
  );
}

describe("CalendarTab", () => {
  it("opens the day modal when a day with trades is clicked", () => {
    renderTab([deal()]);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    fireEvent.click(screen.getByText("1 trade"));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("GBPUSD")).toBeInTheDocument();
  });

  it("closes the modal on Escape", () => {
    renderTab([deal()]);
    fireEvent.click(screen.getByText("1 trade"));
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test -- components/journal/tabs/calendar-tab.test.tsx`
Expected: FAIL — `CalendarTab` has no `licenseId` prop and no modal (no `dialog` role appears)

- [ ] **Step 3: Rewrite `CalendarTab`** (invoke frontend-design first — header note)

Replace the contents of `components/journal/tabs/calendar-tab.tsx` with:

```tsx
"use client";

import { useMemo, useState } from "react";
import { TradeCalendar } from "../trade-calendar";
import { DayTradesModal } from "../day-trades-modal";
import { utcDateKey } from "@/lib/journal/calendar-aggregate";
import type { Deal } from "@/lib/types";

export function CalendarTab({ deals, currency, baseline, licenseId }: {
  deals: Deal[]; currency: string; baseline: number; licenseId: number;
}) {
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  // Same keying as aggregateCalendar — the modal always matches the cell count.
  const dayDeals = useMemo(
    () => (selectedDate ? deals.filter((d) => utcDateKey(d.close_time) === selectedDate) : []),
    [deals, selectedDate],
  );

  return (
    <>
      <TradeCalendar deals={deals} currency={currency} baseline={baseline} onDayClick={setSelectedDate} />
      {selectedDate && (
        <DayTradesModal
          key={selectedDate}            // fresh table state (search/sort/page) per day
          date={selectedDate}
          deals={dayDeals}
          currency={currency}
          baseline={baseline}
          journalHref={`/dashboard/${licenseId}/journal#trades?date=${selectedDate}`}
          onClose={() => setSelectedDate(null)}
        />
      )}
    </>
  );
}
```

- [ ] **Step 4: Pass `licenseId` from the calendar page**

Replace the contents of `app/dashboard/[id]/calendar/page.tsx` with:

```tsx
"use client";

import { useAccountContext } from "@/lib/hooks/use-account-context";
import { CalendarTab } from "@/components/journal/tabs/calendar-tab";

export default function CalendarPage() {
  const { deals, currency, baseline, license } = useAccountContext();
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Calendar</h1>
      <CalendarTab deals={deals} currency={currency} baseline={baseline.baseline} licenseId={license.id} />
    </div>
  );
}
```

- [ ] **Step 5: Update the legend copy**

In `components/journal/trade-calendar.tsx` line 156, change:

```tsx
        {onDayClick && <span className="ml-auto">Click a day to filter Trades →</span>}
```

to:

```tsx
        {onDayClick && <span className="ml-auto">Click a day to view its trades →</span>}
```

- [ ] **Step 6: Run the test to verify it passes, then the full suite**

Run: `pnpm test -- components/journal/tabs/calendar-tab.test.tsx`
Expected: PASS (2 tests)

Run: `pnpm exec tsc --noEmit && pnpm test`
Expected: tsc exits 0; all tests PASS

- [ ] **Step 7: Commit**

```bash
git add components/journal/tabs/calendar-tab.tsx components/journal/tabs/calendar-tab.test.tsx app/dashboard/\[id\]/calendar/page.tsx components/journal/trade-calendar.tsx
git commit -m "feat(calendar): open day-trades modal on day click"
```

---

## Task 11: Full verification

- [ ] **Step 1: Run the complete check suite**

Run: `pnpm exec tsc --noEmit && pnpm lint && pnpm test && pnpm build`
Expected: all four exit 0. If anything fails, fix it before proceeding (use superpowers:systematic-debugging for non-obvious failures).

- [ ] **Step 2: Manual QA against the dev server**

Run: `pnpm dev`, then verify in the browser:

1. `/dashboard/<id>` for the FTMO challenge account: a **Drawdown** card appears under Equity showing the same % as the Prop Firms page row (e.g. `−3.02%` in % mode, `-$302.27` with `limit -$1,000.00` sub in $ mode).
2. `/dashboard/settings`: flip the preference to `$` → the dashboard, journal, calendar, **and** `/dashboard/prop-firms` (Total P&L card + P&L column) all show cash after reload/navigation. Flip back to `%` → all show percent (Total P&L = weighted `sum(pnl)/sum(account_size)`).
3. Journal toolbar `%/$` segment: toggling it persists — navigate to `/dashboard/prop-firms` and confirm it followed; no "overridden" badge appears anywhere.
4. `/dashboard/<id>/calendar`: click the day with trades → modal opens with that day's trades, count matching the cell; search, column sort, and pagination work; "Open in Journal →" navigates to the journal; empty days do nothing; Esc/overlay closes.

- [ ] **Step 3: Wrap up**

Use superpowers:verification-before-completion, then superpowers:finishing-a-development-branch to merge/PR. After shipping, remind the user to run `/update-kb` to sync the vault.
