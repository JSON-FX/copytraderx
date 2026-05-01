# Journal Integration — Design Spec

**Date:** 2026-05-02
**Branch:** `feat/journal-integration` (developed in a sibling worktree at `../copytraderx-license-journal`)
**Status:** Draft, pending user review

---

## 1. Goal

Bring MetaTrader Journal's core trade-analytics surface (live account panel, open positions, closed deals, calendar, performance, propfirm objectives) into CopyTraderX as a per-license drill-down. Replace MTJ's Flask-on-a-VPS bridge with the existing EA → Supabase pipeline already used for license validation. The EA — running on each customer's MT5 terminal — becomes the sole writer of trade journal data; CopyTraderX is read-only on these tables.

Backtesting and live TradingView/candlestick charts are out of scope.

## 2. Architecture

```
┌────────────────────┐    OnTimer (3–60s)    ┌─────────────────────────┐
│  EA on MT5         │ ───────────────────▶  │  Supabase (existing)    │
│  (Impulse / CTX*)  │   POST publish-       │                         │
│                    │   journal (HMAC-      │  • licenses (existing)  │
│  + JournalPublisher│    signed Edge Fn)    │  • account_snapshots_   │
│    .mqh module     │                       │      current  (UPSERT)  │
│                    │                       │  • account_snapshots_   │
│                    │                       │      daily    (UPSERT)  │
│                    │                       │  • positions  (REPLACE) │
│                    │                       │  • deals      (APPEND)  │
│                    │                       │  • orders     (APPEND)  │
│                    │                       │  • propfirm_rules       │
└────────────────────┘                       └────────▲────────────────┘
                                                      │ read (SSR + 3–60s poll)
                                             ┌────────┴────────────────┐
                                             │  CopyTraderX Next.js    │
                                             │                         │
                                             │  /licenses (existing)   │
                                             │     row click ▶         │
                                             │  /licenses/[id]/journal │
                                             │     ├─ Overview tab     │
                                             │     ├─ Trades tab       │
                                             │     ├─ Calendar tab     │
                                             │     ├─ Performance tab  │
                                             │     ├─ Orders tab       │
                                             │     └─ Objectives tab   │
                                             │  /propfirm-rules        │
                                             └─────────────────────────┘
```

### Principles

- **EA is the only writer** of journal tables; CTX is read-only on them. Mirrors today's licenses split: admin writes via UI, EA writes telemetry.
- **CTX never talks to MT5.** No bridge, no polling MT5 directly. The "no VPS bridge" rule is enforced architecturally.
- **Per-license scoping by `mt5_account`.** Every journal row carries `mt5_account` (matches `licenses.mt5_account`); the journal page filters on it. EA only knows the account number, not the license id, so we don't introduce a license_id FK.
- **Same Supabase project, same auth model as license validation.** No new keys, no new infra, no new admin step (WebRequest whitelist already covers the host).
- **Cadence is two-sided:** EA push interval is per-license (column on `licenses`); CTX poll interval is global (localStorage in `/settings`).

## 3. Scope

### In-scope
- Live account panel (balance, equity, floating P/L, drawdown, margin)
- Open positions table
- Closed deals / trades history
- Raw orders history
- Trade calendar (daily P/L heatmap)
- Performance analytics (win rate, profit factor, streaks, equity curve, max DD)
- Propfirm rules CRUD + Objectives tab (challenge progress)
- Light / dark / system theme support
- Configurable polling on both sides

### Out of scope (deferred or dropped)
- Position-level candlestick chart (lightweight-charts) — deferred
- Backtest report library — dropped
- Live TradingView chart — deferred
- Multi-account compare / portfolio rollup
- CSV export
- Multi-user auth (CTX remains dev-only)

## 4. Data Model

All new tables live in the existing Supabase project alongside `licenses`. Migrations live in `~/Documents/development/EA/JSONFX-IMPULSE/supabase/migrations/` (single source of truth, applied with `supabase db push`).

