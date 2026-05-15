# User Journal Redesign — Design

**Date:** 2026-05-15
**Status:** Draft (pending user review)
**Owner:** Jayson
**Affects:** `/dashboard/licenses/[id]` (also reachable from `/admin/licenses/[id]/journal`)

## Goal

Transform the user-facing trading journal from a functional-but-raw set of
unfiltered tables into a modern, interactive journal that still reads as
"easy to understand". Three concrete problems today:

1. The tables (Trades, Orders, Open Positions) have no filtering, no
   sorting, no pagination, no search.
2. The visual treatment across tabs is inconsistent — Orders shows raw enum
   strings like `order_type_buy_stop` / `order_state_filled`, the Calendar
   shows day P/L in `$`, the Performance tab is a wall of equal-weight tiles,
   the Overview tab is just an empty open-positions table.
3. There is no global preference for `%` vs `$` display, even though the
   primary trading audience naturally thinks in % of starting balance.

The redesign is **scoped to the user-facing journal** — admin pages are out
of scope.

## Non-goals

- Replacing the data layer or polling model. `useJournalPoll` and the
  existing `/api/journal/<acct>/...` endpoints stay as-is.
- Adding new data sources. The redesign uses only existing tables:
  `account_snapshots_current`, `account_snapshots_daily`, deals, orders,
  positions, propfirm_rules.
- Real-time intraday charts. The equity curve continues to use the daily
  snapshot series.
- Server-side pagination. Datasets are small enough (one user / one
  account / handful of trades per day) that client-side pagination is
  sufficient and avoids URL state complexity.
- Admin views. `/admin/licenses/[id]/journal` reuses the same shell but is
  not the design target of this work.
- Mobile-first redesign. Tables horizontally scroll on narrow viewports;
  card-collapse for mobile is deferred.
- Email / notification surfaces for rule breaches. The Objectives tab is
  the surface; alerting is not in this scope.

## Locked design decisions

| Area | Decision |
|---|---|
| Visual direction | **Side-rail + pill** (recommended Option B during brainstorm) — coloured 3px rail on each trade/order row, pill-styled BUY/SELL/state badges, generous row padding, soft tints. Not dense, not playful. |
| Default P/L display | `%` of starting balance. `$` is the alternate, toggleable. |
| Toggle UX | **Global default** in user settings + **per-journal session override** in the page toolbar. Override persists in `localStorage`, scoped per `licenseId`. Override does *not* write back to the global setting. |
| % baseline | `propfirm_rules.account_size` if license has a rule; otherwise the earliest `account_snapshots_daily.balance_close` for that account; otherwise current balance (rare fallback, disables `%` toggle until a daily snapshot exists). |
| Scope | Full journal: header, live account panel, all 6 tabs (Overview, Trades, Calendar, Performance, Orders, Objectives). |
| Pagination | Classic page numbers, default **25 per page**, selector for 10/25/50/100. Client-side. |
| Mobile | Horizontal scroll on tables. No card-collapse this pass. |
| Information architecture | **Keep the existing 6 tabs**; modernize each in place. Overview becomes a richer "landing" tab; the others are deep-dives. |
| Profit Factor | Stays dimensionless (e.g. `0.57`). Neither % nor $. |
| $ peek | Every `%` cell has a hover tooltip with the `$` equivalent, and vice versa. |

## High-level layout

```
┌─ Breadcrumb: ← Licenses ─────────────────────────────────────────┐
│ MT5 · #16005689         [Active] [Yearly] [LIVE] [● Online · 2m] │
│ Raw Trading Ltd · CTXL-…                                          │
├──────────────────────────────────────────────────────────────────┤
│ ┌─Net Return─┐ ┌─Equity─┐ ┌─Floating P/L─┐ ┌─Drawdown─┐          │  ← KPI cards
│ │ −3.51% ▼   │ │$314.90 │ │ 0.00% / $0.00│ │  3.51%  ▼│          │     with area-strip
│ │ −$36.41    │ │±0.0%   │ │ 0 open       │ │  $11.40  │          │     sparkline footer
│ │ ╲___ chart│ │  chart │ │              │ │   chart  │          │
│ └────────────┘ └────────┘ └──────────────┘ └──────────┘          │
├──────────────────────────────────────────────────────────────────┤
│ Display: [%][$]   Range: [7d][30d][90d][All]      ● Live · 2m ago│  ← persistent toolbar
├──────────────────────────────────────────────────────────────────┤
│ [Overview] [Trades 7] [Calendar] [Performance] [Orders 12] [Obj.]│  ← tabs with counts
├──────────────────────────────────────────────────────────────────┤
│ … tab content …                                                  │
└──────────────────────────────────────────────────────────────────┘
```

