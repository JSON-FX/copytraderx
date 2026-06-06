# Prop-Firm Dashboard Polish — Design

**Date:** 2026-06-07
**Status:** Approved
**Scope:** Three related display improvements: (1) drawdown card on the prop-firm account dashboard, (2) site-wide $/% display mode including the Prop Firms overview page, (3) calendar day-click trades modal.

## Context

- The prop-firm dashboard (`components/dashboard/dashboard-objective.tsx`) shows Net P&L / Win Rate / Equity cards but no drawdown, while the Prop Firms page (`/dashboard/prop-firms`) shows a drawdown column (e.g. `-3.0%`). The non-prop dashboard (`DashboardKpiGrid`) already has a Max Drawdown card.
- A global $/% preference exists (`user_preferences` table, `getPnlDisplay`/`setPnlDisplay` in `lib/preferences/server.ts`, Settings page toggle), but `JournalChromeProvider` layers a per-license localStorage override on top, and the Prop Firms page hardcodes `fmtCash()`.
- Calendar day-click currently sets a URL hash (`#trades?date=YYYY-MM-DD`) to filter the journal trades table; there is no in-place way to inspect a day's trades.

## Decisions (from brainstorming)

1. Dashboard drawdown uses the **rule-based** figure (same as the Prop Firms page), not the trade-based equity-curve max drawdown.
2. Aggregate Total P&L % is **weighted**: `sum(pnl) / sum(account_size)`.
3. The per-license localStorage override is **removed** — the DB preference is the single source of truth site-wide.
4. Day-click opens a **modal**, with an "Open in Journal" footer link preserving the old filtered-journal path. Zero-trade days do nothing.
5. Approach: simplify in place (no provider-lifting refactor). Prop Firms page receives the mode as a server-fetched prop.

---

## 1. Drawdown card on the prop-firm dashboard

**Where:** `components/dashboard/dashboard-objective.tsx` — a 4th `KpiCard` in the left column, order: Net P&L → Win Rate → Equity → Drawdown.

**Data:** no new queries. `DashboardObjective` already receives `rule`, `snapshot`, `daily`, and `license` via `useAccountContext()`. It memoizes `evaluateObjectives()` (the same pure function `ChallengeProgressHero` uses) and mirrors `getPropFirmOverview`'s per-product logic exactly:

- **Challenge accounts** (`ctx-prop-passer`): `totalDrawdown = max(0, account_size − min(balance, equity))`; percent form is `totalDrawdown / account_size × 100`.
- **Funded accounts** (`ctx-prop-funded`): use `snapshot.drawdown_pct` (MT5-native), matching the Prop Firms table's funded rows. Cash form is `drawdown_pct / 100 × account_size`.

**Display:**

- % mode: headline `-3.0%`, subline `limit -10.0%` (total-loss threshold as % of account size).
- $ mode: headline `-$302.27`, subline `limit -$1,000.00`.
- Zero drawdown: `0.0%` (or `$0.00`), neutral tone.
- Tone (challenge accounts) reuses the hero's logic so card and badge never disagree: amber/negative when `totalDrawdown ≥ 70%` of the total-loss threshold (the WATCH condition), red when breached, otherwise neutral-negative.
- Tone (funded accounts): plain negative when drawdown > 0, neutral at 0 — no rule-threshold semantics, mirroring the Prop Firms page which doesn't breach-evaluate funded rows.

**Deliberate redundancy:** the hero's "Total Loss" bar already encodes this in $. The card adds the at-a-glance % treatment consistent with the other KPI cards; in % mode it is the only place the percentage appears on this page.

## 2. Site-wide $/% display mode

### Context simplification

`components/journal/preferences/journal-chrome-context.tsx`:

- Delete the localStorage hydration effect, `storageKey()`, and the `source` field / `PnlDisplaySource` type.
- `setMode(v)` optimistically updates local state and calls the existing `updatePnlDisplay` server action (`app/dashboard/settings/actions.ts`). On action failure, revert state (best-effort; no toast required).
- Stale `journal:pnl-display:*` localStorage keys are ignored; no cleanup pass.
- `usePnlDisplay()` public shape becomes `{ mode, setMode }`.

Consumers (`DashboardKpiGrid`, `DashboardObjective`, `TradesTable`, `TradeCalendar`, `JournalToolbar`) need no logic changes beyond `JournalToolbar` dropping the amber "overridden" badge. The toolbar `%/$` segment remains as a remote control for the global setting, equivalent to the Settings toggle.

The existing guard in `AccountProvider` (`lib/hooks/use-account-context.tsx:59`) stays: accounts with `baseline.source === null` force `"dollar"` locally, since percent has no denominator. This local forcing does not write to the DB.

