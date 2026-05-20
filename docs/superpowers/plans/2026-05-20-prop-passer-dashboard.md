# Prop Passer Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the three KPI cards above the journal tabs with a product-aware variant — only for `ctx-prop-passer` licenses — that lead with Challenge Progress, Equity (with from-start delta), and the tighter Loss Buffer. All other products keep the current Net Return / Equity / Max Drawdown cards.

**Architecture:** Pure presentational change driven by `license.product`. Two new files (`lib/journal/passer-progress.ts` for formatting math + tone, `components/journal/passer-headline-cards.tsx` for the React surface). `LiveAccountPanel` branches on product; `KpiCard` gains an additive `progressBar` slot and `subTone` for the subline color. `OverviewTab` drops `ChallengeMini` for Prop Passer and goes full-width on the hero.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Tailwind v4, Jest 29 + jest-environment-jsdom, React Testing Library.

**Spec:** `docs/superpowers/specs/2026-05-20-prop-passer-dashboard-design.md`

---

## File Structure

**Create:**
- `lib/journal/passer-progress.ts` — pure functions: compute progress %, pick tighter buffer, tone thresholds, build the three card payloads.
- `lib/journal/passer-progress.test.ts` — Jest tests for every payload + tone threshold + empty state.
- `components/journal/passer-headline-cards.tsx` — the React component that renders the three Prop Passer cards.
- `components/journal/passer-headline-cards.test.tsx` — RTL smoke tests for the four scenarios.

**Modify:**
- `components/journal/kpi-card.tsx` — add `progressBar` slot, `subTone` for subline color.
- `components/journal/live-account-panel.tsx` — accept `product` + `rule`, branch on `ctx-prop-passer`.
- `components/journal/journal-shell.tsx` — wire `license.product` and `props.rule` through to `LiveAccountPanel`.
- `components/journal/tabs/overview-tab.tsx` — drop `ChallengeMini` and go full-width for Prop Passer.

**Untouched (sanity boundary):** `lib/journal/objectives.ts`, `lib/journal/baseline.ts`, `lib/journal/trade-equity.ts`, `lib/journal/format-pnl.ts`, all other tabs.

---

## Task 1: Extend `KpiCard` with `progressBar` and `subTone`

**Files:**
- Modify: `components/journal/kpi-card.tsx`

- [ ] **Step 1: Read the existing file**

Read `components/journal/kpi-card.tsx` to confirm the current shape before editing.

- [ ] **Step 2: Apply the edit**

Replace the file's contents with:

```tsx
// components/journal/kpi-card.tsx
import { cn } from "@/lib/utils";
import { Sparkline, type SparklineTone } from "./sparkline";

export type CardTone = "positive" | "negative" | "neutral" | "warn" | "danger";

export interface KpiProgressBar {
  /** 0-100 visible fill. Caller clamps. */
  fill: number;
  tone: "ok" | "warn" | "bad" | "neutral";
}

interface Props {
  label: React.ReactNode;
  value: React.ReactNode;
  sub?: React.ReactNode;
  tone?: CardTone;
  /** Optional tone applied to the sub line only (independent of `tone`). */
  subTone?: "positive" | "negative" | "neutral";
  series?: number[];
  seriesTone?: SparklineTone;
  /** Inline progress bar rendered below `sub`. */
  progressBar?: KpiProgressBar;
  className?: string;
  featured?: boolean;
  /** Browser-native tooltip text shown when hovering the card. */
  tooltip?: string;
  /** Dashed border + muted treatment for empty/unconfigured cards. */
  empty?: boolean;
}

const VALUE_TONE: Record<CardTone, string> = {
  positive: "text-emerald-600 dark:text-emerald-400",
  negative: "text-red-600 dark:text-red-400",
  neutral:  "text-foreground",
  warn:     "text-amber-600 dark:text-amber-400",
  danger:   "text-red-600 dark:text-red-400",
};

const SUB_TONE = {
  positive: "text-emerald-600 dark:text-emerald-400",
  negative: "text-red-600 dark:text-red-400",
  neutral:  "text-muted-foreground",
} as const;

const BAR_TONE = {
  ok:      "bg-emerald-500",
  warn:    "bg-amber-500",
  bad:     "bg-red-500",
  neutral: "bg-foreground/40",
} as const;

export function KpiCard({
  label, value, sub, tone = "neutral", subTone, series, seriesTone,
  progressBar, className, featured, tooltip, empty,
}: Props) {
  const hasStrip = Array.isArray(series) && series.length >= 2;
  const subClass = subTone ? SUB_TONE[subTone] : "text-muted-foreground";
  return (
    <div
      title={tooltip}
      data-tone={tone}
      data-empty={empty ? "true" : undefined}
      className={cn(
        "flex flex-col overflow-hidden rounded-xl border bg-card",
        featured && "bg-gradient-to-br from-muted/40 to-card",
        empty && "border-dashed bg-muted/20",
        className,
      )}
    >
      <div className="px-4 py-3">
        <div className="text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</div>
        <div className={cn("mt-1 text-[22px] font-bold leading-tight tracking-tight tabular-nums", VALUE_TONE[tone])}>
          {value}
        </div>
        {sub != null && <div className={cn("mt-1 text-xs", subClass)}>{sub}</div>}
        {progressBar && (
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
            <div
              className={cn("h-full", BAR_TONE[progressBar.tone])}
              style={{ width: `${Math.max(0, Math.min(100, progressBar.fill))}%` }}
            />
          </div>
        )}
      </div>
      {hasStrip && (
        <div className="border-t border-border/60 bg-gradient-to-b from-transparent to-muted/30">
          <Sparkline values={series} tone={seriesTone ?? (tone === "warn" || tone === "danger" ? "negative" : tone === "neutral" ? "neutral" : tone)} height={44} />
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Run the existing journal tests to confirm nothing regressed**

Run: `npx jest components/journal --silent`
Expected: PASS (the new props are optional; existing callers unchanged).

- [ ] **Step 4: Commit**

```bash
git add components/journal/kpi-card.tsx
git commit -m "feat(journal): extend KpiCard with progressBar and subTone