```sql
-- 1. Live panel data. ONE row per account. Overwritten every push.
CREATE TABLE account_snapshots_current (
  mt5_account       BIGINT       PRIMARY KEY,
  balance           NUMERIC(18,2) NOT NULL,
  equity            NUMERIC(18,2) NOT NULL,
  margin            NUMERIC(18,2) NOT NULL,
  free_margin       NUMERIC(18,2) NOT NULL,
  margin_level      NUMERIC(10,2),               -- nullable when no positions
  floating_pnl      NUMERIC(18,2) NOT NULL,
  drawdown_pct      NUMERIC(8,4)  NOT NULL,
  leverage          INT           NOT NULL,
  currency          TEXT          NOT NULL,
  server            TEXT,
  pushed_at         TIMESTAMPTZ   NOT NULL       -- EA's push time, the freshness signal
);

-- 2. Equity curve. ONE row per account per UTC day. Upserted on every push so today is always current.
CREATE TABLE account_snapshots_daily (
  mt5_account       BIGINT       NOT NULL,
  trade_date        DATE         NOT NULL,       -- UTC date
  balance_close     NUMERIC(18,2) NOT NULL,
  equity_close      NUMERIC(18,2) NOT NULL,
  daily_pnl         NUMERIC(18,2) NOT NULL,      -- equity_close - prev day's equity_close
  PRIMARY KEY (mt5_account, trade_date)
);

-- 3. Open positions. EA replaces all rows for the account on each push (transactional).
CREATE TABLE positions (
  mt5_account       BIGINT       NOT NULL,
  ticket            BIGINT       NOT NULL,
  ea_source         TEXT         NOT NULL,       -- 'impulse' | 'ctx-core' | 'ctx-live' | 'ctx-prop-passer' | 'ctx-prop-funded'
  symbol            TEXT         NOT NULL,
  side              TEXT         NOT NULL,       -- 'buy' | 'sell'
  volume            NUMERIC(10,2) NOT NULL,
  open_price        NUMERIC(18,5) NOT NULL,
  current_price     NUMERIC(18,5) NOT NULL,
  sl                NUMERIC(18,5),
  tp                NUMERIC(18,5),
  profit            NUMERIC(18,2) NOT NULL,      -- unrealized
  swap              NUMERIC(18,2) NOT NULL,
  commission        NUMERIC(18,2) NOT NULL,
  open_time         TIMESTAMPTZ  NOT NULL,
  comment           TEXT,
  magic             BIGINT,
  PRIMARY KEY (mt5_account, ticket)
);

-- 4. Closed deals (paired round-trips). Append-only.
CREATE TABLE deals (
  mt5_account       BIGINT       NOT NULL,
  ticket            BIGINT       NOT NULL,       -- position_id (pairs in/out)
  ea_source         TEXT         NOT NULL,
  symbol            TEXT         NOT NULL,
  side              TEXT         NOT NULL,
  volume            NUMERIC(10,2) NOT NULL,
  open_price        NUMERIC(18,5) NOT NULL,
  close_price       NUMERIC(18,5) NOT NULL,
  sl                NUMERIC(18,5),
  tp                NUMERIC(18,5),
  open_time         TIMESTAMPTZ  NOT NULL,
  close_time        TIMESTAMPTZ  NOT NULL,
  profit            NUMERIC(18,2) NOT NULL,      -- realized P/L
  commission        NUMERIC(18,2) NOT NULL,
  swap              NUMERIC(18,2) NOT NULL,
  comment           TEXT,
  magic             BIGINT,
  PRIMARY KEY (mt5_account, ticket)
);
CREATE INDEX deals_account_close_time_idx ON deals (mt5_account, close_time DESC);

-- 5. Raw orders. Append-only. Powers the Orders tab + audit.
CREATE TABLE orders (
  mt5_account       BIGINT       NOT NULL,
  ticket            BIGINT       NOT NULL,
  ea_source         TEXT         NOT NULL,
  symbol            TEXT         NOT NULL,
  type              TEXT         NOT NULL,       -- buy/sell/buy_limit/sell_limit/...
  state             TEXT         NOT NULL,       -- placed/filled/cancelled/expired/...
  volume_initial    NUMERIC(10,2) NOT NULL,
  volume_current    NUMERIC(10,2) NOT NULL,
  price_open        NUMERIC(18,5),
  price_current     NUMERIC(18,5),
  sl                NUMERIC(18,5),
  tp                NUMERIC(18,5),
  time_setup        TIMESTAMPTZ  NOT NULL,
  time_done         TIMESTAMPTZ,
  comment           TEXT,
  magic             BIGINT,
  PRIMARY KEY (mt5_account, ticket)
);
CREATE INDEX orders_account_time_setup_idx ON orders (mt5_account, time_setup DESC);

-- 6. Propfirm rule presets. Admin-managed via CTX UI.
CREATE TABLE propfirm_rules (
  id                 SERIAL       PRIMARY KEY,
  name               TEXT         NOT NULL,
  account_size       NUMERIC(18,2) NOT NULL,
  max_daily_loss     NUMERIC(18,4) NOT NULL,
  daily_loss_type    TEXT         NOT NULL,        -- 'money' | 'percent'
  daily_loss_calc    TEXT         NOT NULL,        -- 'balance' | 'equity'
  max_total_loss     NUMERIC(18,4) NOT NULL,
  total_loss_type    TEXT         NOT NULL,
  profit_target      NUMERIC(18,4) NOT NULL,
  target_type        TEXT         NOT NULL,
  min_trading_days   INT          NOT NULL DEFAULT 0,
  max_trading_days   INT,
  created_at         TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- 7. Two new columns on the existing licenses table.
ALTER TABLE licenses ADD COLUMN push_interval_seconds INT NOT NULL DEFAULT 10;
ALTER TABLE licenses ADD COLUMN propfirm_rule_id INT REFERENCES propfirm_rules(id) ON DELETE SET NULL;
```