## Page chrome

### Header
- Breadcrumb "← Licenses" linking back to the list.
- Title: `MT5 · #<account>` (24px, weight 700, letterspacing −0.01em). Subline: broker name · monospaced license key chip.
- Right side: status badges row — `Active` (emerald tint), tier badge (indigo), env badge (orange `LIVE`), and an `Online · 2m ago` badge with a small green pulse dot.

### KPI cards (Live Account Panel)
Four cards in a 4-column grid. Replaces today's Balance/Equity/Floating/Drawdown row.

| Card | Lead value | Subline | Sparkline strip |
|---|---|---|---|
| **Net Return** (lead/hero) | `−3.51%` (large, colour-coded) | `since start · −$36.41` | Daily cumulative return, red area fill |
| **Equity** | `$314.90` | `balance $314.90 · ±0.0%` | Daily equity, neutral slate area fill |
| **Floating P/L** | `0.00% / $0.00` | `0 open positions` | No chart (no intraday series) — strip omitted |
| **Drawdown** | `3.51%` | `peak → trough · $11.40` | Daily drawdown, red area fill |

Each card uses the **Option A area-strip** treatment from the brainstorm:
the sparkline lives in a dedicated 44px footer lane inside the card with a
soft top→bottom gradient fill that matches the card's tone. The value and
sub-text live in a clean top zone — chart never overlaps text.

If the daily series for a given metric is empty (e.g. first day of use),
the strip degrades to a flat horizontal slate line; no error state.
The Floating P/L card has no daily series in the data model, so its strip
is omitted (the card is shorter than the other three; the grid aligns to
the top edge).

### Account metadata strip
Directly below the KPI grid, a single inline row of muted slate metadata
preserves the secondary numbers currently shown under each card on the
old design:

`Margin $0.00 · Free $314.90 · Margin Level — · Leverage 1:500`

Separated by middots, slate-500, 12px. These four fields come from the
existing `AccountSnapshotCurrent` payload (`margin`, `free_margin`,
`margin_level`, `leverage`). No new query.

### Persistent toolbar
Sits between the KPI row and the tabs.

- Left: **Display** segment (`%` / `$`) and **Range** segment (`7d` / `30d` / `90d` / `All`). Both are visually segmented buttons, current state in solid slate-900.
- Right: live-age pill (`● Live · 2m ago`).

The `Range` scope applies to all tabs. The toolbar lives **inside** the
journal page (not in the global app chrome), because it controls journal
state.

### Tab nav
Same 6 tabs. Active tab gets a 2px bottom underline; inactive tabs are
muted slate. Trades and Orders show row counts as a small pill next to
their label.

## Tables (Trades, Orders, Open Positions)

All three share the same row anatomy and the same filter+pagination
chrome.

### Row anatomy
- **Side rail** (3px wide, 8px from top/bottom of cell) on the leftmost
  cell — green (`#10b981`) for buy, red (`#ef4444`) for sell, slate
  (`#cbd5e1`) otherwise.
- **Symbol** in bold weight.
- **Side / state** as a 6px-radius pill. Solid tints for resolved states
  (BUY, SELL, Filled, Canceled). Dashed-outline pills for pending /
  stop / limit order types (Buy Stop, Sell Limit, etc.), so an at-a-glance
  scan tells you which orders are still alive.
- **All numeric columns** right-aligned, `tabular-nums`.
- **P/L cell** shows the % first (colour-coded), with a tiny inline
  magnitude bar (38px wide × 4px tall) whose fill width is scaled to the
  largest absolute % in the current page. Right after the % is a hover
  tooltip with the `$` equivalent.
- Row hover: light slate-50 background.

### Filter chips
Above the table, below the table header.

- First chip: `All` with row count.
- Outcome / state chips next: `Wins`, `Losses` (Trades); `Filled`, `Canceled` (Orders).
- Then dropdown-style chips: `Symbol ▾`, `Side ▾` / `Type ▾`, `Range ▾`.
  These open a small popover for selection — single value or multi-select
  is per-chip; default is single value with a "Clear" entry.