Prepare KpiCard for the upcoming Prop Passer headline row — additive
slots, no behavior change for existing callers."
```

---

## Task 2: Write failing tests for `buildPasserCards`

**Files:**
- Create: `lib/journal/passer-progress.test.ts`

- [ ] **Step 1: Author the test file**

Create `lib/journal/passer-progress.test.ts`:

```ts
import { buildPasserCards } from "./passer-progress";
import { evaluateObjectives } from "./objectives";
import type { AccountSnapshotCurrent, AccountSnapshotDaily, PropfirmRule } from "@/lib/types";

const RULE: PropfirmRule = {
  id: 1, name: "10k Phase 1",
  account_size: 10_000,
  max_daily_loss: 5,
  daily_loss_type: "percent",
  daily_loss_calc: "balance",
  max_total_loss: 10,
  total_loss_type: "percent",
  profit_target: 10,
  target_type: "percent",
  min_trading_days: 4,
  max_trading_days: 30,
  created_at: "2026-04-01T00:00:00Z",
};

const SNAP = (over: Partial<AccountSnapshotCurrent> = {}): AccountSnapshotCurrent => ({
  mt5_account: 1, balance: 10_000, equity: 10_000, margin: 0, free_margin: 10_000,
  margin_level: null, floating_pnl: 0, drawdown_pct: 0, leverage: 30, currency: "USD",
  server: null, pushed_at: "2026-05-20T12:00:00Z", ...over,
});

const DAILY = (date: string, balance_close: number, daily_pnl = 0): AccountSnapshotDaily => ({
  mt5_account: 1, trade_date: date, balance_close,
  equity_close: balance_close, daily_pnl,
});

const objectives = (snap: AccountSnapshotCurrent, daily: AccountSnapshotDaily[], todayUtc = "2026-05-20") =>
  evaluateObjectives({ rule: RULE, currentSnapshot: snap, dailySnapshots: daily, todayUtc });