### Schema notes

- **Why `mt5_account` and not `license_id` as FK?** The EA only knows the account number; `licenses.mt5_account` is unique per row, so joining is straightforward and saves the EA a lookup roundtrip.
- **`positions` replace semantics.** Every push: `BEGIN; DELETE FROM positions WHERE mt5_account=$1 AND ea_source=$2; INSERT INTO positions ...; COMMIT;` Single transaction so the table is never empty mid-write.
- **`account_snapshots_daily` rollover.** EA upserts today's row on every tick (cheap; one row touched). When `today UTC` advances, EA writes a new key, leaving yesterday's final row immutable. No scheduled job required.
- **`ea_source` on positions/deals/orders.** Tracks which EA produced each row. Useful for filtering, audit, and detecting EA swaps on the same MT5 account. Not added to `account_snapshots_current` since only one EA's snapshot wins per account anyway (last write wins).
- **Time zones.** All timestamps stored UTC (`TIMESTAMPTZ`). EA pushes UTC explicitly via `TimeGMT()`. CTX renders in browser local time using `date-fns-tz`. Calendar groups by UTC date to match daily snapshot rollover.
- **Money & price precision.** `NUMERIC(18,2)` for currency, `NUMERIC(18,5)` for prices.
- **RLS.** All new tables get RLS enabled but only the service-role key (used by CTX server-side) and the `publish-journal` Edge Function (which uses the service role internally) can read/write. Mirrors the existing `licenses` setup.

## 5. EA Changes