- Search input on the right: free-text over ticket id + symbol.

The header summary line (e.g. "7 trades · net −3.51% · win rate 14%")
recomputes from the active filter — so clicking `Wins` shows just the
winning subset and the summary updates accordingly.

### Sortable headers
- Click any column header to sort. Default sort: time descending
  (`Closed` for Trades, `Setup` for Orders).
- Sort direction shown as a slate arrow next to the header label.

### Pagination footer
- Left: `Show [10/25/50/100] per page`
- Middle: `Showing M–N of T`
- Right: `‹ Prev` · numbered page buttons (current state in slate-900) · `Next ›`
- Selected page size persists in `localStorage` per `licenseId`.

### Per-table specifics

**Trades** — columns:
`Closed · Symbol · Side · Vol · Entry · Exit · Pips · P/L`

The previous design had `Profit · Comm · Swap` columns. The redesign
**drops `Comm` and `Swap` from the visible row** in favor of `Pips`. The
rationale: fee/swap values are rarely the headline of a trade review,
and on most rows they are zero or near-zero (see screenshots). The data
is not destroyed — it stays on the `Deal` payload and would surface in a
future row-detail drawer (out of scope here; see Deferred follow-ups).

**Orders** — columns:
`Setup · Symbol · Type · State · Vol Init · Vol Now · Price · Done`

Enum humanization (centralized in a `lib/journal/order-display.ts` helper):

```
order_type_buy        → "Buy"           (solid green pill)
order_type_sell       → "Sell"          (solid red pill)
order_type_buy_limit  → "Buy Limit"     (dashed green pill)
order_type_sell_limit → "Sell Limit"    (dashed red pill)
order_type_buy_stop   → "Buy Stop"      (dashed green pill)
order_type_sell_stop  → "Sell Stop"     (dashed red pill)
order_type_buy_stop_limit  → "Buy Stop Limit"   (dashed green)
order_type_sell_stop_limit → "Sell Stop Limit"  (dashed red)
order_type_close_by   → "Close By"      (slate pill)

order_state_filled    → "Filled"        (green pill)
order_state_canceled  → "Canceled"      (slate pill)
order_state_partial   → "Partial"       (amber pill)
order_state_placed    → "Pending"       (blue pill)
order_state_rejected  → "Rejected"      (red pill)
order_state_expired   → "Expired"       (slate pill)
```

Any unknown enum value falls back to a stripped, title-cased label
(`order_state_foo_bar` → "Foo Bar") and a neutral slate pill — never
breaks the UI.

**Open Positions** — columns:
`Symbol · Side · Vol · Open · Current · SL · TP · P/L`

No filter chips (typically a small live list). Subtle row pulse animation
when `current_price` or `profit` changes between polls.

### Empty states
- `No trades match this filter.` (dashed-border placeholder, no full card.)
- `No open positions.` (same.)
- `Waiting for first EA push…` for snapshots not yet received.

## Calendar tab

A daily P/L heatmap, one month per page, weeks as rows.

- 7 day-of-week columns + 1 **week-total column** on the right showing
  the week's net %.
- Each day cell shows the date number (top-left), then the day's net
  P/L (% by default) and the trade count.
- Tone tiers:
  - **Strong win** (`bg-emerald-200`, border `emerald-400`) — day P/L is
    in the top quartile of |%| for the visible month.
  - **Win** (`bg-emerald-50`, border `emerald-200`) — any positive day.
  - **No trades** (`bg-slate-50`, border `slate-100`).
  - **Loss** (`bg-red-50`, border `red-200`).
  - **Strong loss** (`bg-red-300`, border `red-500`).
- Weekends visually faded (opacity 0.45).
- Month navigation: `‹` / `›` chevrons + month title. Disabled "next" when on the current month.
- Click a day → switches to the Trades tab with a date filter pre-applied.
- Legend strip below the grid for the colour tiers.

## Performance tab

### Stat grid
Two rows of four tiles. First row features **Net Return as a hero**:

Row 1: `Net Return` (featured, gradient bg) · `Win Rate` · `Profit Factor` · `Expected Payoff`
Row 2: `Avg Win` · `Avg Loss` · `Best Trade` · `Worst Trade`