describe("buildPasserCards", () => {
  it("winning account: green progress, full buffer, positive equity subline", () => {
    const snap = SNAP({ balance: 10_307, equity: 10_307 });
    const daily = [DAILY("2026-05-19", 10_307, 307)];
    const o = objectives(snap, daily);

    const r = buildPasserCards(o, snap, 10_000, "USD", "percent", 10);

    expect(r.progress.value).toBe("+30.7%");
    expect(r.progress.tone).toBe("positive");
    expect(r.progress.progressBar?.fill).toBeCloseTo(30.7, 1);
    expect(r.progress.progressBar?.tone).toBe("ok");

    expect(r.equity.value).toBe("$10,307.00");
    expect(r.equity.subTone).toBe("positive");
    expect(r.equity.sub).toContain("Up");

    expect(r.buffer.value).toBe("100% left");
    expect(r.buffer.tone).toBe("positive");
    expect(r.buffer.label).toContain("daily");
  });

  it("breakeven band: |progress| <= 0.5% reads neutral", () => {
    const snap = SNAP({ balance: 10_040, equity: 10_040 });
    const daily = [DAILY("2026-05-19", 10_040, 40)];
    const o = objectives(snap, daily);

    const r = buildPasserCards(o, snap, 10_000, "USD", "percent", 10);

    expect(r.progress.value).toBe("0.4% · breakeven");
    expect(r.progress.tone).toBe("neutral");
  });

  it("negative progress: red, signed value, $-to-target uses absolute distance", () => {
    const snap = SNAP({ balance: 9_350, equity: 9_350 });
    const today = "2026-05-20";
    const daily = [
      DAILY("2026-05-19", 9_770, -230),
      DAILY(today, 9_350, -420),
    ];
    const o = objectives(snap, daily, today);

    const r = buildPasserCards(o, snap, 10_000, "USD", "percent", 10);

    expect(r.progress.value).toBe("−6.5%");
    expect(r.progress.tone).toBe("negative");
    expect(r.progress.sub).toContain("$1,650.00 to target");
  });

  it("near-breach: buffer headline reads from the tighter (daily) limit", () => {
    const snap = SNAP({ balance: 9_350, equity: 9_350 });
    const today = "2026-05-20";
    const daily = [
      DAILY("2026-05-19", 9_770, -230),
      DAILY(today, 9_350, -420),
    ];
    const o = objectives(snap, daily, today);

    const r = buildPasserCards(o, snap, 10_000, "USD", "percent", 10);

    // dailyLossThreshold = 5% of 9770 = 488.5; dailyLossAbs = 420 -> buffer ~14%
    // totalLossThreshold = 10% of 10000 = 1000; totalDrawdown = 650 -> buffer 35%
    expect(r.buffer.label).toContain("daily");
    expect(r.buffer.value).toBe("14% left");
    expect(r.buffer.tone).toBe("negative");
    expect(r.buffer.progressBar?.tone).toBe("bad");
  });

  it("buffer tone thresholds: green >= 40, amber 20-40, red < 20", () => {
    const cases = [
      { todaysLoss: 50,  expectedTone: "positive" as const, expectedFill: 90 },
      { todaysLoss: 350, expectedTone: "warn"     as const, expectedFill: 30 },
      { todaysLoss: 450, expectedTone: "negative" as const, expectedFill: 10 },
    ];
    for (const c of cases) {
      const snap = SNAP({ balance: 10_000 - c.todaysLoss, equity: 10_000 - c.todaysLoss });
      const today = "2026-05-20";
      const daily = [DAILY("2026-05-19", 10_000, 0), DAILY(today, 10_000 - c.todaysLoss, -c.todaysLoss)];
      const o = objectives(snap, daily, today);
      const r = buildPasserCards(o, snap, 10_000, "USD", "percent", 10);
      expect(r.buffer.tone).toBe(c.expectedTone);
      expect(r.buffer.progressBar?.fill).toBeCloseTo(c.expectedFill, 0);
    }
  });

  it("dollar mode flips headlines: Card 1 shows $/target, Card 3 shows $-of-$", () => {
    const snap = SNAP({ balance: 10_307, equity: 10_307 });
    const daily = [DAILY("2026-05-19", 10_307, 307)];
    const o = objectives(snap, daily);

    const r = buildPasserCards(o, snap, 10_000, "USD", "cash", 10);

    expect(r.progress.value).toBe("$307.00 / $1,000.00");
    expect(r.buffer.value).toMatch(/^\$\d/);
  });

  it("no rule + no snapshot variants render dashed-empty payloads", () => {
    const r = buildPasserCards(null, null, 10_000, "USD", "percent", 10);
    expect(r.progress.empty).toBe(true);
    expect(r.progress.value).toBe("—");
    expect(r.buffer.empty).toBe(true);
    expect(r.buffer.value).toBe("—");
    expect(r.equity.empty).toBe(false); // equity always renders if snapshot present? not here
    expect(r.equity.value).toBe("—");
  });

  it("rule with profit_target=0 renders progress as empty", () => {
    const zeroTargetRule: PropfirmRule = { ...RULE, profit_target: 0 };
    const snap = SNAP({ balance: 10_100, equity: 10_100 });
    const daily = [DAILY("2026-05-19", 10_100, 100)];
    const o = evaluateObjectives({ rule: zeroTargetRule, currentSnapshot: snap, dailySnapshots: daily, todayUtc: "2026-05-20" });

    const r = buildPasserCards(o, snap, 10_000, "USD", "percent", 0);

    expect(r.progress.empty).toBe(true);
    expect(r.progress.sub).toContain("no profit target");
  });

  it("rule with both loss limits 0 renders buffer as empty", () => {
    const noLimitsRule: PropfirmRule = { ...RULE, max_daily_loss: 0, max_total_loss: 0 };
    const snap = SNAP();
    const daily = [DAILY("2026-05-19", 10_000, 0)];
    const o = evaluateObjectives({ rule: noLimitsRule, currentSnapshot: snap, dailySnapshots: daily, todayUtc: "2026-05-20" });

    const r = buildPasserCards(o, snap, 10_000, "USD", "percent", 10);

    expect(r.buffer.empty).toBe(true);
    expect(r.buffer.sub).toContain("no loss limits");
  });
});
```

- [ ] **Step 2: Run the test file and watch it fail**

Run: `npx jest lib/journal/passer-progress.test.ts -v`
Expected: FAIL — `Cannot find module './passer-progress'`.

---

## Task 3: Implement `buildPasserCards`

**Files:**
- Create: `lib/journal/passer-progress.ts`

- [ ] **Step 1: Write the module**

Create `lib/journal/passer-progress.ts`:

```ts
import type { AccountSnapshotCurrent } from "@/lib/types";
import type { ObjectivesResult } from "./objectives";
import { fmtCash } from "./format-pnl";