A new module, `JournalPublisher.mqh`, lands in **5 places** (Impulse + Volt's 4 variants). The Impulse copy is the canonical implementation; the 4 Volt copies must be kept diff-clean except for one constant: `EA_SOURCE_TAG`.

```
JSONFX-IMPULSE/Include/CopyTraderX-Impulse/JournalPublisher.mqh   ← canonical
volt/Include/CTX-Core/JournalPublisher.mqh                        ← copy
volt/Include/CTX-Live/JournalPublisher.mqh                        ← copy
volt/Include/CTX-Prop-Passer/JournalPublisher.mqh                 ← copy
volt/Include/CTX-Prop-Funded/JournalPublisher.mqh                 ← copy
```

| EA | EA_SOURCE_TAG | License key prefix | State file |
|---|---|---|---|
| Impulse | `impulse` | `IMPX-` | `impulse_journal_state.dat` |
| CTX-Core | `ctx-core` | `CTX-` | `ctx_core_journal_state.dat` |
| CTX-Live | `ctx-live` | `CTX-` | `ctx_live_journal_state.dat` |
| CTX-Prop-Passer | `ctx-prop-passer` | `CTX-` | `ctx_prop_passer_journal_state.dat` |
| CTX-Prop-Funded | `ctx-prop-funded` | `CTX-` | `ctx_prop_funded_journal_state.dat` |

Extracting a shared `Common/` directory between Impulse and Volt is a larger refactor and explicitly out of scope for this branch.

### Module surface

```mql5
class CJournalPublisher {
public:
    bool Init(long mt5_account, string ea_source_tag);
    void OnTimer();
    void OnTradeTransaction(const MqlTradeTransaction& trans,
                            const MqlTradeRequest& request,
                            const MqlTradeResult& result);
    void Shutdown();

private:
    long m_mt5_account;
    string m_ea_source;
    int m_push_interval_sec;
    datetime m_last_account_push;
    datetime m_last_positions_push;
    ulong m_last_pushed_deal_ticket;
    ulong m_last_pushed_order_ticket;
    bool m_backfill_done;

    void PushAccountSnapshot();
    void UpdateDailySnapshot();
    void ReplacePositions();
    void PushNewDeals();
    void PushNewOrders();
    void Backfill90Days();
    int  ReadPushInterval();
    bool PostJournal(string payload_type, string body);
};
```

### Wiring into `EACore.mqh`

```mql5
// OnInit — after license is validated:
g_journal.Init(acct, "impulse");      // or "ctx-core", etc.

// OnTimer — license keeps its 12h internal throttle, journal does its own elapsed-time check:
g_license.OnTimer();
g_journal.OnTimer();

// OnTradeTransaction — fires immediately when a trade closes:
g_journal.OnTradeTransaction(trans, request, result);

// OnDeinit:
g_journal.Shutdown();
```

### Timer cadence

`EventSetTimer(60)` is replaced with `EventSetTimer(1)`. The 1-second tick is cheap (no I/O unless an interval has elapsed) and is required to support the 3-second journal cadence. License re-validation keeps its existing 12-hour internal throttle, unaffected.

### Authentication: `publish-journal` Edge Function

A new Supabase Edge Function `publish-journal` accepts:

```json
{
  "license_key": "IMPX-...",
  "mt5_account": 12345,
  "ea_source": "impulse",
  "payload_type": "snapshot|positions|deals|orders|daily",
  "payload": { ... },
  "signature": "base64(HMAC-SHA256(payload_string))"
}
```

The function:
1. Verifies HMAC against `LICENSE_HMAC_KEY` (same secret used by `validate-license`).
2. Confirms `mt5_account` matches the account on the license row identified by `license_key` (prevents one license from writing to another's data).
3. Performs the insert / upsert / replace using the service-role key (server-side only).

The EA carries only the anon key + HMAC key — same trust model as today. The service-role key never leaves Supabase. WebRequest whitelist already covers the Supabase host.

### Backfill behavior

On `Init()`, the EA reads `MQL5/Files/<ea_source>_journal_state.dat`. If absent or unparseable, it triggers a one-time `Backfill90Days()`:

1. `HistorySelect(TimeCurrent() - 90*86400, TimeCurrent())`
2. Iterate closed deals → batch `publish-journal` calls (chunks of 100 to stay under request size limits)
3. Iterate historical orders → same
4. Write state file with `last_pushed_deal_ticket` and `last_pushed_order_ticket` set to the highest ticket seen

Subsequent runs only push deals/orders with ticket > stored value. Backfill is idempotent because all inserts use `ON CONFLICT (mt5_account, ticket) DO NOTHING`.

### State persistence

```json
{
  "last_pushed_deal_ticket": 1234567,
  "last_pushed_order_ticket": 9876543,
  "backfill_done_at": "2026-05-02T12:34:56Z"
}
```

Stored at `MQL5/Files/<ea_source>_journal_state.dat`. If deleted, EA re-runs backfill safely.

### `LicenseConfig.mqh` additions

```mql5
#define EA_SOURCE_TAG          "impulse"   // (or the appropriate value per EA)
#define JOURNAL_PUBLISH_URL    "https://mkfabzqlxzeidfblxzhq.supabase.co/functions/v1/publish-journal"
```

## 6. CTX UI

### Routes

```
/licenses                                ← existing list
/licenses/[id]/journal                   ← NEW: per-license drill-down
   ?tab=overview|trades|calendar|performance|orders|objectives
/settings                                ← extend: + journal polling interval (3/5/10/30/60s)
/propfirm-rules                          ← NEW: rule CRUD list
/propfirm-rules/new
/propfirm-rules/[id]
```

The license-table row gets one new affordance: clicking the row body navigates to `/licenses/[id]/journal`. Existing dropdown actions (Renew/Revoke/Delete) keep working unchanged.

### File layout

```
app/
├── licenses/
│   └── [id]/
│       └── journal/
│           ├── page.tsx                    ← server component, SSRs initial data
│           └── loading.tsx                 ← skeleton
├── propfirm-rules/
│   ├── page.tsx
│   ├── new/page.tsx
│   └── [id]/page.tsx
└── api/
    ├── journal/
    │   └── [mt5_account]/
    │       ├── snapshot/route.ts           ← GET account_snapshots_current
    │       ├── snapshots-daily/route.ts    ← GET account_snapshots_daily?days=90
    │       ├── positions/route.ts          ← GET positions
    │       ├── deals/route.ts              ← GET deals?from&to
    │       └── orders/route.ts             ← GET orders?from&to
    └── propfirm-rules/
        ├── route.ts                        ← list / create
        └── [id]/route.ts                   ← get / patch / delete

components/
├── journal/
│   ├── journal-shell.tsx
│   ├── journal-header.tsx                  ← liveness + data-age + mt5_account + broker
│   ├── live-account-panel.tsx
│   ├── tabs/
│   │   ├── overview-tab.tsx
│   │   ├── trades-tab.tsx
│   │   ├── calendar-tab.tsx
│   │   ├── performance-tab.tsx
│   │   ├── orders-tab.tsx
│   │   └── objectives-tab.tsx
│   ├── open-positions-table.tsx
│   ├── deals-table.tsx
│   ├── orders-table.tsx
│   ├── trade-calendar.tsx
│   ├── equity-chart.tsx                    ← recharts AreaChart
│   ├── stat-card.tsx
│   ├── streaks-table.tsx
│   └── data-age-indicator.tsx
├── propfirm-rules/
│   ├── rules-table.tsx
│   ├── rule-form.tsx
│   └── rule-progress.tsx                   ← used by ObjectivesTab
└── ui/
    ├── tabs.tsx                            ← shadcn add
    ├── tooltip.tsx                         ← shadcn add
    ├── progress.tsx                        ← shadcn add
    ├── skeleton.tsx                        ← shadcn add
    └── scroll-area.tsx                     ← shadcn add

lib/
├── journal/
│   ├── queries.ts                          ← Supabase fetchers (server-side)
│   ├── trade-stats.ts                      ← ported from MTJ
│   ├── streaks.ts                          ← ported
│   ├── calendar-aggregate.ts               ← ported
│   ├── objectives.ts                       ← propfirm rule evaluator
│   ├── data-age.ts                         ← deriveDataAge(pushed_at, push_interval_seconds)
│   └── types.ts
├── hooks/
│   ├── use-journal-poll.ts
│   └── use-data-age.ts
└── settings.ts                             ← extend with getJournalPollingInterval / setJournalPollingInterval
```

### Page header

Reuses CTX's existing `liveness-badge`, `tier-badge`, `status-badge`, plus a new `data-age-indicator` that ticks every second client-side and color-codes:

- green: age < 2× push interval
- amber: age < 4× push interval
- red: age ≥ 4× push interval

### Data fetching

- **SSR initial render** — the page's server component calls `lib/journal/queries.ts` directly (`getSupabaseAdmin()`); first paint is full data, no spinner. Same pattern as `app/licenses/page.tsx`.
- **Client polling** — `<JournalShell>` is a client component owning a single `useJournalPoll` hook that reads the user's interval from localStorage and fetches `/api/journal/[mt5_account]/*`. Cadence split:
  - `snapshot` + `positions` → user-configured (3/5/10/30/60s, default 10s)
  - `deals` + `orders` → fixed 30s
  - `snapshots-daily` → fixed 5 min
- **Pause on hidden tab** — `visibilitychange` pattern reused from license-table.
- **Effective rate cap** — hook caps poll rate at the EA's `push_interval_seconds` (read from the license row at SSR). Polling faster than the EA pushes is wasteful; tooltip on the data-age indicator explains the cap.

### Per-tab content

- **Overview** — Live account panel + open positions + quick stats (today's P/L, open count, today's trade count).
- **Trades** — sortable / filterable closed-deals table; pagination 50/page.
- **Calendar** — monthly grid (Sun–Sat), color-coded daily P/L, prev/next month nav, money/% toggle. Aggregated client-side from deals.
- **Performance** — equity curve (recharts AreaChart from `account_snapshots_daily`), KPI cards (win rate, profit factor, avg win/loss, expected payoff, max DD), streaks table.
- **Orders** — raw orders table; sortable, filterable by state.
- **Objectives** — only renders if `licenses.propfirm_rule_id IS NOT NULL`. Otherwise shows empty state: "No challenge rule assigned. [Assign rule]". Progress bars for: profit target, max daily loss, max total loss, trading days. Pass/fail status banner.

### Theming

- Add `next-themes` `<ThemeProvider attribute="class" defaultTheme="system">` to `app/layout.tsx`.
- Add a theme toggle (sun/moon/monitor icons via Phosphor) to `components/site-nav.tsx`.
- Tailwind v4's `dark:` prefix + shadcn neutral palette covers both modes.
- Recharts reads CSS variables; pass theme-aware fill/stroke via a `useTheme` hook.

### Loading / error states

- `loading.tsx` → skeletons matching final layout.
- API route errors → tab shows inline error card with "Retry"; live panel keeps last-known-good values.
- EA not pushing yet (no row in `account_snapshots_current`) → "Waiting for first EA push…" empty state.

## 7. Error Handling & Edge Cases

### EA-side

| Failure | Detection | Behavior | User-visible effect |
|---|---|---|---|
| `WebRequest` returns `-1` (network) | status code | log, exponential backoff (10s → 20s → 40s → cap 5 min), keep trading | Live panel goes stale; data-age indicator → amber → red |
| `4060` (URL not whitelisted) | error code 4060 | log clear "add Supabase host to MT5 → Tools → Options → Expert Advisors" | Same staleness, plus log message |
| Edge Function 4xx | status ≥ 400 | log payload + response, drop the chunk after 3 retries; advance state file past bad ticket | Specific deal/order missing; logged for triage |
| Edge Function 5xx | status ≥ 500 | retry with backoff, do not advance state file | Eventual consistency once backend recovers |
| State file corrupted / missing | JSON parse fail or invalid handle | re-run 90-day backfill (idempotent) | Slight CPU/network spike on next start; no data loss |
| `HistorySelect` returns nothing | `HistoryDealsTotal() == 0` | mark backfill done, set tickets to 0 | Empty journal until live trading starts |
| EA stopped / removed | no pushes | `account_snapshots_current.pushed_at` ages | Liveness badge + data-age reflect staleness |
| Two EAs attached to same MT5 account | both push | `ea_source` differs per row; both write | Acceptable but noisy; documented as unsupported |

### CTX-side

| Failure | Behavior |
|---|---|
| Supabase query error (server component) | Page renders skeleton + inline error card; shell still mounts so polling can recover |
| API route error (client poll) | Hook keeps last-known-good state; "reconnecting…" indicator. 3 consecutive failures → "connection lost" red dot, slow polling to interval × 4 until next success |
| `account_snapshots_current` empty | Live panel shows "Waiting for first EA push." Tabs that don't depend on snapshots still load |
| `mt5_account` doesn't exist in `licenses` | 404 with link back to `/licenses` |
| Polling interval changed in `/settings` | Hook re-reads localStorage on `storage` event (cross-tab) and on next tick (same tab) |
| Tab hidden | Pause polling; on visible, fire one immediate fetch then resume |
| EA push interval > CTX poll interval | Effective rate capped at EA push; tooltip explains |

### Data integrity rules

- **`positions` replace must be transactional.** Edge Function performs delete + bulk insert in a single transaction.
- **Deal/order pushes are append-only with `ON CONFLICT DO NOTHING`** — replays are safe.
- **`account_snapshots_current` upsert** keyed on `mt5_account`; last write wins. `pushed_at` is the freshness signal.
- **`account_snapshots_daily` upsert** keyed on `(mt5_account, trade_date)`; today's row gets cheap upserts on every tick.
- **`drawdown_pct`** is computed by the EA (it has the running peak balance/equity); CTX displays as-pushed.
- **Time zones.** All UTC; UI renders local. Calendar groups by UTC date.
- **Money formatting.** `Intl.NumberFormat` with the account's `currency` from the latest snapshot, not hardcoded.

### Security

- **Service-role key never leaves the CTX server** and is never embedded in the EA.
- **Anon key + HMAC secret in EA** is the same trust model as today's license validation.
- **`publish-journal` verifies HMAC on every call** and confirms `mt5_account` matches the license owner.
- **No RLS-public access.** New tables are service-role-only; browser never touches Supabase directly.

### Migration / rollout order

1. Apply schema migrations (`supabase db push`) — new tables, new license columns.
2. Deploy `publish-journal` Edge Function.
3. Update Impulse + one Volt variant (CTX-Core) first; deploy to test accounts.
4. Verify end-to-end against the 3-account checklist.
5. Roll out remaining Volt variants (CTX-Live, CTX-Prop-Passer, CTX-Prop-Funded).
6. Land CTX UI (`feat/journal-integration` → main).

Backwards compatible: old EA versions without journal publishing are unaffected — CTX shows "Waiting for first EA push" for them.

## 8. Testing Strategy

### Unit tests (Jest, in CTX)

`lib/journal/__tests__/`:

- `trade-stats.test.ts` — win rate, profit factor, expected payoff, max DD across known-good fixture deals
- `streaks.test.ts` — current/max win/loss streak edge cases (all wins, all losses, alternating, single, empty)
- `calendar-aggregate.test.ts` — grouping by UTC date, money/% modes, zero-trade days, month boundary
- `objectives.test.ts` — propfirm rule evaluation: money-vs-percent, balance-vs-equity, daily-loss reset on UTC midnight, min/max trading days
- `data-age.test.ts` — fresh / stale / offline classification given `pushed_at` and `push_interval_seconds`

Fixture: `__fixtures__/sample-deals.json` (~20 representative deals).

### Edge Function tests

`publish-journal` Deno test file:
- HMAC mismatch → 401
- `mt5_account` ≠ license owner → 403
- Idempotent insert: re-posting same deal → 200, no duplicate row
- Transactional positions replace: simulated mid-transaction failure leaves table intact

### Manual end-to-end checklist

Run with all three test accounts (1 live, 1 propfirm, 1 demo) attached to MT5 simultaneously, EAs configured against the dev Supabase.

**Phase 1 — schema + Edge Function**
- [ ] `supabase db push` applies cleanly; new tables visible in Supabase Studio
- [ ] `licenses.push_interval_seconds` defaults to 10 on existing rows
- [ ] `publish-journal` deploys; responds to a curl with valid HMAC

**Phase 2 — EA changes (Impulse + CTX-Core first)**
- [ ] WebRequest whitelist already covers Supabase host (no new prompt)
- [ ] Fresh attach on flat account: backfill skipped; state file written
- [ ] Fresh attach on account with >90d history: backfill writes ≤90 days; state file pinned to highest ticket
- [ ] Re-attach same EA: no duplicate rows
- [ ] Delete state file, re-attach: re-runs backfill idempotently
- [ ] WebRequest disabled in MT5: EA logs error, keeps trading, no crash
- [ ] Network unplugged 2 min: EA backs off, recovers, no row gaps

**Phase 3 — live data round-trip per account** (live, propfirm, demo)
- [ ] `account_snapshots_current` row appears within `push_interval_seconds`
- [ ] `pushed_at` advances each tick; data-age indicator ticks correctly
- [ ] Open manual trade: row appears in `positions` within one push cycle
- [ ] Modify SL/TP: change reflects on next push (replace semantics)
- [ ] Close trade: row vanishes from `positions`, appears in `deals`
- [ ] `account_snapshots_daily` row for today exists and updates as P/L moves
- [ ] UTC midnight: yesterday's row freezes, new row for today

**Phase 4 — CTX UI per account**
- [ ] Click row in `/licenses` → navigates to `/licenses/[id]/journal`
- [ ] Live panel matches MT5 terminal (within one push cycle)
- [ ] Liveness badge + data-age reflect EA state when EA is stopped
- [ ] Overview: open positions match MT5
- [ ] Trades: closed deals sortable, paginated, count matches `HistoryDealsTotal()` for last 90d
- [ ] Calendar: daily P/L matches sum of that day's deals; month nav works
- [ ] Performance: win rate / profit factor / max DD match hand-computed fixture; equity curve renders
- [ ] Orders: every state renders correctly
- [ ] Objectives: only renders for propfirm account; progress bars accurate vs assigned rule

**Phase 5 — settings & polling**
- [ ] `/settings` shows journal polling interval; default 10s
- [ ] Change to 3s: live panel cadence visible in DevTools
- [ ] Change to 60s: slower cadence, no errors
- [ ] `licenses.push_interval_seconds` change propagates to EA on next read; EA log confirms timer adjustment
- [ ] CTX poll 3s + EA push 30s: tooltip explains the mismatch

**Phase 6 — propfirm rules**
- [ ] Create rule, assign to propfirm license, Objectives tab populates
- [ ] Trigger daily-loss breach on demo: rule status flips to "failed"
- [ ] Unassign rule (set rule_id null): Objectives tab returns to empty state
- [ ] Delete rule still assigned: `ON DELETE SET NULL` clears rule_id; Objectives tab gracefully shows empty state

**Phase 7 — theme**
- [ ] System theme: page follows OS dark/light setting
- [ ] Manual toggle: light / dark / system render correctly across every tab
- [ ] Recharts reads theme colors correctly in both modes

**Phase 8 — multi-account isolation**
- [ ] All three EAs running: each license's journal page shows only that account's data
- [ ] No row leakage between `mt5_account` values (`SELECT DISTINCT mt5_account` per table = exactly 3)
- [ ] Stop live EA only: live license journal goes stale; propfirm + demo unaffected

**Phase 9 — Volt variants (after Phase 1–8 pass)**
- [ ] CTX-Live: Phase 3 checklist
- [ ] CTX-Prop-Passer: Phase 3 checklist
- [ ] CTX-Prop-Funded: Phase 3 checklist
- [ ] `ea_source` correctly set per variant in deals/orders/positions

### What is NOT being tested in this branch

- Position-level candlestick chart (out of scope)
- Backtest report flow (not in scope)
- CSV export
- Multi-user auth scenarios
- Performance under thousands of accounts
- Long-haul reliability (>72h continuous)

### Verification gates before merging

- All Jest tests green
- Phase 1–4 checklist green for at least one account end-to-end
- Phase 8 (multi-account isolation) green
- Phase 9 may proceed in a follow-up PR if Volt variants need their own validation window — flagged here

## 9. Branch & Worktree

- **Branch:** `feat/journal-integration`
- **Worktree:** `../copytraderx-license-journal` (sibling to `copytraderx-license`)
- Existing CTX checkout stays on `main` for license-admin tweaks.
- EA repo changes ship from their own branches in their own repos; coordinate the rollout order in section 7.

## 10. Open Questions / Future Work

These are explicitly *not* blockers for this branch but worth noting for follow-ups:

- **Shared `Common/` MQL5 directory** between Impulse and Volt to dedupe license + journal code. Larger refactor.
- **Position-level chart** (lightweight-charts) — straightforward port from MTJ once needed.
- **CSV export** of trades — small, can be a quick PR.
- **Per-account timezone setting** (today: calendar groups by UTC). Adding a `licenses.display_timezone` column would let admins see calendar in their local time without affecting storage.
- **Long-haul soak test** for the EA push pipeline (>72h continuous).
- **Multi-user auth** is still out of scope; CTX remains a dev-only admin tool behind the existing reverse proxy.