Each tile:
- Tiny uppercase label (10.5px slate-500).
- Lead value (20px, weight 700, colour-coded for P/L tiles).
- Subline with the $ equivalent and any useful context
  (`+$48.55 · May 15`, `1 win / 7 trades`, `$48.55 gross gain / $84.96 gross loss`).

### Equity curve
- Plot: cumulative % return since start, X = date, Y = %, with a dashed
  gridline at 0%. Negative region shaded slightly red, positive slightly
  green (light gradient fills). Existing data source:
  `account_snapshots_daily`.
- Toolbar inside the chart card: `%` / `$` segment + `7d` / `30d` / `All`
  range — independent of the page-level toolbar so users can scope the
  chart without rescoping the whole page. Initial state inherits from
  the page toolbar.

### Streaks + Histogram
Two cards side-by-side under the equity chart.

- **Streaks** — 3-up stat: Max Win Streak (green), Max Loss Streak (red),
  Current streak (slate, with `win` / `loss` label).
- **Per-trade P/L distribution** — small histogram (~90px tall). Bins
  spaced from the worst trade % to the best trade % in the visible
  filter; bars coloured green/red by sign, slate near zero. No precise
  axis labels — just min / 0 / max under the bars.

## Objectives tab

### Status banner
A coloured banner at the top of the tab. Three states map to three styles:

| Status | Style | Icon |
|---|---|---|
| `passed` | emerald bg / a7f3d0 border | `✓` |
| `failed` | red bg / fecaca border | `✕` |
| `in_progress` | amber bg / fde68a border | `!` |

The banner's detail line summarizes context:
`In Progress · Profit target not yet hit · 5 / 10 trading days complete · no rule breaches`.

### Objective cards
A 3-column grid. One card per active limit/target on the assigned rule.
**A card is omitted entirely if the corresponding rule field is null /
zero / not configured** (e.g., no daily loss limit → no card).

Each card:
- Top row: name (slate caps label) + state pill on the right —
  `Safe` (green) / `Watch` (amber) / `Below` (amber) / `Breach` (red).
- Lead value: current % (e.g. `−3.51%`).
- Subline: limit / target in % and $ (`limit −5.00% · $500 cash`).
- Progress meter: 6px tall, colour follows state.
- Tick labels under the meter (`0% — −5% breach`) so the limit is explicit.

The three cards align to the existing `evaluateObjectives` outputs:
`profitTarget`, `dailyLoss`, `totalDrawdown` (from `lib/journal/objectives.ts`).

### Trading days footer
A muted footer line below the cards:
`Trading days: 5 of min 10 — need 5 more days with at least one closed trade to qualify.`

Hidden if the rule has neither `min_trading_days` nor `max_trading_days`.

### No-rule state
If the license has no propfirm rule assigned, the tab shows the existing
dashed-border placeholder with the "Assign rule" admin link.

## Overview tab

The default-landing tab. No longer just an open-positions table.

Layout: two-row grid.

**Row 1** (split 1.4 : 1):
- **Hero card** (gradient bg) — Net Return (38px lead, sparkline beside),
  three mini-stats below the divider (`Win Rate`, `Best Day`, `Worst Day`).
- **Challenge Status card** — same meters as Objectives but in mini
  form: each rule shown as a label-value pair plus a 6px meter, ending
  with a "Trading days" mini row and a `Go to Objectives →` link. Hidden
  entirely if no rule is assigned (replaced with the existing assign-rule
  placeholder).

**Row 2** (split 1 : 1):
- **Recent Trades** — last 5 closed deals, same row anatomy as the Trades
  tab (side-rail, pill, % P/L). "View all (7) →" link in the header
  switches to the Trades tab.
- **Open Positions** — current positions list, same row anatomy. Empty
  state is the standard dashed placeholder.

## % / $ system

### Data model
- New table `user_preferences`:
  - `user_id uuid primary key references auth.users on delete cascade`
  - `pnl_display text not null default 'percent' check (pnl_display in ('percent','dollar'))`
  - `created_at timestamptz default now()`
  - `updated_at timestamptz default now()`

  The schema lives in a separate Supabase repo (the same pattern used by
  the trial-tier migration `2026-05-15-trial-tier-migration.sql`). The
  implementation plan ships the migration `.sql` to that repo and the
  application code in this repo together. RLS: user can `select` /
  `upsert` their own row (`auth.uid() = user_id`); admin role bypasses.