export type CardTone = "positive" | "negative" | "neutral" | "warn";
export type SubTone = "positive" | "negative" | "neutral";
export type BarTone = "ok" | "warn" | "bad" | "neutral";

export interface CardPayload {
  label: string;
  value: string;
  sub: string;
  tone: CardTone;
  subTone?: SubTone;
  progressBar?: { fill: number; tone: BarTone };
  empty?: boolean;
}

export interface PasserCards {
  progress: CardPayload;
  equity: CardPayload;
  buffer: CardPayload;
}

const EN_DASH = "−";

function signedPct(n: number): string {
  if (!Number.isFinite(n)) return `${EN_DASH}—%`;
  const rounded = Math.round(n * 10) / 10;
  if (rounded === 0) return "0.0%";
  const sign = rounded > 0 ? "+" : EN_DASH;
  return `${sign}${Math.abs(rounded).toFixed(1)}%`;
}

function bufferTone(pct: number): { tone: CardTone; bar: BarTone } {
  if (pct >= 40) return { tone: "positive", bar: "ok" };
  if (pct >= 20) return { tone: "warn",     bar: "warn" };
  return                 { tone: "negative", bar: "bad" };
}

/**
 * Build the three Prop Passer headline cards. Returns dashed-empty payloads
 * when objectives can't be computed (no rule, no snapshot, or thresholds = 0).
 */
export function buildPasserCards(
  objectives: ObjectivesResult | null,
  snapshot: AccountSnapshotCurrent | null,
  baseline: number,
  currency: string,
  mode: "percent" | "cash",
  profitTargetPct: number, // rule.target_type === "percent" ? rule.profit_target : (profit_target / account_size * 100)
): PasserCards {
  // ── EQUITY (always rendered if we have a snapshot) ────────────────────
  const equity = buildEquityCard(snapshot, baseline, currency);

  // ── No objectives → empty Progress + Buffer ───────────────────────────
  if (!objectives || !snapshot) {
    return {
      progress: emptyCard("Challenge Progress", "Assign challenge rule → to see target progress"),
      equity,
      buffer:   emptyCard("Loss Buffer",        "No limits configured"),
    };
  }

  const progress = buildProgressCard(objectives, currency, mode, profitTargetPct);
  const buffer   = buildBufferCard(objectives, currency, mode);
  return { progress, equity, buffer };
}

// ─── individual builders ───────────────────────────────────────────────

function emptyCard(label: string, sub: string): CardPayload {
  return { label, value: "—", sub, tone: "neutral", empty: true };
}

function buildEquityCard(
  snapshot: AccountSnapshotCurrent | null,
  baseline: number,
  currency: string,
): CardPayload {
  if (!snapshot) {
    return emptyCard("Equity", "Waiting for first EA push…");
  }
  const equity = snapshot.equity;
  const floating = snapshot.floating_pnl;
  const delta = equity - baseline;
  const deltaPct = baseline > 0 ? (delta / baseline) * 100 : 0;
  let subTone: SubTone = "neutral";
  let leading = "Breakeven";
  if (delta > 0.5)       { subTone = "positive"; leading = `Up ${fmtCash(delta, currency)} (${signedPct(deltaPct)})`; }
  else if (delta < -0.5) { subTone = "negative"; leading = `Down ${fmtCash(Math.abs(delta), currency)} (${signedPct(deltaPct)})`; }

  return {
    label: "Equity",
    value: fmtCash(equity, currency),
    sub:   `${leading} · floating ${fmtCash(floating, currency)}`,
    tone:  "neutral",
    subTone,
  };
}

function buildProgressCard(
  o: ObjectivesResult,
  currency: string,
  mode: "percent" | "cash",
  profitTargetPct: number,
): CardPayload {
  if (o.profitTargetThreshold <= 0) {
    return { ...emptyCard("Challenge Progress", "Rule has no profit target"), };
  }
  const progressPct = (o.netProfit / o.profitTargetThreshold) * 100;
  const inBreakevenBand = Math.abs(progressPct) <= 0.5;
  const tone: CardTone =
    inBreakevenBand ? "neutral"
      : progressPct > 0 ? "positive"
      : "negative";

  let value: string;
  if (mode === "cash") {
    value = `${fmtCash(o.netProfit, currency)} / ${fmtCash(o.profitTargetThreshold, currency)}`;
  } else if (inBreakevenBand) {
    value = `${signedPct(progressPct).replace("+", "").replace("−", "")}· breakeven`.replace("· breakeven", " · breakeven");
    // ensure form "0.4% · breakeven" (preserve sign for non-zero values within band? we drop sign here to keep neutral framing)
    const abs = Math.round(Math.abs(progressPct) * 10) / 10;
    value = `${abs.toFixed(1)}% · breakeven`;
  } else {
    value = signedPct(progressPct);
  }

  const gap = Math.max(0, o.profitTargetThreshold - o.netProfit);
  const goal = progressPct >= 0 ? "to pass" : "to target";
  const sub  = `${fmtCash(o.netProfit, currency)} · ${fmtCash(gap, currency)} ${goal}`;

  const fill = Math.max(0, Math.min(100, progressPct));
  return {
    label: "Challenge Progress",
    value,
    sub,
    tone,
    progressBar: { fill, tone: tone === "positive" ? "ok" : tone === "negative" ? "bad" : "neutral" },
  };
}