`components/journal/preferences/use-pnl-display.test.tsx` updates to cover: no localStorage read, `setMode` invokes the server action, optimistic update + revert on failure.

### Prop Firms page

`app/dashboard/prop-firms/page.tsx` (server component) fetches `getPnlDisplay(user.id)` alongside the overview and passes `mode: PnlDisplay` as a prop to `PropFirmSummaryStrip` and `PropFirmTable`.

`lib/prop-firm-data.ts` changes:

- `PropFirmOverview` gains `totalAccountSize: number` — the sum of `rule.account_size` over exactly the non-breached rows whose `pnl` is added to `totalPnl`. Rows without a rule contribute 0 to both.
- `PropFirmRow` gains `accountSize: number | null` (`rule?.account_size ?? null`).

Display rules:

- **Total P&L card** (`PropFirmSummaryStrip`): in % mode, `totalPnl / totalAccountSize × 100` formatted with `fmtPct`; if `totalAccountSize === 0`, fall back to `fmtCash`. In $ mode, unchanged.
- **P&L column** (`PropFirmTable`): in % mode, per-row `pnl / accountSize × 100`; rows with `accountSize` null or 0 fall back to cash. In $ mode, unchanged.
- Absolutes (equity, balance) remain cash everywhere, matching the dashboard convention. The Drawdown column is already %.
- The Challenge Progress hero keeps its `$ / $` threshold rows — rule thresholds are out of scope.

## 3. Calendar day-trades modal

### Interaction

`components/journal/tabs/calendar-tab.tsx` replaces the hash-navigation `onDayClick` with local state `selectedDate: string | null`. Clicking a day with ≥1 trade opens the modal; zero-trade days do nothing (guard on the day's trade count from the calendar aggregate). No data fetching: the day's deals are filtered in memory from `deals` using the same date-keying as `aggregateCalendar()` (`lib/journal/calendar-aggregate.ts`), so the modal list always matches the cell's count.

### New component: `DayTradesModal`

`components/journal/day-trades-modal.tsx`, built on the existing Radix `Dialog` (`components/ui/dialog.tsx`).

- **Props:** `date: string`, `deals: Deal[]` (pre-filtered to the day), `currency`, `baseline`, `open`, `onOpenChange`, `journalHref`.
- **Header:** formatted date ("Mon, Jun 1 2026") + summary line: day net P&L (respects $/% mode via `fmtPctOrCash`), trade count, W/L split — same numbers as the calendar cell.
- **Table:** slim variant of the journal table reusing existing primitives — `useTableState` (`components/journal/filters/use-table-state.ts`), `applyTradeFilters` (`lib/journal/trade-filters.ts`), `Pagination` (`components/journal/filters/pagination.tsx`):
  - Columns: Closed (time), Symbol, Side, Vol, Entry, Exit, Pips, P/L (P/L respects $/% mode).
  - Search: ticket or symbol.
  - Sort: any column via header click; default closed time **ascending** (chronological reading of the day).
  - Pagination: default 10/page.
  - No outcome/side filter chips — search + sort suffices for a single day.
- **Footer:** "Open in Journal →" link to `/dashboard/[id]/journal#trades?date=YYYY-MM-DD` (today's day-click behavior), closing the modal on navigate.
- **Empty search state:** "No trades match" row. ESC / overlay / X close, focus trap, and a11y labeling come from Radix.

**Implementation note:** the visual build of the modal and drawdown card goes through the `frontend-design` skill (user request), staying within the existing dark dashboard aesthetic.

## Error handling

- All three features are display-layer; data is already fetched/polled by existing providers. No new failure modes beyond:
  - `setMode` server-action failure → revert optimistic state.
  - Missing rule/snapshot on the dashboard → `DashboardObjective` only renders when a rule exists; the drawdown card renders `—` if `snapshot` is null (same as Equity card's 0-fallbacks today).
  - `totalAccountSize`/`accountSize` of 0 or null → cash fallback (never divide by zero).

## Testing

- Unit: weighted-% math and per-row % fallback in `lib/prop-firm-data.ts`; drawdown source selection (passer vs funded) for the dashboard card.
- Component: updated `use-pnl-display.test.tsx` (simplified context, server-action persistence); `DayTradesModal` open/close, day filtering matches `aggregateCalendar` keying, search/sort/pagination, zero-trade-day no-op.

## Out of scope

- Challenge Progress hero threshold rows staying in $.
- Provider-lifting refactor (`DisplayModeProvider` at dashboard layout) — revisit if more account-agnostic pages need live mode toggling.
- Avg Win Rate card on the Prop Firms page (currently `—`, pre-existing).
- `WeeklyCalendarMini` on the dashboard — modal applies to the full calendar page only.