- New helper `lib/preferences/server.ts` exposes `getPnlDisplay(userId)`,
  returning `'percent'` as the default when no row exists. The helper is
  used by the journal page's server component to seed the
  `JournalChromeContext`.

### Settings UI
- New route `/dashboard/settings` — confirmed not present in the current
  codebase (the `/dashboard` tree today is `layout.tsx`, `page.tsx`, and
  `licenses/`). This redesign adds the route with a single "Preferences"
  section.
- One segmented control: **Show P/L as** `%` (default) / `$`.
- Save is optimistic; persists on toggle change via an `upsert` into
  `user_preferences` from a server action.
- Add a "Settings" entry to the user-side nav (parallel to the existing
  admin site nav).

### Per-journal override
- The page-toolbar `%` / `$` segment is initialized from the user's
  global preference on first render.
- Toggling writes to `localStorage` key `journal:pnl-display:<licenseId>`.
- That key wins over the global preference on subsequent renders **of
  the same journal**. Visiting a different journal starts from the global
  preference again.
- Clearing the override (no UI affordance in v1 — manual `localStorage`
  edit or browser clear) reverts to the global preference.

### Baseline resolution
Server-side, once per page load:

```ts
function resolveBaseline(license, rule, daily, snapshot): {
  baseline: number;
  source: 'rule' | 'first_daily' | 'current' | null;
}
```

- If `rule?.account_size`, return `{ baseline: rule.account_size, source: 'rule' }`.
- Else if `daily.length > 0`, return `{ baseline: daily[0].balance_close, source: 'first_daily' }`.
- Else if `snapshot?.balance`, return `{ baseline: snapshot.balance, source: 'current' }`.
- Else return `{ baseline: 0, source: null }` — `%` toggle disabled with tooltip "Baseline not available — waiting for first daily snapshot".

`daily[0]` here is the chronologically earliest row, not array index zero
of the descending-sorted client array. The query in `getAccountSnapshotsDaily`
already returns ascending order; if that ever changes, this helper must
re-sort.

### Conversion scope

Converts to `%` (with `$` in tooltip):
- Per-trade P/L on Trades and Recent Trades.
- Per-position floating P/L on Open Positions.
- All Performance stats except Profit Factor: Net Return, Avg Win, Avg
  Loss, Best Trade, Worst Trade, Expected Payoff.
- KPI cards: Net Return, Floating P/L, Drawdown.
- Calendar day cells and week totals.
- Equity Curve Y-axis (when toggle = `%`).
- Objectives card values and ticks.