function buildBufferCard(
  o: ObjectivesResult,
  currency: string,
  mode: "percent" | "cash",
): CardPayload {
  const hasDaily = o.dailyLossThreshold > 0;
  const hasTotal = o.totalLossThreshold > 0;
  if (!hasDaily && !hasTotal) {
    return emptyCard("Loss Buffer", "Rule has no loss limits");
  }

  const dailyLossAbs = o.todaysPnl < 0 ? -o.todaysPnl : 0;
  const totalDrawdownAbs = o.totalDrawdown;

  const dailyBufferPct = hasDaily
    ? Math.max(0, Math.min(100, ((o.dailyLossThreshold - dailyLossAbs) / o.dailyLossThreshold) * 100))
    : 100;
  const totalBufferPct = hasTotal
    ? Math.max(0, Math.min(100, ((o.totalLossThreshold - totalDrawdownAbs) / o.totalLossThreshold) * 100))
    : 100;

  // Prefer "daily" on ties.
  const tighter: "daily" | "total" = dailyBufferPct <= totalBufferPct ? "daily" : "total";
  const headlinePct = Math.min(dailyBufferPct, totalBufferPct);
  const { tone, bar } = bufferTone(headlinePct);

  const dailyRemaining = Math.max(0, o.dailyLossThreshold - dailyLossAbs);
  const totalRemaining = Math.max(0, o.totalLossThreshold - totalDrawdownAbs);

  const dailySub = hasDaily
    ? `daily ${fmtCash(dailyRemaining, currency)} of ${fmtCash(o.dailyLossThreshold, currency)}`
    : null;
  const totalSub = hasTotal
    ? `total ${fmtCash(totalRemaining, currency)} of ${fmtCash(o.totalLossThreshold, currency)}`
    : null;
  const sub = [dailySub, totalSub].filter(Boolean).join(" · ");

  let value: string;
  if (mode === "cash") {
    const remaining = tighter === "daily" ? dailyRemaining : totalRemaining;
    const limit     = tighter === "daily" ? o.dailyLossThreshold : o.totalLossThreshold;
    value = `${fmtCash(remaining, currency)} of ${fmtCash(limit, currency)}`;
  } else {
    value = `${Math.round(headlinePct)}% left`;
  }

  return {
    label: `Loss Buffer · ${tighter}`,
    value,
    sub,
    tone,
    progressBar: { fill: headlinePct, tone: bar },
  };
}
```

- [ ] **Step 2: Run the tests and iterate until green**

Run: `npx jest lib/journal/passer-progress.test.ts -v`
Expected: all eight tests PASS.

If a test fails:
- Fix the implementation, not the test, unless the test expectation is genuinely wrong.
- Re-run until green.

- [ ] **Step 3: Commit**

```bash
git add lib/journal/passer-progress.ts lib/journal/passer-progress.test.ts
git commit -m "feat(journal): add passer-progress card builder

Pure-function module that maps ObjectivesResult + snapshot into three
formatted card payloads (Challenge Progress, Equity, Loss Buffer).
Handles dollar/percent modes, tone thresholds, and empty states."
```

---

## Task 4: Build `PasserHeadlineCards` component (failing test first)

**Files:**
- Create: `components/journal/passer-headline-cards.test.tsx`

- [ ] **Step 1: Author the smoke test**

Create `components/journal/passer-headline-cards.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { PasserHeadlineCards } from "./passer-headline-cards";
import { JournalChromeProvider } from "./preferences/journal-chrome-context";
import type { AccountSnapshotCurrent, AccountSnapshotDaily, PropfirmRule } from "@/lib/types";

const RULE: PropfirmRule = {
  id: 1, name: "10k", account_size: 10_000,
  max_daily_loss: 5, daily_loss_type: "percent", daily_loss_calc: "balance",
  max_total_loss: 10, total_loss_type: "percent",
  profit_target: 10, target_type: "percent",
  min_trading_days: 4, max_trading_days: 30,
  created_at: "2026-04-01T00:00:00Z",
};

