# CTX Prop Passer Dashboard — Design

**Date:** 2026-05-20
**Status:** Draft (pending user review)
**Owner:** Jayson
**Affects:** `/dashboard/licenses/[id]` (also reachable from `/admin/licenses/[id]/journal`)

## Goal

Reframe the journal headline row so that **CTX Prop Passer** licenses lead with
the metrics a challenge-taker actually needs to act on:

1. **Am I on track to pass?** — % of profit target reached, with the dollar
   amount still needed in the subline.
2. **Am I up, down, or at breakeven right now?** — equity with an explicit
   "from-start" delta, anchored on a 0% breakeven tick.
3. **How close am I to a breach?** — remaining buffer on the tighter of the
   daily and total loss limits.

The current headline ("Net Return +3.03% · Equity · Max Drawdown") was designed
for **CTX Prop Funded** accounts, where "Net Return" reads as real earned
profit. On a Passer account the same value is just challenge progress — and
calling it "Net Return" implies take-home, which misframes the goal.

## Non-goals

- Changing the headline row for any product other than `ctx-prop-passer`. The
  Funded product (`ctx-prop-funded`) and all CTX Core / Live / Impulse views
  keep the current `Net Return / Equity / Max Drawdown` layout.
- Touching the rest of the journal shell (tabs, range selector, % / $ toggle,
  polling, baseline resolution, objectives evaluation). The change is scoped
  to **the three KPI cards above the tabs** and **one panel inside the
  Overview tab**.
- Redesigning the Objectives tab. It remains the deep-dive surface and is
  unchanged.
- Adding new data sources. All values are computed from existing data:
  `propfirm_rules` (account_size, profit_target, max_daily_loss, max_total_loss,
  and their `*_type` / `daily_loss_calc` modifiers), `account_snapshots_current`,
  `account_snapshots_daily`, and the deal ledger.
- Adding alerting or notifications for near-breach states. Color tone changes
  are the only signaling.
- Changing how the baseline is resolved. `resolveBaseline` (rule → first daily
  → current) stays as-is.

## Background — current behavior

`components/journal/live-account-panel.tsx` renders three `KpiCard`s
identically for every product:

| Card | Source | Display |
|---|---|---|
| Net Return | `computeTradeEquity(deals).netPnl` | `$` or `% of baseline` |
| Equity | `snapshot.equity` | always `$` |
| Max Drawdown | `computeTradeEquity(deals).maxDrawdownCash` | `$` or `% of baseline` |

`components/journal/tabs/overview-tab.tsx` then renders an `OverviewHero` next
to a `ChallengeMini` panel that re-shows profit-target / daily-loss / total-
drawdown progress bars. On Prop Passer accounts this is the *only* place
challenge progress is currently surfaced.

The headline row therefore tells the user "you made +3.03%" without context,
while the actually-relevant "30% of the way to passing · $693 to go" is
buried inside the Overview tab.

## Locked design decisions

| Area | Decision |
|---|---|
| Product gating | Only `license.product === "ctx-prop-passer"` gets the new headline row. All other products are untouched. |
| Card 1 framing | `Challenge Progress` — value is `netProfit / profitTargetThreshold × 100` (both fields from `evaluateObjectives`) rounded to 1 dp. Allowed to be negative. Headline reads `+30%` / `0% · breakeven` / `−6.5%`. Sub line is always `$<netProfit signed> · <n> trades · $<gap> to pass` (or `to target` when negative), where `gap = max(0, profitTargetThreshold − netProfit)`. |
| Card 2 framing | `Equity` — same dollar headline as today, with a new subline `Up $X (+Y%)` / `Down $X (−Y%)` / `Breakeven` computed against `baseline`. The sparkline gets a horizontal "breakeven" tick at the baseline level. |
| Card 3 framing | `Loss Buffer` — pick the **tighter** of `(daily_buffer_pct, total_buffer_pct)`. Headline reads `<pct> left` and the card label suffixes `· daily` or `· total` to disclose which one. Subline always shows both: `daily $A of $B · total $C of $D`. |
| Tone (Card 1) | Green if `progressPct > 0`, neutral if `−0.5% ≤ progressPct ≤ 0.5%` (breakeven band), red otherwise. |
| Tone (Card 3) | Green if `buffer ≥ 40%`, amber if `20% ≤ buffer < 40%`, red if `buffer < 20%`. Same thresholds for the inline bar fill color. |
| Tone (Card 2) | No card-level tone change; the "from start" subline carries the green/red color. |
| Empty state (no `rule`) | Cards 1 and 3 render an empty `KpiCard` (`—` value, dashed border) with sub `Assign challenge rule →` linking to `/admin/licenses/<id>`. Card 2 still renders normally — equity needs no rule. |
| % / $ toggle behavior | Card 1: `%` shows `+30%`, `$` shows `$307 / $1,000 target` as the headline. Card 3: `%` shows `70% left`, `$` shows `$350 of $500` (the tighter limit). Card 2 keeps current behavior. |
| Overview tab | The existing `ChallengeMini` panel is **removed** for Prop Passer. The freed grid slot collapses; `OverviewHero` becomes full-width. (ChallengeMini is unused by other products, but the file/component is preserved in case we want it back — just not rendered.) |
| Funded product | `ctx-prop-funded` keeps `Net Return / Equity / Max Drawdown` exactly as today. |
| Pre-Plan-7 fallback | Licenses where `subscription.propfirm_rule_id` is null (the current screenshot scenario) are handled by the "empty state" rule above. Same fallback today. |