Stays in native units (no `%` toggle effect):
- Prices: Entry, Exit, SL, TP, Open, Current.
- Volume (lots).
- Pips.
- Commission, Swap.
- Equity card lead value stays in `$` (it's the literal account balance).
- Profit Factor (dimensionless ratio).

### Formatting

```ts
fmtPct(n: number): string
// Always 2 decimals, signed with en-dash for negatives, percent sign.
// Examples: '+3.51%', '−3.51%', '0.00%'.

fmtCash(n: number, currency: string): string
// Existing Intl.NumberFormat behavior, unchanged.

fmtPctOrCash(n: number, mode: 'percent'|'dollar', baseline: number, currency: string): string
// Convenience wrapper. If mode === 'percent' and baseline > 0,
// returns fmtPct(n / baseline * 100). Else returns fmtCash(n, currency).
```

Tooltip: every `%` cell hovers to show the `$` equivalent in the
formatted currency. Every `$` cell hovers to show the `%`. Implemented
via existing tooltip primitives — no new dependency.

## Architectural notes

### File / component boundaries

The current `components/journal/` tree is a good starting point. Proposed
adjustments:

```
components/journal/
  journal-shell.tsx              ← preserves polling, hosts new chrome
  journal-header.tsx             ← keep, polish badge styling
  live-account-panel.tsx         ← rebuild as 4-card KPI grid
  journal-toolbar.tsx            (new) display + range + age pill
  kpi-card.tsx                   (new) value + subline + area-strip footer
  sparkline.tsx                  (new) shared area-strip primitive
  filters/
    filter-chip.tsx              (new) generic chip + popover
    table-filters.tsx            (new) shared chip strip for Trades/Orders
    filter-search.tsx            (new) free-text input
    pagination.tsx               (new) shared pager footer
    use-table-state.ts           (new) sort + filter + page state hook
  tables/
    trades-table.tsx             ← rebuild from deals-table.tsx
    orders-table.tsx             ← rebuild, with humanization helper
    positions-table.tsx          ← rebuild from open-positions-table.tsx
    row-rail.css                 (new) shared side-rail styles
    side-pill.tsx                (new) BUY/SELL pill primitive
    state-pill.tsx               (new) order-state pill primitive
  tabs/
    overview-tab.tsx             ← rebuild as hero + recent + positions
    trades-tab.tsx               ← thin wrapper around trades-table + state
    calendar-tab.tsx             ← rebuild as heatmap with week totals
    performance-tab.tsx          ← rebuild grid + chart card + extras
    orders-tab.tsx               ← thin wrapper around orders-table + state
    objectives-tab.tsx           ← rebuild as banner + card grid
  preferences/
    use-pnl-display.ts           (new) resolves global pref + local override
lib/
  journal/
    baseline.ts                  (new) resolveBaseline helper
    order-display.ts             (new) humanize enum + pill variant
    format-pnl.ts                (new) fmtPct / fmtCash / fmtPctOrCash
    histogram.ts                 (new) bin per-trade P/L for Performance
```

Existing helpers (`calendar-aggregate`, `trade-stats`, `streaks`,
`objectives`) stay where they are. Each is consumed by the rebuilt tabs.

### State management

- All table filter / sort / page state lives in `useTableState` per
  table (Trades, Orders). State stays in URL search params so a filtered
  view can be linked and reloaded:
  `?tab=trades&filter=wins&symbol=GBPUSD&sort=closed_desc&page=2&size=25`.
- Display mode (`%`/`$`) and range scope live on a small page-level
  context (`JournalChromeContext`) initialized from preferences +
  localStorage. Tabs read from it.

### Reuse of existing data

No new API endpoints. Existing endpoints:

- `GET /api/journal/<acct>/snapshot` → `AccountSnapshotCurrent`
- `GET /api/journal/<acct>/positions` → `Position[]`
- `GET /api/journal/<acct>/deals?days=N` → `Deal[]`
- `GET /api/journal/<acct>/orders?days=N` → `OrderRow[]`
- `GET /api/journal/<acct>/snapshots-daily?days=N` → `AccountSnapshotDaily[]`

The page toolbar's `Range` selector maps to the `days` query param on
fetches (`7`, `30`, `90`, `0` for All). Today these are hard-coded to
`days=0`; the redesign threads the selected range through.

### Migration

One new migration delivered as a `.sql` file in
`docs/superpowers/plans/` (the same pattern as the trial-tier
migration), to be applied in the separate Supabase repo:

- `create table public.user_preferences (...)` with the columns listed
  above.
- RLS policies for self-select and self-upsert.
- No data backfill — the table is empty until users interact with the
  Preferences page; the server helper defaults to `'percent'` when no
  row exists.

## Testing

- Unit: `lib/journal/baseline.ts` resolves the three sources in priority order; returns null source when none apply.
- Unit: `lib/journal/order-display.ts` maps every known MT5 enum variant and falls back to title-case for unknown values without throwing.
- Unit: `lib/journal/format-pnl.ts` formats positive / negative / zero correctly with the en-dash and signed-percent rules.
- Component: filter-chip popover opens, single-select works, "Clear" entry resets.
- Component: pagination state persists across re-renders via `useTableState`; URL params reflect state.
- Component: `usePnlDisplay` returns local override when present, falls back to global pref, falls back to `'percent'`.
- E2E (Playwright, existing infrastructure): smoke test that opens a user journal, switches tabs, filters trades to "Wins", paginates orders, toggles `%` → `$`, and confirms expected values appear. Assertion-light; primarily exercise paths.

## Out of scope (deferred follow-ups)

- Card-collapse layout for tables on mobile viewports.
- Row-click detail drawer for a trade (would surface dropped Comm/Swap,
  ticket id, magic, comment).
- Trade tagging / notes (annotation system).
- Account comparison (multi-account overlays on the equity curve).
- Server-side pagination, cursor-based fetching.
- Public share links / read-only mode for the journal.
- Real-time intraday equity stream (the EA does not push intraday yet).
- Alerting / notifications when an objective enters Watch or Breach.
- A column-visibility "Columns ▾" picker on the tables.

## Open questions

None at spec time. All clarifying questions were resolved during
brainstorming.