const SNAP = (over: Partial<AccountSnapshotCurrent> = {}): AccountSnapshotCurrent => ({
  mt5_account: 1, balance: 10_000, equity: 10_000, margin: 0, free_margin: 10_000,
  margin_level: null, floating_pnl: 0, drawdown_pct: 0, leverage: 30, currency: "USD",
  server: null, pushed_at: "2026-05-20T12:00:00Z", ...over,
});

const wrap = (ui: React.ReactNode) => (
  <JournalChromeProvider licenseId={1} initialPnlDisplay="percent" initialRangeDays={30}>
    {ui}
  </JournalChromeProvider>
);

describe("PasserHeadlineCards", () => {
  it("renders the three cards with a rule + snapshot", () => {
    const snap = SNAP({ balance: 10_307, equity: 10_307 });
    const daily: AccountSnapshotDaily[] = [
      { mt5_account: 1, trade_date: "2026-05-19", balance_close: 10_307, equity_close: 10_307, daily_pnl: 307 },
    ];
    render(wrap(
      <PasserHeadlineCards snapshot={snap} daily={daily} deals={[]} rule={RULE} baseline={10_000} />
    ));

    expect(screen.getByText(/Challenge Progress/i)).toBeInTheDocument();
    expect(screen.getByText("+30.7%")).toBeInTheDocument();
    expect(screen.getByText(/Equity/i)).toBeInTheDocument();
    expect(screen.getByText(/\$10,307\.00/)).toBeInTheDocument();
    expect(screen.getByText(/Loss Buffer · daily/i)).toBeInTheDocument();
    expect(screen.getByText("100% left")).toBeInTheDocument();
  });

  it("renders empty Progress + Buffer when rule is null", () => {
    const snap = SNAP();
    render(wrap(
      <PasserHeadlineCards snapshot={snap} daily={[]} deals={[]} rule={null} baseline={10_000} />
    ));

    expect(screen.getByText(/Assign challenge rule/i)).toBeInTheDocument();
    expect(screen.getByText(/No limits configured/i)).toBeInTheDocument();
    expect(screen.getByText(/\$10,000\.00/)).toBeInTheDocument(); // equity still shown
  });
});
```

- [ ] **Step 2: Run and watch it fail**

Run: `npx jest components/journal/passer-headline-cards.test.tsx -v`
Expected: FAIL — `Cannot find module './passer-headline-cards'`.

---

## Task 5: Implement `PasserHeadlineCards`

**Files:**
- Create: `components/journal/passer-headline-cards.tsx`

- [ ] **Step 1: Write the component**

Create `components/journal/passer-headline-cards.tsx`:

```tsx
"use client";

import { useMemo } from "react";
import type { AccountSnapshotCurrent, AccountSnapshotDaily, Deal, PropfirmRule } from "@/lib/types";
import { evaluateObjectives } from "@/lib/journal/objectives";
import { buildPasserCards } from "@/lib/journal/passer-progress";
import { computeTradeEquity } from "@/lib/journal/trade-equity";
import { KpiCard } from "./kpi-card";
import { AccountMetadataStrip } from "./account-metadata-strip";
import { usePnlDisplay } from "./preferences/journal-chrome-context";

interface Props {
  snapshot: AccountSnapshotCurrent | null;
  daily: AccountSnapshotDaily[];
  deals: Deal[];
  rule: PropfirmRule | null;
  baseline: number;
}

export function PasserHeadlineCards({ snapshot, daily, deals, rule, baseline }: Props) {
  const { mode } = usePnlDisplay();
  const currency = snapshot?.currency ?? "USD";
  const todayUtc = new Date().toISOString().slice(0, 10);

  const trade = useMemo(() => computeTradeEquity(deals), [deals]);
  const cumPnlSeries = useMemo(() => trade.curve.map((p) => p.cumPnl), [trade.curve]);
  const balanceSeries = useMemo(() => daily.map((d) => d.balance_close), [daily]);

  const objectives = useMemo(() => {
    if (!rule || !snapshot) return null;
    return evaluateObjectives({ rule, currentSnapshot: snapshot, dailySnapshots: daily, todayUtc });
  }, [rule, snapshot, daily, todayUtc]);

  const profitTargetPct = rule
    ? (rule.target_type === "percent" ? rule.profit_target : (rule.profit_target / rule.account_size) * 100)
    : 0;

  const cards = buildPasserCards(objectives, snapshot, baseline, currency, mode, profitTargetPct);

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <KpiCard
          featured
          label={cards.progress.label}
          value={cards.progress.value}
          sub={cards.progress.sub}
          tone={cards.progress.tone}
          subTone={cards.progress.subTone}
          progressBar={cards.progress.progressBar}
          empty={cards.progress.empty}
          series={cumPnlSeries}
          seriesTone={cards.progress.tone === "negative" ? "negative" : "positive"}
        />
        <KpiCard
          label={cards.equity.label}
          value={cards.equity.value}
          sub={cards.equity.sub}
          tone={cards.equity.tone}
          subTone={cards.equity.subTone}
          empty={cards.equity.empty}
          series={balanceSeries}
          seriesTone="neutral"
        />
        <KpiCard
          label={cards.buffer.label}
          value={cards.buffer.value}
          sub={cards.buffer.sub}
          tone={cards.buffer.tone}
          progressBar={cards.buffer.progressBar}
          empty={cards.buffer.empty}
        />
      </div>
      <AccountMetadataStrip snapshot={snapshot} />
    </div>
  );
}
```

- [ ] **Step 2: Run the test until green**

Run: `npx jest components/journal/passer-headline-cards.test.tsx -v`
Expected: PASS for both cases.

- [ ] **Step 3: Commit**

```bash
git add components/journal/passer-headline-cards.tsx components/journal/passer-headline-cards.test.tsx
git commit -m "feat(journal): add PasserHeadlineCards component