## High-level layout

### Live account panel (the three headline cards)

```
┌─ Prop Passer ────────────────────────────────────────────────────────┐
│                                                                       │
│  ┌──────────────────┐  ┌──────────────────┐  ┌────────────────────┐ │
│  │ CHALLENGE        │  │ EQUITY           │  │ LOSS BUFFER · DAILY│ │
│  │ PROGRESS         │  │                  │  │                    │ │
│  │ +30%             │  │ $10,006.81       │  │ 70% left           │ │
│  │ $307 / $1,000    │  │ Up $6.81 (+0.07%)│  │ daily $350 / $500  │ │
│  │ target · 10 tr · │  │ · floating $0.00 │  │ total $850 / $1,000│ │
│  │ $693 to pass     │  │                  │  │                    │ │
│  │ ████░░░░░░       │  │ ──┼─▌────────    │  │ ███████░░░         │ │
│  └──────────────────┘  └──────────────────┘  └────────────────────┘ │
│                                                                       │
│  Margin $0 · Free $10,006 · Margin Level — · Leverage 1:30           │
└───────────────────────────────────────────────────────────────────────┘
```

### Overview tab — Prop Passer

```
┌──────────────────────────────────────────────────────────────────────┐
│  OverviewHero (cumulative %, win rate, best/worst day) — FULL WIDTH  │
└──────────────────────────────────────────────────────────────────────┘
┌──────────────────────────┐  ┌──────────────────────────────────────┐
│  Recent Trades (last 5)  │  │  Open Positions                      │
└──────────────────────────┘  └──────────────────────────────────────┘
```

`ChallengeMini` is removed; the per-objective progress bars live on the
**Objectives** tab only.

### Overview tab — every other product (unchanged)

```
┌──────────────────────────┐  ┌──────────────────────────────────────┐
│  OverviewHero            │  │  ChallengeMini (still rendered when  │
│                          │  │  a rule is assigned)                 │
└──────────────────────────┘  └──────────────────────────────────────┘
```

## Component changes

### `components/journal/live-account-panel.tsx`

- Add `product: Product` to `Props`.
- Branch at the top of the render:
  - If `product === "ctx-prop-passer"` → render the new `<PassersHeadlineCards />` (described below).
  - Else → keep the current three cards as-is.
- Pass `rule` through (already available upstream from `journal-shell`).

### New: `components/journal/passer-headline-cards.tsx`

A client component that owns the three new cards. Inputs:

```ts
{
  snapshot: AccountSnapshotCurrent | null;
  daily: AccountSnapshotDaily[];
  deals: Deal[];
  rule: PropfirmRule | null;
  baseline: number;
  baselineSource: BaselineSource;
}
```

Behavior:

- Calls `evaluateObjectives(...)` when `rule && snapshot` to get
  `netProfit`, `todaysPnl`, `totalDrawdown`, `profitTargetThreshold`,
  `dailyLossThreshold`, `totalLossThreshold`. No new math.
- Computes `progressPct = (netProfit / profitTargetThreshold) * 100`,
  clamped only for the visual bar (`Math.max(-50, Math.min(150, _))`).
- Computes the two buffer percentages and picks the tighter one as the
  headline:
  - `dailyLossAbs = max(0, −todaysPnl)`
  - `dailyBufferPct = ((dailyLossThreshold − dailyLossAbs) / dailyLossThreshold) × 100`
  - `totalBufferPct = ((totalLossThreshold − totalDrawdown) / totalLossThreshold) × 100`
  - Headline = `min(dailyBufferPct, totalBufferPct)`; the suffix on Card 3's
    label (`· daily` vs `· total`) reflects which limit won the min. If both
    are equal, prefer `· daily`. Each pct is clamped to `[0, 100]` for display.
- Reads `mode` from `usePnlDisplay()` to decide value formatting.
- When `rule` is `null` or `snapshot` is `null`, renders the "empty state"
  variants for Cards 1 and 3 described in the locked decisions.

The component does **no** data fetching. It is a pure presentation component
fed by the existing journal shell.

### `components/journal/kpi-card.tsx` — extensions

The current `KpiCard` already supports `featured`, `tone`, `series`,
`seriesTone`, `tooltip`. Two small additions:

- A new optional `progressBar?: { fill: number; tone: "ok"|"warn"|"bad"|"neutral" }` slot that renders a 5px-tall bar below the sub line (existing `ChallengeMini` already renders an identical bar inline — this just lifts it into the card chrome so the three new cards stay visually aligned).
- A `valueTone?: "positive"|"negative"|"neutral"` for the **subline** color, so Card 2 can keep a neutral big number while tinting the "Up/Down $X" copy.

Both are additive; existing call sites are unaffected.

### `components/journal/overview-hero.tsx`

No code change. Layout in `overview-tab.tsx` is what flips it to full-width.

### `components/journal/tabs/overview-tab.tsx`

- Take `product` (already in `license.product`).
- If Prop Passer:
  - Drop the `md:grid-cols-[1.4fr_1fr]` wrapper; render `OverviewHero` alone above the Recent Trades / Open Positions row.
  - Do **not** render `ChallengeMini`.
- Else: unchanged.

### `lib/journal/passer-progress.ts` — new

A tiny pure-function module that takes the `evaluateObjectives` result + the
display mode and returns formatted card payloads:

```ts
export function buildPasserCards(
  objectives: ObjectivesResult,
  snapshot: AccountSnapshotCurrent,
  baseline: number,
  currency: string,
  mode: "percent" | "cash",
): { progress: CardPayload; equity: CardPayload; buffer: CardPayload };
```

Keeping the formatting math in `lib/journal/` matches the existing pattern
(`format-pnl.ts`, `trade-equity.ts`, `objectives.ts`). The React component is
the only place that touches the DOM; pure logic gets a dedicated unit test.

## Data flow

```
journal-shell (already passes rule, snapshot, daily, deals, baseline)
        │
        ▼
live-account-panel (now branches on product)
        │
        ├── product === "ctx-prop-passer" ──► passer-headline-cards
        │                                          │
        │                                          ▼
        │                                    evaluateObjectives + buildPasserCards
        │                                          │
        │                                          ▼
        │                                    3× KpiCard (with progressBar)
        │
        └── otherwise ─────────────────────► current 3 cards (unchanged)
```

No new server-side data. No DB changes. No new endpoints.

## Edge cases

- **No rule assigned** — Cards 1 and 3 show the "empty" variant; Card 2 still works because equity doesn't need a rule.
- **`rule.profit_target` is 0** — Card 1 falls back to "—" with a sub "rule has no profit target"; otherwise we'd divide by zero.
- **`rule.max_daily_loss` is 0 but `max_total_loss` > 0** — Card 3 hides the "daily" line and shows only total. Suffix becomes `· total`.
- **Both loss limits 0** — Card 3 renders the empty variant with sub "rule has no loss limits".
- **Account just started, no deals yet** — `netProfit = 0`, `progressPct = 0`, headline reads `0% · breakeven`. Sub: `$0 · 0 trades · $1,000 to pass`.
- **`baseline === 0`** (no daily snapshots, snapshot.balance is 0) — already a degenerate case the existing code handles by showing `—`; same treatment here.
- **Negative `profit_target_threshold`** — not allowed by schema; ignore.
- **Floating P/L pushes equity below daily/total limits intraday** — the buffer math uses `totalDrawdown = max(0, account_size - min(balance, equity))` (existing) so floating losses *do* eat the total buffer. Daily buffer uses today's realized P/L only (existing `evaluateObjectives` behavior). This matches how propfirm breaches are computed and we don't change it.
- **Multiple accounts, one Funded one Passer for the same user** — each license page is rendered independently with `license.product`, so they correctly show different headline rows.

## Testing

Unit tests:

- `lib/journal/passer-progress.test.ts` — covers each card payload across:
  winning, breakeven band (`−0.5% ≤ p ≤ 0.5%`), losing-but-not-breached,
  near-breach (buffer 16%), at-target (`progressPct ≥ 100`), no-rule,
  no-snapshot, zero-profit-target, zero-loss-limits.
- Tone thresholds: 39.9% → amber, 40% → green; 19.9% → red, 20% → amber; etc.
  Lock the threshold boundaries.
- % / $ formatting: feed both modes and assert the headline + sub strings.

Component tests (existing patterns from `kpi-card.test.tsx`):

- `passer-headline-cards.test.tsx` — renders all four states (winning,
  breakeven, near-breach, no-rule) from the same mock fixtures, asserting
  the visible text and the data-tone attribute on each card.

Integration / smoke:

- The existing `app/dashboard/licenses/[id]/page.tsx` test (if any) needs the
  product field stubbed; otherwise a new minimal snapshot test confirms a
  Funded license still renders the old three cards.

No Playwright / E2E expansion needed for this change — it's a presentation
swap fed by data already exercised in the journal-shell tests.

## Rollout

- Single PR. No flag, no migration. The change is purely client-side and
  product-gated.
- README / vault note (`/update-kb` after shipping) documents that
  `ctx-prop-passer` now has a dedicated headline row.

## Open follow-ups (out of scope for this spec)

- Same product-aware treatment applied to the admin-side journal view at
  `/admin/licenses/[id]/journal`. Same component, so it would pick this up
  for free — to be confirmed during implementation.
- A "Days remaining" mini-stat if and when `propfirm_rules.max_trading_days`
  becomes a hard window (currently soft).
- Email notifications when Loss Buffer crosses into red — explicitly out of
  scope; we only re-tint here.