Three-card row for ctx-prop-passer licenses: Challenge Progress, Equity
with from-start delta, and tighter Loss Buffer. Pure presentation —
data flows from journal-shell."
```

---

## Task 6: Branch `LiveAccountPanel` on product

**Files:**
- Modify: `components/journal/live-account-panel.tsx`

- [ ] **Step 1: Apply the edit**

Open `components/journal/live-account-panel.tsx` and:

1. Add to imports at the top:
```tsx
import type { Product } from "@/lib/products";
import type { PropfirmRule } from "@/lib/types";
import { PasserHeadlineCards } from "./passer-headline-cards";
```

2. Replace the `Props` interface:
```tsx
interface Props {
  snapshot: AccountSnapshotCurrent | null;
  deals: Deal[];
  daily: AccountSnapshotDaily[];
  baseline: number;
  baselineSource: BaselineSource;
  product: Product;
  rule: PropfirmRule | null;
}
```

3. Update the function signature and add the branch as the very first thing in the function body:
```tsx
export function LiveAccountPanel({ snapshot, deals, daily, baseline, baselineSource, product, rule }: Props) {
  if (product === "ctx-prop-passer") {
    return <PasserHeadlineCards snapshot={snapshot} daily={daily} deals={deals} rule={rule} baseline={baseline} />;
  }

  const { mode } = usePnlDisplay();
  // ...rest of the existing implementation unchanged...
```

(Leave everything below the branch — the existing Net Return / Equity / Max Drawdown body — intact.)

- [ ] **Step 2: Type-check the file**

Run: `npx tsc --noEmit`
Expected: PASS (no errors in `live-account-panel.tsx`; errors elsewhere expected from Task 7 until that task lands).

If `tsc` complains about `journal-shell.tsx` not passing `product`/`rule`, that's fine — Task 7 fixes it.

- [ ] **Step 3: Commit**

```bash
git add components/journal/live-account-panel.tsx
git commit -m "feat(journal): route prop-passer licenses through PasserHeadlineCards

Other products keep the existing Net Return / Equity / Max Drawdown row."
```

---

## Task 7: Wire `product` + `rule` through `JournalShell`

**Files:**
- Modify: `components/journal/journal-shell.tsx`

- [ ] **Step 1: Edit the `LiveAccountPanel` call**

In `components/journal/journal-shell.tsx`, find the `<LiveAccountPanel ... />` line inside `Inner` and replace it with:

```tsx
<LiveAccountPanel
  snapshot={snapshot.data}
  deals={deals.data}
  daily={daily.data}
  baseline={baseline}
  baselineSource={props.baseline.source}
  product={license.product}
  rule={props.rule}
/>
```

- [ ] **Step 2: Type-check the whole project**

Run: `npx tsc --noEmit`
Expected: PASS for these files. Any unrelated errors (existing) should already have been there.

- [ ] **Step 3: Run the journal-related tests**

Run: `npx jest components/journal lib/journal --silent`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add components/journal/journal-shell.tsx
git commit -m "feat(journal): pass product + rule into LiveAccountPanel"
```

---

## Task 8: Drop `ChallengeMini` from `OverviewTab` for Prop Passer

**Files:**
- Modify: `components/journal/tabs/overview-tab.tsx`

- [ ] **Step 1: Apply the edit**

Replace the `return` block in `components/journal/tabs/overview-tab.tsx` with:

```tsx
  const isPasser = license.product === "ctx-prop-passer";

  return (
    <section className="space-y-4">
      {isPasser ? (
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
      ) : (
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
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <RecentTrades deals={deals} currency={currency} baseline={baseline} />
        <div className="rounded-xl border bg-card p-4">
          <div className="mb-2 flex items-center justify-between">
            <h4 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Open Positions · <span className="text-foreground">{positions.length}</span>
            </h4>
            <span className="text-[11px] text-muted-foreground">
              Floating {fmtPctOrCash(snapshot?.floating_pnl ?? 0, mode, baseline, currency)}
            </span>
          </div>
          <PositionsTable positions={positions} currency={currency} baseline={baseline} />
        </div>
      </div>
    </section>
  );
```

- [ ] **Step 2: Type-check + run tests**

Run: `npx tsc --noEmit && npx jest components/journal lib/journal --silent`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add components/journal/tabs/overview-tab.tsx
git commit -m "fix(journal): drop ChallengeMini from Overview for prop-passer

Challenge progress now lives in the headline KPI row; the per-objective
breakdown stays on the Objectives tab."
```

---

## Task 9: Visual smoke test

**Files:**
- None modified.

- [ ] **Step 1: Start the dev server**

Run: `npm run dev`
Wait for "Ready" log.

- [ ] **Step 2: Open a CTX Prop Passer license journal in a browser**

Navigate to `http://localhost:3000/dashboard/licenses/<id>` for a license where `product = "ctx-prop-passer"`. If no Prop Passer license exists in your dev DB, create one via `/admin/subscriptions/new` first.

- [ ] **Step 3: Verify each scenario**

Confirm visually:
- Headline row shows **Challenge Progress / Equity / Loss Buffer · daily** (or `· total`).
- Equity subline reads `Up $X (+Y%)` / `Down $X (−Y%)` / `Breakeven`.
- Toggle `% / $` in the toolbar: Card 1 flips to `$307.00 / $1,000.00`, Card 3 flips to `$<remaining> of $<limit>`.
- Open the Overview tab: the per-objective `ChallengeMini` panel is **gone**; OverviewHero is full-width.
- Switch to a non-Prop-Passer license (Funded / Core / Live): the headline row reverts to **Net Return / Equity / Max Drawdown**, and `ChallengeMini` reappears on Overview.
- Assign-or-unassign a propfirm rule on a Passer license: confirm Cards 1 and 3 swap to the dashed "—" empty state.

If any of the above is wrong, fix it before continuing.

- [ ] **Step 4: Stop the dev server**

Ctrl-C the `npm run dev` process.

---

## Task 10: Final sweep + ship

**Files:**
- None modified.

- [ ] **Step 1: Run the full test + type-check sweep**

Run: `npx tsc --noEmit && npm test -- --silent`
Expected: PASS.

- [ ] **Step 2: Verify git is clean**

Run: `git status`
Expected: clean working tree (all changes already committed in Tasks 1–8).

- [ ] **Step 3: Confirm with user**

Surface to the user: "Prop Passer headline row done. Ready to push?" — wait for explicit ok before any push.

---

## Self-Review

**Spec coverage check (against `2026-05-20-prop-passer-dashboard-design.md`):**

| Spec requirement | Task |
|---|---|
| Product gating on `ctx-prop-passer` | Task 6 (branch), Task 8 (Overview branch) |
| Card 1 framing + breakeven band + signed value | Task 3 (`buildProgressCard`), Task 2 (tests) |
| Card 2 framing with "from start" subline | Task 3 (`buildEquityCard`), Task 2 (test asserts `Up` copy) |
| Card 3 framing with tighter-buffer headline + label suffix | Task 3 (`buildBufferCard`), Task 2 (test asserts `daily` label) |
| Tone thresholds (40 / 20 cutoffs) | Task 2 (threshold test), Task 3 (`bufferTone`) |
| Empty states (no rule, profit_target=0, both loss limits 0) | Task 2 (three empty tests), Task 3 (empty branches) |
| % / $ toggle behavior | Task 2 (cash mode test), Task 3 (mode branches) |
| `ChallengeMini` removed from Overview for Passer | Task 8 |
| `KpiCard` extensions (`progressBar`, subline tone, dashed-empty) | Task 1 |
| Funded/other products untouched | Task 6 (branch is purely additive), Task 8 (else-branch preserves original layout) |
| Component test pattern | Task 4 (smoke tests for two states) |

**Placeholder scan:** no `TBD`, `TODO`, or "implement later" in any task. Every code step has complete code. Type names match across tasks (`CardPayload`, `PasserCards`, `BarTone`, `subTone` consistently used).

**Type consistency:**
- `KpiCard` `tone` extended to `"positive" | "negative" | "neutral" | "warn" | "danger"` (Task 1). `buildPasserCards` returns `"positive" | "negative" | "neutral" | "warn"` (Task 3) — subset, compatible.
- `progressBar` shape `{ fill: number; tone: "ok"|"warn"|"bad"|"neutral" }` matches in both files.
- `buildPasserCards` signature in plan matches between Task 2 (test imports) and Task 3 (implementation).
- `evaluateObjectives` is unchanged — every consumer reads the same `ObjectivesResult` shape from `lib/journal/objectives.ts`.

Plan is internally consistent; ready for execution.
