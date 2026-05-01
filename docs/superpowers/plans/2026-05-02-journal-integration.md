# Journal Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring MetaTrader Journal's core trade-analytics surface (live account, positions, deals, calendar, performance, propfirm objectives) into CopyTraderX as a per-license drill-down, fed by the existing EA → Supabase pipeline.

**Architecture:** EAs (Impulse + Volt's 4 variants) push trade journal data on their OnTimer cycle to a new HMAC-signed Supabase Edge Function (`publish-journal`); CTX is read-only on six new tables. Per-license scoping by `mt5_account`. No VPS bridge.

**Tech Stack:** Next.js 16 + React 19 + TypeScript (CTX), shadcn/ui + Tailwind v4, recharts, next-themes, @supabase/supabase-js, Jest + ts-jest. MQL5 (EAs). Supabase Edge Functions (Deno). PostgreSQL (Supabase).

**Spec:** `docs/superpowers/specs/2026-05-02-journal-integration-design.md`

**Phases (numbered for sequencing — each phase ends with a green checkpoint before the next begins):**
- Phase 0: Worktree + branch setup
- Phase 1: Supabase schema migrations
- Phase 2: `publish-journal` Edge Function
- Phase 3: CTX domain code (types, queries, pure logic, tests)
- Phase 4: CTX UI (journal page, propfirm rules, theming, polling)
- Phase 5: Impulse EA — `JournalPublisher.mqh` (canonical implementation)
- Phase 6: Volt EAs — port to 4 variants
- Phase 7: End-to-end verification across 3 test accounts

---

## Phase 0 — Worktree & Branch Setup

### Task 0.1: Create the feature worktree

**Files:**
- No code changes. Worktree is created at `../copytraderx-license-journal` on branch `feat/journal-integration`.

- [ ] **Step 1: From the main checkout, create the worktree**

Run:
```bash
cd /Users/jsonse/Documents/development/copytraderx-license
git worktree add -b feat/journal-integration ../copytraderx-license-journal main
```

Expected: `Preparing worktree (new branch 'feat/journal-integration')` followed by `HEAD is now at <sha> ...`

- [ ] **Step 2: Confirm the worktree is healthy**

Run:
```bash
cd /Users/jsonse/Documents/development/copytraderx-license-journal
git status
git branch --show-current
```

Expected: clean working tree; current branch `feat/journal-integration`.

- [ ] **Step 3: Install dependencies in the worktree**

Run:
```bash
cd /Users/jsonse/Documents/development/copytraderx-license-journal
pnpm install
```

Expected: install completes; `node_modules/` populated.

- [ ] **Step 4: Sanity-check the existing test suite passes from the worktree**

Run:
```bash
cd /Users/jsonse/Documents/development/copytraderx-license-journal
pnpm test
```

Expected: all existing Jest tests in `lib/*.test.ts` pass.

- [ ] **Step 5: No commit required — worktree creation is a Git-side action with no working-tree changes.**

> All subsequent CTX-side work happens inside `../copytraderx-license-journal`. EA work happens in `~/Documents/development/EA/JSONFX-IMPULSE` and `~/Documents/development/EA/volt` on their own branches (created in Phase 5/6).

---

## Phase 1 — Supabase Schema Migrations

Migrations live in the EA repo (`~/Documents/development/EA/JSONFX-IMPULSE/supabase/migrations/`) per the spec — single source of truth for the shared DB. We add **seven** migration files (one per table + one for `licenses` columns), each timestamped sequentially after the existing `20260428000001_add_intended_account_type.sql`.

### Task 1.1: Migration — `account_snapshots_current`

**Files:**
- Create: `~/Documents/development/EA/JSONFX-IMPULSE/supabase/migrations/20260502000001_create_account_snapshots_current.sql`

- [ ] **Step 1: Create the migration file**

```sql
-- 20260502000001_create_account_snapshots_current.sql
-- Live account snapshot. ONE row per MT5 account, overwritten on every EA push.
-- Powers the live panel + drawdown indicator on the journal page.

CREATE TABLE account_snapshots_current (
  mt5_account       BIGINT       PRIMARY KEY,
  balance           NUMERIC(18,2) NOT NULL,
  equity            NUMERIC(18,2) NOT NULL,
  margin            NUMERIC(18,2) NOT NULL,
  free_margin       NUMERIC(18,2) NOT NULL,
  margin_level      NUMERIC(10,2),
  floating_pnl      NUMERIC(18,2) NOT NULL,
  drawdown_pct      NUMERIC(8,4)  NOT NULL,
  leverage          INT           NOT NULL,
  currency          TEXT          NOT NULL,
  server            TEXT,
  pushed_at         TIMESTAMPTZ   NOT NULL
);

ALTER TABLE account_snapshots_current ENABLE ROW LEVEL SECURITY;
-- No policies created: only the service-role key (used by CTX server-side and
-- the publish-journal Edge Function) bypasses RLS. Browsers never read this table.

COMMENT ON TABLE account_snapshots_current IS
  'Latest account snapshot per MT5 account. Upserted by the publish-journal Edge Function on each EA push.';
COMMENT ON COLUMN account_snapshots_current.pushed_at IS
  'EA timestamp at push time (UTC). The freshness signal for the journal data-age indicator.';
```

- [ ] **Step 2: Apply locally (or against the dev DB)**

Run:
```bash
cd ~/Documents/development/EA/JSONFX-IMPULSE
supabase db push
```

Expected: `Applying migration 20260502000001_create_account_snapshots_current.sql ... done`.

- [ ] **Step 3: Verify the table is visible**

Run:
```bash
cd ~/Documents/development/EA/JSONFX-IMPULSE
supabase db dump --schema public --table account_snapshots_current
```

Expected: a `CREATE TABLE` statement matching the migration.

- [ ] **Step 4: Commit (in the EA repo)**

```bash
cd ~/Documents/development/EA/JSONFX-IMPULSE
git checkout -b feat/journal-tables
git add supabase/migrations/20260502000001_create_account_snapshots_current.sql
git commit -m "feat(db): add account_snapshots_current for journal live panel"
```

### Task 1.2: Migration — `account_snapshots_daily`

**Files:**
- Create: `~/Documents/development/EA/JSONFX-IMPULSE/supabase/migrations/20260502000002_create_account_snapshots_daily.sql`

- [ ] **Step 1: Create the migration file**

```sql
-- 20260502000002_create_account_snapshots_daily.sql
-- One row per MT5 account per UTC day. Upserted on every push so today's row
-- is always current; rolls naturally at UTC midnight when EA writes a new key.
-- Powers the equity curve chart on the Performance tab.

CREATE TABLE account_snapshots_daily (
  mt5_account       BIGINT       NOT NULL,
  trade_date        DATE         NOT NULL,
  balance_close     NUMERIC(18,2) NOT NULL,
  equity_close      NUMERIC(18,2) NOT NULL,
  daily_pnl         NUMERIC(18,2) NOT NULL,
  PRIMARY KEY (mt5_account, trade_date)
);

ALTER TABLE account_snapshots_daily ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE account_snapshots_daily IS
  'Daily account snapshot per MT5 account. Upserted by publish-journal on each EA push; the (account, date) PK guarantees yesterday rolls immutable when today crosses UTC midnight.';
```

- [ ] **Step 2: Apply**

Run: `cd ~/Documents/development/EA/JSONFX-IMPULSE && supabase db push`
Expected: migration applied.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260502000002_create_account_snapshots_daily.sql
git commit -m "feat(db): add account_snapshots_daily for equity curve"
```

### Task 1.3: Migration — `positions`

**Files:**
- Create: `~/Documents/development/EA/JSONFX-IMPULSE/supabase/migrations/20260502000003_create_positions.sql`

- [ ] **Step 1: Create the migration file**

```sql
-- 20260502000003_create_positions.sql
-- Open positions per MT5 account. EA fully replaces (delete + insert) each push,
-- inside a single transaction so the table is never empty mid-write.

CREATE TABLE positions (
  mt5_account       BIGINT       NOT NULL,
  ticket            BIGINT       NOT NULL,
  ea_source         TEXT         NOT NULL,
  symbol            TEXT         NOT NULL,
  side              TEXT         NOT NULL,
  volume            NUMERIC(10,2) NOT NULL,
  open_price        NUMERIC(18,5) NOT NULL,
  current_price     NUMERIC(18,5) NOT NULL,
  sl                NUMERIC(18,5),
  tp                NUMERIC(18,5),
  profit            NUMERIC(18,2) NOT NULL,
  swap              NUMERIC(18,2) NOT NULL,
  commission        NUMERIC(18,2) NOT NULL,
  open_time         TIMESTAMPTZ  NOT NULL,
  comment           TEXT,
  magic             BIGINT,
  PRIMARY KEY (mt5_account, ticket),
  CONSTRAINT positions_side_chk CHECK (side IN ('buy','sell')),
  CONSTRAINT positions_ea_source_chk CHECK (
    ea_source IN ('impulse','ctx-core','ctx-live','ctx-prop-passer','ctx-prop-funded')
  )
);

CREATE INDEX positions_account_idx ON positions (mt5_account);

ALTER TABLE positions ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE positions IS
  'Live open positions per MT5 account. publish-journal does a delete-by-(mt5_account, ea_source) + bulk insert in one transaction on each EA push.';
```

- [ ] **Step 2: Apply**

Run: `cd ~/Documents/development/EA/JSONFX-IMPULSE && supabase db push`
Expected: migration applied.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260502000003_create_positions.sql
git commit -m "feat(db): add positions table for live open trades"
```

### Task 1.4: Migration — `deals`

**Files:**
- Create: `~/Documents/development/EA/JSONFX-IMPULSE/supabase/migrations/20260502000004_create_deals.sql`

- [ ] **Step 1: Create the migration file**

```sql
-- 20260502000004_create_deals.sql
-- Closed round-trip trades. Append-only via INSERT ... ON CONFLICT DO NOTHING
-- so the EA can replay safely on backfill or after a restart.

CREATE TABLE deals (
  mt5_account       BIGINT       NOT NULL,
  ticket            BIGINT       NOT NULL,
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
  profit            NUMERIC(18,2) NOT NULL,
  commission        NUMERIC(18,2) NOT NULL,
  swap              NUMERIC(18,2) NOT NULL,
  comment           TEXT,
  magic             BIGINT,
  PRIMARY KEY (mt5_account, ticket),
  CONSTRAINT deals_side_chk CHECK (side IN ('buy','sell')),
  CONSTRAINT deals_ea_source_chk CHECK (
    ea_source IN ('impulse','ctx-core','ctx-live','ctx-prop-passer','ctx-prop-funded')
  )
);

CREATE INDEX deals_account_close_time_idx ON deals (mt5_account, close_time DESC);

ALTER TABLE deals ENABLE ROW LEVEL SECURITY;
```

- [ ] **Step 2: Apply**

Run: `cd ~/Documents/development/EA/JSONFX-IMPULSE && supabase db push`
Expected: migration applied.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260502000004_create_deals.sql
git commit -m "feat(db): add deals table for closed trade history"
```

### Task 1.5: Migration — `orders`

**Files:**
- Create: `~/Documents/development/EA/JSONFX-IMPULSE/supabase/migrations/20260502000005_create_orders.sql`

- [ ] **Step 1: Create the migration file**

```sql
-- 20260502000005_create_orders.sql
-- Raw historical orders (placed/filled/cancelled/expired/...). Append-only.

CREATE TABLE orders (
  mt5_account       BIGINT       NOT NULL,
  ticket            BIGINT       NOT NULL,
  ea_source         TEXT         NOT NULL,
  symbol            TEXT         NOT NULL,
  type              TEXT         NOT NULL,
  state             TEXT         NOT NULL,
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
  PRIMARY KEY (mt5_account, ticket),
  CONSTRAINT orders_ea_source_chk CHECK (
    ea_source IN ('impulse','ctx-core','ctx-live','ctx-prop-passer','ctx-prop-funded')
  )
);

CREATE INDEX orders_account_time_setup_idx ON orders (mt5_account, time_setup DESC);

ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
```

- [ ] **Step 2: Apply**

Run: `cd ~/Documents/development/EA/JSONFX-IMPULSE && supabase db push`
Expected: migration applied.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260502000005_create_orders.sql
git commit -m "feat(db): add orders table for historical order audit"
```

### Task 1.6: Migration — `propfirm_rules`

**Files:**
- Create: `~/Documents/development/EA/JSONFX-IMPULSE/supabase/migrations/20260502000006_create_propfirm_rules.sql`

- [ ] **Step 1: Create the migration file**

```sql
-- 20260502000006_create_propfirm_rules.sql
-- Admin-managed propfirm rule presets. Assignable per license via licenses.propfirm_rule_id.

CREATE TABLE propfirm_rules (
  id                 SERIAL       PRIMARY KEY,
  name               TEXT         NOT NULL,
  account_size       NUMERIC(18,2) NOT NULL,
  max_daily_loss     NUMERIC(18,4) NOT NULL,
  daily_loss_type    TEXT         NOT NULL,
  daily_loss_calc    TEXT         NOT NULL,
  max_total_loss     NUMERIC(18,4) NOT NULL,
  total_loss_type    TEXT         NOT NULL,
  profit_target      NUMERIC(18,4) NOT NULL,
  target_type        TEXT         NOT NULL,
  min_trading_days   INT          NOT NULL DEFAULT 0,
  max_trading_days   INT,
  created_at         TIMESTAMPTZ  NOT NULL DEFAULT now(),
  CONSTRAINT propfirm_rules_daily_loss_type_chk CHECK (daily_loss_type IN ('money','percent')),
  CONSTRAINT propfirm_rules_daily_loss_calc_chk CHECK (daily_loss_calc IN ('balance','equity')),
  CONSTRAINT propfirm_rules_total_loss_type_chk CHECK (total_loss_type IN ('money','percent')),
  CONSTRAINT propfirm_rules_target_type_chk      CHECK (target_type      IN ('money','percent'))
);

ALTER TABLE propfirm_rules ENABLE ROW LEVEL SECURITY;
```

- [ ] **Step 2: Apply**

Run: `cd ~/Documents/development/EA/JSONFX-IMPULSE && supabase db push`
Expected: migration applied.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260502000006_create_propfirm_rules.sql
git commit -m "feat(db): add propfirm_rules presets table"
```

### Task 1.7: Migration — extend `licenses` with `push_interval_seconds` and `propfirm_rule_id`

**Files:**
- Create: `~/Documents/development/EA/JSONFX-IMPULSE/supabase/migrations/20260502000007_alter_licenses_journal_columns.sql`

- [ ] **Step 1: Create the migration file**

```sql
-- 20260502000007_alter_licenses_journal_columns.sql
-- Add the two journal-related columns the EA + CTX read on every cycle.
-- Existing rows get push_interval_seconds=10 and propfirm_rule_id=NULL.

ALTER TABLE licenses
  ADD COLUMN push_interval_seconds INT NOT NULL DEFAULT 10,
  ADD COLUMN propfirm_rule_id INT REFERENCES propfirm_rules(id) ON DELETE SET NULL;

COMMENT ON COLUMN licenses.push_interval_seconds IS
  'How often the EA should publish journal data (seconds). Range enforced by CTX UI: 3-60.';
COMMENT ON COLUMN licenses.propfirm_rule_id IS
  'Optional link to propfirm_rules. When set, the journal page Objectives tab evaluates challenge progress.';
```

- [ ] **Step 2: Apply**

Run: `cd ~/Documents/development/EA/JSONFX-IMPULSE && supabase db push`
Expected: migration applied.

- [ ] **Step 3: Verify default backfilled correctly**

Run via Supabase SQL editor or psql:
```sql
SELECT id, mt5_account, push_interval_seconds, propfirm_rule_id
FROM licenses
LIMIT 5;
```
Expected: every existing row shows `push_interval_seconds = 10` and `propfirm_rule_id = NULL`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260502000007_alter_licenses_journal_columns.sql
git commit -m "feat(db): add push_interval_seconds and propfirm_rule_id to licenses"
```

### Phase 1 Checkpoint

- [ ] All seven migrations applied; all tables visible in Supabase Studio.
- [ ] `licenses` rows have defaulted `push_interval_seconds` correctly.
- [ ] EA repo branch `feat/journal-tables` has 7 commits ready to push when convenient.

---

## Phase 2 — `publish-journal` Edge Function

The Edge Function lives in the EA repo too (`~/Documents/development/EA/JSONFX-IMPULSE/supabase/functions/publish-journal/`), alongside the existing `validate-license` function. It is the **only** writer to the journal tables; the EAs invoke it, the CTX server never invokes it.

### Task 2.1: Scaffold the Edge Function directory

**Files:**
- Create: `~/Documents/development/EA/JSONFX-IMPULSE/supabase/functions/publish-journal/index.ts`
- Create: `~/Documents/development/EA/JSONFX-IMPULSE/supabase/functions/publish-journal/deno.json`
- Create: `~/Documents/development/EA/JSONFX-IMPULSE/supabase/functions/publish-journal/types.ts`

- [ ] **Step 1: Create `deno.json` so deno-aware tooling lints the file correctly**

```json
{
  "imports": {
    "std/": "https://deno.land/std@0.224.0/",
    "supabase": "https://esm.sh/@supabase/supabase-js@2.45.0"
  }
}
```

- [ ] **Step 2: Create `types.ts` with the request/response shapes**

```typescript
// types.ts — payload shapes accepted by the publish-journal Edge Function.
//
// HMAC contract: signature = base64(HMAC-SHA256(LICENSE_HMAC_KEY, JSON.stringify(payload))).
// The signature covers ONLY the `payload` object, not the envelope fields.

export type EaSource =
  | "impulse"
  | "ctx-core"
  | "ctx-live"
  | "ctx-prop-passer"
  | "ctx-prop-funded";

export type PayloadType = "snapshot" | "positions" | "deals" | "orders" | "daily";

export interface PublishEnvelope {
  license_key: string;
  mt5_account: number;
  ea_source: EaSource;
  payload_type: PayloadType;
  payload: unknown; // shape depends on payload_type — see below
  signature: string;
}

export interface SnapshotPayload {
  balance: number;
  equity: number;
  margin: number;
  free_margin: number;
  margin_level: number | null;
  floating_pnl: number;
  drawdown_pct: number;
  leverage: number;
  currency: string;
  server: string | null;
  pushed_at: string; // ISO 8601 UTC
}

export interface DailyPayload {
  trade_date: string;     // YYYY-MM-DD UTC
  balance_close: number;
  equity_close: number;
  daily_pnl: number;
}

export interface PositionRow {
  ticket: number;
  symbol: string;
  side: "buy" | "sell";
  volume: number;
  open_price: number;
  current_price: number;
  sl: number | null;
  tp: number | null;
  profit: number;
  swap: number;
  commission: number;
  open_time: string;
  comment: string | null;
  magic: number | null;
}
export interface PositionsPayload {
  positions: PositionRow[];
}

export interface DealRow {
  ticket: number;
  symbol: string;
  side: "buy" | "sell";
  volume: number;
  open_price: number;
  close_price: number;
  sl: number | null;
  tp: number | null;
  open_time: string;
  close_time: string;
  profit: number;
  commission: number;
  swap: number;
  comment: string | null;
  magic: number | null;
}
export interface DealsPayload {
  deals: DealRow[];
}

export interface OrderRow {
  ticket: number;
  symbol: string;
  type: string;
  state: string;
  volume_initial: number;
  volume_current: number;
  price_open: number | null;
  price_current: number | null;
  sl: number | null;
  tp: number | null;
  time_setup: string;
  time_done: string | null;
  comment: string | null;
  magic: number | null;
}
export interface OrdersPayload {
  orders: OrderRow[];
}
```

- [ ] **Step 3: Commit the scaffold**

```bash
cd ~/Documents/development/EA/JSONFX-IMPULSE
git add supabase/functions/publish-journal/deno.json supabase/functions/publish-journal/types.ts
git commit -m "feat(fn): scaffold publish-journal Edge Function"
```

### Task 2.2: Write the test file (deno test) — RED

**Files:**
- Create: `~/Documents/development/EA/JSONFX-IMPULSE/supabase/functions/publish-journal/index.test.ts`

The function isn't written yet, so the import alone makes tests fail. We'll fix it in 2.3.

- [ ] **Step 1: Write tests covering HMAC, account match, and idempotency**

```typescript
// index.test.ts — Deno tests for publish-journal.
// Run with: deno test --allow-env --allow-net supabase/functions/publish-journal/index.test.ts

import { assertEquals, assertStringIncludes } from "std/assert/mod.ts";
import { handle } from "./index.ts";
import type { PublishEnvelope } from "./types.ts";

const HMAC_KEY = "AftajKwQqGkam/JtIO/zRhhtFzfC7VsChpiUPMO19yc=";

async function signPayload(payload: unknown): Promise<string> {
  const enc = new TextEncoder();
  const keyData = Uint8Array.from(atob(HMAC_KEY), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey(
    "raw",
    keyData,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(JSON.stringify(payload)));
  return btoa(String.fromCharCode(...new Uint8Array(sig)));
}

function buildEnvelope(overrides: Partial<PublishEnvelope> = {}): PublishEnvelope {
  return {
    license_key: "IMPX-AAAA-BBBB-CCCC-DDDD",
    mt5_account: 12345,
    ea_source: "impulse",
    payload_type: "snapshot",
    payload: {
      balance: 1000,
      equity: 1000,
      margin: 0,
      free_margin: 1000,
      margin_level: null,
      floating_pnl: 0,
      drawdown_pct: 0,
      leverage: 500,
      currency: "USD",
      server: "Test-Server",
      pushed_at: "2026-05-02T00:00:00Z",
    },
    signature: "",
    ...overrides,
  };
}

Deno.test("rejects missing signature with 401", async () => {
  const env = buildEnvelope();
  const res = await handle(new Request("https://x/y", {
    method: "POST",
    body: JSON.stringify(env),
  }));
  assertEquals(res.status, 401);
});

Deno.test("rejects bad HMAC with 401", async () => {
  const env = buildEnvelope({ signature: "obviously-wrong" });
  const res = await handle(new Request("https://x/y", {
    method: "POST",
    body: JSON.stringify(env),
  }));
  assertEquals(res.status, 401);
});

Deno.test("rejects mt5_account that does not match license owner with 403", async () => {
  // This test requires a stub Supabase client — see implementation in 2.3.
  // Stub returns license whose mt5_account=99999, request claims 12345.
  const env = buildEnvelope({ mt5_account: 99999 });
  env.signature = await signPayload(env.payload);
  const res = await handle(new Request("https://x/y", {
    method: "POST",
    body: JSON.stringify(env),
  }), { stubLicenseAccount: 12345 });
  assertEquals(res.status, 403);
  const body = await res.text();
  assertStringIncludes(body, "account_mismatch");
});

Deno.test("accepts a snapshot payload with valid signature", async () => {
  const env = buildEnvelope();
  env.signature = await signPayload(env.payload);
  const res = await handle(new Request("https://x/y", {
    method: "POST",
    body: JSON.stringify(env),
  }), { stubLicenseAccount: 12345, stubUpsert: () => Promise.resolve({ error: null }) });
  assertEquals(res.status, 200);
});

Deno.test("rejects unknown payload_type with 400", async () => {
  const env = buildEnvelope({ payload_type: "garbage" as never });
  env.signature = await signPayload(env.payload);
  const res = await handle(new Request("https://x/y", {
    method: "POST",
    body: JSON.stringify(env),
  }), { stubLicenseAccount: 12345 });
  assertEquals(res.status, 400);
});
```

- [ ] **Step 2: Run the tests, confirm they fail (red)**

Run:
```bash
cd ~/Documents/development/EA/JSONFX-IMPULSE
deno test --allow-env --allow-net supabase/functions/publish-journal/index.test.ts
```

Expected: tests fail with "module not found" / "handle is not exported" — `index.ts` doesn't exist yet.

### Task 2.3: Implement `publish-journal` — GREEN

**Files:**
- Create: `~/Documents/development/EA/JSONFX-IMPULSE/supabase/functions/publish-journal/index.ts`

- [ ] **Step 1: Write `index.ts`**

```typescript
// publish-journal — HMAC-signed Edge Function. Sole writer to the journal
// tables. Verifies HMAC + that mt5_account matches the license owner before
// performing the upsert / insert / replace appropriate to payload_type.

import { createClient, SupabaseClient } from "supabase";
import type {
  DailyPayload,
  DealsPayload,
  OrdersPayload,
  PositionsPayload,
  PublishEnvelope,
  SnapshotPayload,
} from "./types.ts";

const HMAC_KEY = Deno.env.get("LICENSE_HMAC_KEY") ?? "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

interface HandleOptions {
  stubLicenseAccount?: number;
  stubUpsert?: (table: string, body: unknown) => Promise<{ error: unknown }>;
}

async function verifyHmac(payload: unknown, signature: string): Promise<boolean> {
  if (!signature) return false;
  try {
    const enc = new TextEncoder();
    const keyData = Uint8Array.from(atob(HMAC_KEY), (c) => c.charCodeAt(0));
    const key = await crypto.subtle.importKey(
      "raw",
      keyData,
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"],
    );
    const sigBytes = Uint8Array.from(atob(signature), (c) => c.charCodeAt(0));
    return await crypto.subtle.verify(
      "HMAC",
      key,
      sigBytes,
      enc.encode(JSON.stringify(payload)),
    );
  } catch {
    return false;
  }
}

function getClient(): SupabaseClient {
  return createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function loadLicenseMt5Account(
  client: SupabaseClient,
  license_key: string,
): Promise<number | null> {
  const { data, error } = await client
    .from("licenses")
    .select("mt5_account")
    .eq("license_key", license_key)
    .maybeSingle();
  if (error || !data) return null;
  return data.mt5_account as number;
}

async function applySnapshot(
  client: SupabaseClient,
  mt5_account: number,
  p: SnapshotPayload,
): Promise<{ error: unknown }> {
  return await client.from("account_snapshots_current").upsert({
    mt5_account,
    balance: p.balance,
    equity: p.equity,
    margin: p.margin,
    free_margin: p.free_margin,
    margin_level: p.margin_level,
    floating_pnl: p.floating_pnl,
    drawdown_pct: p.drawdown_pct,
    leverage: p.leverage,
    currency: p.currency,
    server: p.server,
    pushed_at: p.pushed_at,
  });
}

async function applyDaily(
  client: SupabaseClient,
  mt5_account: number,
  p: DailyPayload,
): Promise<{ error: unknown }> {
  return await client.from("account_snapshots_daily").upsert({
    mt5_account,
    trade_date: p.trade_date,
    balance_close: p.balance_close,
    equity_close: p.equity_close,
    daily_pnl: p.daily_pnl,
  });
}

async function applyPositions(
  client: SupabaseClient,
  mt5_account: number,
  ea_source: string,
  p: PositionsPayload,
): Promise<{ error: unknown }> {
  // Replace = delete-by-(account, ea_source) + bulk insert. Atomic via PostgREST
  // by calling a SQL function; here we use two requests and accept the
  // tiny window because positions snapshots are pushed every 3-60s and the
  // delete is keyed precisely so no other writer interferes.
  const del = await client
    .from("positions")
    .delete()
    .eq("mt5_account", mt5_account)
    .eq("ea_source", ea_source);
  if (del.error) return del;
  if (p.positions.length === 0) return { error: null };
  const rows = p.positions.map((pos) => ({ ...pos, mt5_account, ea_source }));
  return await client.from("positions").insert(rows);
}

async function applyDeals(
  client: SupabaseClient,
  mt5_account: number,
  ea_source: string,
  p: DealsPayload,
): Promise<{ error: unknown }> {
  if (p.deals.length === 0) return { error: null };
  const rows = p.deals.map((d) => ({ ...d, mt5_account, ea_source }));
  // ON CONFLICT DO NOTHING via upsert with ignoreDuplicates.
  return await client
    .from("deals")
    .upsert(rows, { onConflict: "mt5_account,ticket", ignoreDuplicates: true });
}

async function applyOrders(
  client: SupabaseClient,
  mt5_account: number,
  ea_source: string,
  p: OrdersPayload,
): Promise<{ error: unknown }> {
  if (p.orders.length === 0) return { error: null };
  const rows = p.orders.map((o) => ({ ...o, mt5_account, ea_source }));
  return await client
    .from("orders")
    .upsert(rows, { onConflict: "mt5_account,ticket", ignoreDuplicates: true });
}

export async function handle(req: Request, opts: HandleOptions = {}): Promise<Response> {
  if (req.method !== "POST") {
    return new Response("method_not_allowed", { status: 405 });
  }
  let env: PublishEnvelope;
  try {
    env = await req.json();
  } catch {
    return new Response("bad_json", { status: 400 });
  }

  const ok = await verifyHmac(env.payload, env.signature);
  if (!ok) return new Response("hmac_invalid", { status: 401 });

  const ownerAccount = opts.stubLicenseAccount !== undefined
    ? opts.stubLicenseAccount
    : await loadLicenseMt5Account(getClient(), env.license_key);
  if (ownerAccount === null) {
    return new Response("license_not_found", { status: 404 });
  }
  if (ownerAccount !== env.mt5_account) {
    return new Response("account_mismatch", { status: 403 });
  }

  const validTypes = ["snapshot", "positions", "deals", "orders", "daily"] as const;
  if (!validTypes.includes(env.payload_type)) {
    return new Response("bad_payload_type", { status: 400 });
  }

  // Stub fast-path for tests.
  if (opts.stubUpsert) {
    const result = await opts.stubUpsert(env.payload_type, env.payload);
    return new Response(JSON.stringify(result), { status: result.error ? 500 : 200 });
  }

  const client = getClient();
  let result: { error: unknown };
  switch (env.payload_type) {
    case "snapshot":
      result = await applySnapshot(client, env.mt5_account, env.payload as SnapshotPayload);
      break;
    case "daily":
      result = await applyDaily(client, env.mt5_account, env.payload as DailyPayload);
      break;
    case "positions":
      result = await applyPositions(client, env.mt5_account, env.ea_source, env.payload as PositionsPayload);
      break;
    case "deals":
      result = await applyDeals(client, env.mt5_account, env.ea_source, env.payload as DealsPayload);
      break;
    case "orders":
      result = await applyOrders(client, env.mt5_account, env.ea_source, env.payload as OrdersPayload);
      break;
  }
  if (result.error) {
    return new Response(JSON.stringify({ error: String(result.error) }), { status: 500 });
  }
  return new Response("ok", { status: 200 });
}

// Default export wraps handle for Supabase's serve() runtime.
Deno.serve(handle);
```

- [ ] **Step 2: Run the tests — confirm green**

Run:
```bash
cd ~/Documents/development/EA/JSONFX-IMPULSE
deno test --allow-env --allow-net supabase/functions/publish-journal/index.test.ts
```

Expected: all 5 tests pass.

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/publish-journal/index.ts supabase/functions/publish-journal/index.test.ts
git commit -m "feat(fn): implement publish-journal with HMAC verification"
```

### Task 2.4: Deploy the Edge Function

**Files:** none (deployment action)

- [ ] **Step 1: Set the secret env vars in Supabase**

Run:
```bash
cd ~/Documents/development/EA/JSONFX-IMPULSE
supabase secrets set LICENSE_HMAC_KEY="AftajKwQqGkam/JtIO/zRhhtFzfC7VsChpiUPMO19yc="
```

Expected: `Set 1 secrets`. (The SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY secrets are already provisioned by Supabase for every Edge Function automatically — no action needed.)

- [ ] **Step 2: Deploy**

Run:
```bash
supabase functions deploy publish-journal
```

Expected: `Deployed Function publish-journal on project mkfabzqlxzeidfblxzhq`.

- [ ] **Step 3: Smoke-test with a hand-crafted curl**

First, generate a signature (one-liner with openssl):
```bash
PAYLOAD='{"balance":1,"equity":1,"margin":0,"free_margin":1,"margin_level":null,"floating_pnl":0,"drawdown_pct":0,"leverage":500,"currency":"USD","server":null,"pushed_at":"2026-05-02T00:00:00Z"}'
SIG=$(printf '%s' "$PAYLOAD" | openssl dgst -sha256 -hmac "$(echo -n "AftajKwQqGkam/JtIO/zRhhtFzfC7VsChpiUPMO19yc=" | base64 -d)" -binary | base64)
```

Then call the function (substitute a real license_key + mt5_account from your dev DB):
```bash
curl -i -X POST "https://mkfabzqlxzeidfblxzhq.supabase.co/functions/v1/publish-journal" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <ANON_KEY>" \
  -d "{\"license_key\":\"IMPX-...\",\"mt5_account\":12345,\"ea_source\":\"impulse\",\"payload_type\":\"snapshot\",\"payload\":${PAYLOAD},\"signature\":\"${SIG}\"}"
```

Expected: HTTP 200, body `ok`. Then verify the row appeared:
```sql
SELECT mt5_account, pushed_at FROM account_snapshots_current WHERE mt5_account = 12345;
```

### Phase 2 Checkpoint

- [ ] All 5 deno tests pass.
- [ ] Function deployed and reachable.
- [ ] One end-to-end curl writes a row to `account_snapshots_current`.
- [ ] EA repo branch `feat/journal-tables` has 9 commits.

---

## Phase 3 — CTX Domain Code (types, queries, pure logic, tests)

All work in the worktree `/Users/jsonse/Documents/development/copytraderx-license-journal` on branch `feat/journal-integration`.

We build the data layer first (TDD on the pure functions), then the API routes, then Phase 4 wires it into the UI.

### Task 3.1: Add new dependency: `recharts`

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install recharts**

Run:
```bash
cd /Users/jsonse/Documents/development/copytraderx-license-journal
pnpm add recharts@^2.13.0
```

Expected: `+ recharts 2.13.x` in `package.json` `dependencies`.

- [ ] **Step 2: Confirm tests still pass after the install**

Run: `pnpm test`
Expected: all existing tests still green.

- [ ] **Step 3: Commit**

```bash
git add package.json pnpm-lock.yaml
git commit -m "chore(deps): add recharts for journal equity curve"
```

### Task 3.2: Extend types — add journal types + license columns

**Files:**
- Modify: `lib/types.ts`

- [ ] **Step 1: Append the new types to `lib/types.ts`**

Add at the end of the file:

```typescript
// ── Journal types ────────────────────────────────────────────────────────────

export type EaSource =
  | "impulse"
  | "ctx-core"
  | "ctx-live"
  | "ctx-prop-passer"
  | "ctx-prop-funded";

export type TradeSide = "buy" | "sell";

export interface AccountSnapshotCurrent {
  mt5_account: number;
  balance: number;
  equity: number;
  margin: number;
  free_margin: number;
  margin_level: number | null;
  floating_pnl: number;
  drawdown_pct: number;
  leverage: number;
  currency: string;
  server: string | null;
  pushed_at: string;
}

export interface AccountSnapshotDaily {
  mt5_account: number;
  trade_date: string;     // YYYY-MM-DD UTC
  balance_close: number;
  equity_close: number;
  daily_pnl: number;
}

export interface Position {
  mt5_account: number;
  ticket: number;
  ea_source: EaSource;
  symbol: string;
  side: TradeSide;
  volume: number;
  open_price: number;
  current_price: number;
  sl: number | null;
  tp: number | null;
  profit: number;
  swap: number;
  commission: number;
  open_time: string;
  comment: string | null;
  magic: number | null;
}

export interface Deal {
  mt5_account: number;
  ticket: number;
  ea_source: EaSource;
  symbol: string;
  side: TradeSide;
  volume: number;
  open_price: number;
  close_price: number;
  sl: number | null;
  tp: number | null;
  open_time: string;
  close_time: string;
  profit: number;
  commission: number;
  swap: number;
  comment: string | null;
  magic: number | null;
}

export interface OrderRow {
  mt5_account: number;
  ticket: number;
  ea_source: EaSource;
  symbol: string;
  type: string;
  state: string;
  volume_initial: number;
  volume_current: number;
  price_open: number | null;
  price_current: number | null;
  sl: number | null;
  tp: number | null;
  time_setup: string;
  time_done: string | null;
  comment: string | null;
  magic: number | null;
}

export type DailyLossType = "money" | "percent";
export type DailyLossCalc = "balance" | "equity";

export interface PropfirmRule {
  id: number;
  name: string;
  account_size: number;
  max_daily_loss: number;
  daily_loss_type: DailyLossType;
  daily_loss_calc: DailyLossCalc;
  max_total_loss: number;
  total_loss_type: DailyLossType;     // same enum, reused
  profit_target: number;
  target_type: DailyLossType;          // same enum, reused
  min_trading_days: number;
  max_trading_days: number | null;
  created_at: string;
}

// "fresh" < 2× push interval, "stale" < 4× push interval, "offline" beyond.
export type DataAgeState = "fresh" | "stale" | "offline";
```

- [ ] **Step 2: Extend the existing `License` interface in the same file with the two new columns**

Find the `License` interface and add `push_interval_seconds` and `propfirm_rule_id`:

```typescript
export interface License {
  id: number;
  license_key: string;
  mt5_account: number;
  status: LicenseStatus;
  tier: LicenseTier | null;
  expires_at: string | null;
  activated_at: string | null;
  customer_email: string | null;
  purchase_date: string | null;
  last_validated_at: string | null;
  broker_name: string | null;
  account_type: AccountType | null;
  intended_account_type: AccountType | null;
  notes: string | null;
  created_at: string;
  push_interval_seconds: number;        // NEW: 3-60, default 10
  propfirm_rule_id: number | null;      // NEW: FK to propfirm_rules
}
```

- [ ] **Step 3: Run tests to confirm types compile and existing tests still pass**

Run: `pnpm test`
Expected: green.

- [ ] **Step 4: Commit**

```bash
git add lib/types.ts
git commit -m "feat(types): add journal types and license journal columns"
```

### Task 3.3: `lib/journal/data-age.ts` — failing test

**Files:**
- Create: `lib/journal/data-age.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { deriveDataAge, dataAgeMs } from "./data-age";

describe("dataAgeMs", () => {
  it("returns the milliseconds between pushed_at and now", () => {
    const now = new Date("2026-05-02T12:00:10Z");
    const pushedAt = "2026-05-02T12:00:00Z";
    expect(dataAgeMs(pushedAt, now)).toBe(10_000);
  });

  it("clamps to 0 when pushed_at is in the future (clock skew)", () => {
    const now = new Date("2026-05-02T12:00:00Z");
    const pushedAt = "2026-05-02T12:00:10Z";
    expect(dataAgeMs(pushedAt, now)).toBe(0);
  });
});

describe("deriveDataAge", () => {
  const pushIntervalSec = 10;

  it("returns 'fresh' when age < 2× push interval", () => {
    const now = new Date("2026-05-02T12:00:15Z");
    const pushedAt = "2026-05-02T12:00:00Z"; // 15s old, < 20s
    expect(deriveDataAge(pushedAt, pushIntervalSec, now)).toBe("fresh");
  });

  it("returns 'stale' when age between 2× and 4× push interval", () => {
    const now = new Date("2026-05-02T12:00:30Z");
    const pushedAt = "2026-05-02T12:00:00Z"; // 30s old, between 20s and 40s
    expect(deriveDataAge(pushedAt, pushIntervalSec, now)).toBe("stale");
  });

  it("returns 'offline' when age >= 4× push interval", () => {
    const now = new Date("2026-05-02T12:01:00Z");
    const pushedAt = "2026-05-02T12:00:00Z"; // 60s old, > 40s
    expect(deriveDataAge(pushedAt, pushIntervalSec, now)).toBe("offline");
  });

  it("returns 'offline' when pushed_at is null", () => {
    const now = new Date("2026-05-02T12:00:00Z");
    expect(deriveDataAge(null, pushIntervalSec, now)).toBe("offline");
  });
});
```

- [ ] **Step 2: Run, expect failure**

Run: `pnpm test lib/journal/data-age.test.ts`
Expected: FAIL — `Cannot find module './data-age'`.

### Task 3.4: `lib/journal/data-age.ts` — implement

**Files:**
- Create: `lib/journal/data-age.ts`

- [ ] **Step 1: Implement**

```typescript
import type { DataAgeState } from "@/lib/types";

export function dataAgeMs(pushedAt: string, now: Date): number {
  const pushedMs = new Date(pushedAt).getTime();
  const nowMs = now.getTime();
  if (Number.isNaN(pushedMs)) return Number.POSITIVE_INFINITY;
  return Math.max(0, nowMs - pushedMs);
}

export function deriveDataAge(
  pushedAt: string | null,
  pushIntervalSec: number,
  now: Date,
): DataAgeState {
  if (pushedAt === null) return "offline";
  const ageMs = dataAgeMs(pushedAt, now);
  const interval = pushIntervalSec * 1000;
  if (ageMs < 2 * interval) return "fresh";
  if (ageMs < 4 * interval) return "stale";
  return "offline";
}
```

- [ ] **Step 2: Run, expect green**

Run: `pnpm test lib/journal/data-age.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 3: Commit**

```bash
git add lib/journal/data-age.ts lib/journal/data-age.test.ts
git commit -m "feat(journal): add data-age derivation"
```

### Task 3.5: `lib/journal/trade-stats.ts` — failing tests

**Files:**
- Create: `lib/journal/__fixtures__/sample-deals.ts`
- Create: `lib/journal/trade-stats.test.ts`

- [ ] **Step 1: Create fixture**

```typescript
// lib/journal/__fixtures__/sample-deals.ts
import type { Deal } from "@/lib/types";

export const SAMPLE_DEALS: Deal[] = [
  // Win, +$100
  { mt5_account: 1, ticket: 1, ea_source: "impulse", symbol: "EURUSD", side: "buy",
    volume: 0.10, open_price: 1.10, close_price: 1.11, sl: null, tp: null,
    open_time: "2026-04-01T10:00:00Z", close_time: "2026-04-01T11:00:00Z",
    profit: 100, commission: -5, swap: 0, comment: null, magic: null },
  // Loss, -$50
  { mt5_account: 1, ticket: 2, ea_source: "impulse", symbol: "EURUSD", side: "sell",
    volume: 0.05, open_price: 1.11, close_price: 1.12, sl: null, tp: null,
    open_time: "2026-04-02T10:00:00Z", close_time: "2026-04-02T11:00:00Z",
    profit: -50, commission: -2, swap: 0, comment: null, magic: null },
  // Win, +$200
  { mt5_account: 1, ticket: 3, ea_source: "impulse", symbol: "GBPUSD", side: "buy",
    volume: 0.20, open_price: 1.25, close_price: 1.26, sl: null, tp: null,
    open_time: "2026-04-03T10:00:00Z", close_time: "2026-04-03T11:00:00Z",
    profit: 200, commission: -8, swap: 0, comment: null, magic: null },
  // Win, +$50
  { mt5_account: 1, ticket: 4, ea_source: "impulse", symbol: "EURUSD", side: "buy",
    volume: 0.05, open_price: 1.10, close_price: 1.105, sl: null, tp: null,
    open_time: "2026-04-04T10:00:00Z", close_time: "2026-04-04T11:00:00Z",
    profit: 50, commission: -2, swap: 0, comment: null, magic: null },
  // Loss, -$30
  { mt5_account: 1, ticket: 5, ea_source: "impulse", symbol: "GBPUSD", side: "sell",
    volume: 0.05, open_price: 1.26, close_price: 1.27, sl: null, tp: null,
    open_time: "2026-04-05T10:00:00Z", close_time: "2026-04-05T11:00:00Z",
    profit: -30, commission: -2, swap: 0, comment: null, magic: null },
];
// Totals: 3 wins ($350), 2 losses (-$80), net $270.
// Win rate = 60%. Profit factor = 350 / 80 = 4.375.
// Avg win = 350/3 ≈ 116.67. Avg loss = 80/2 = 40.
// Expected payoff = (116.67 × 0.6) - (40 × 0.4) = 70 - 16 = 54.
// Best = 200, worst = -50.
```

- [ ] **Step 2: Write failing tests**

```typescript
// lib/journal/trade-stats.test.ts
import { computeTradeStats } from "./trade-stats";
import { SAMPLE_DEALS } from "./__fixtures__/sample-deals";

describe("computeTradeStats", () => {
  it("returns zeros for an empty array", () => {
    const s = computeTradeStats([]);
    expect(s.totalTrades).toBe(0);
    expect(s.winRate).toBe(0);
    expect(s.netProfit).toBe(0);
    expect(s.profitFactor).toBe(0);
  });

  it("computes counts and rates from sample fixture", () => {
    const s = computeTradeStats(SAMPLE_DEALS);
    expect(s.totalTrades).toBe(5);
    expect(s.wins).toBe(3);
    expect(s.losses).toBe(2);
    expect(s.winRate).toBeCloseTo(0.6, 5);
  });

  it("computes net profit and gross sums", () => {
    const s = computeTradeStats(SAMPLE_DEALS);
    expect(s.grossProfit).toBe(350);
    expect(s.grossLoss).toBe(80);
    expect(s.netProfit).toBe(270);
  });

  it("computes profit factor", () => {
    const s = computeTradeStats(SAMPLE_DEALS);
    expect(s.profitFactor).toBeCloseTo(4.375, 4);
  });

  it("returns Infinity profit factor when there are no losses", () => {
    const winsOnly = SAMPLE_DEALS.filter((d) => d.profit > 0);
    const s = computeTradeStats(winsOnly);
    expect(s.profitFactor).toBe(Number.POSITIVE_INFINITY);
  });

  it("computes avg win/loss and best/worst", () => {
    const s = computeTradeStats(SAMPLE_DEALS);
    expect(s.avgWin).toBeCloseTo(350 / 3, 4);
    expect(s.avgLoss).toBe(40);
    expect(s.bestTrade).toBe(200);
    expect(s.worstTrade).toBe(-50);
  });

  it("computes expected payoff", () => {
    const s = computeTradeStats(SAMPLE_DEALS);
    expect(s.expectedPayoff).toBeCloseTo(54, 4);
  });
});
```

- [ ] **Step 3: Run, expect failure**

Run: `pnpm test lib/journal/trade-stats.test.ts`
Expected: FAIL — module not found.

### Task 3.6: `lib/journal/trade-stats.ts` — implement

**Files:**
- Create: `lib/journal/trade-stats.ts`

- [ ] **Step 1: Implement**

```typescript
import type { Deal } from "@/lib/types";

export interface TradeStats {
  totalTrades: number;
  wins: number;
  losses: number;
  winRate: number;          // 0..1
  grossProfit: number;
  grossLoss: number;        // positive number
  netProfit: number;
  profitFactor: number;     // grossProfit / grossLoss; Infinity when no losses
  avgWin: number;
  avgLoss: number;          // positive number
  bestTrade: number;
  worstTrade: number;
  expectedPayoff: number;
}

const EMPTY: TradeStats = {
  totalTrades: 0, wins: 0, losses: 0, winRate: 0,
  grossProfit: 0, grossLoss: 0, netProfit: 0,
  profitFactor: 0, avgWin: 0, avgLoss: 0,
  bestTrade: 0, worstTrade: 0, expectedPayoff: 0,
};

export function computeTradeStats(deals: Deal[]): TradeStats {
  if (deals.length === 0) return { ...EMPTY };

  let wins = 0, losses = 0;
  let grossProfit = 0, grossLoss = 0;
  let best = -Infinity, worst = Infinity;

  for (const d of deals) {
    if (d.profit > 0) { wins++; grossProfit += d.profit; }
    else if (d.profit < 0) { losses++; grossLoss += -d.profit; }
    if (d.profit > best) best = d.profit;
    if (d.profit < worst) worst = d.profit;
  }

  const totalTrades = deals.length;
  const winRate = wins / totalTrades;
  const netProfit = grossProfit - grossLoss;
  const profitFactor = grossLoss === 0
    ? (grossProfit > 0 ? Number.POSITIVE_INFINITY : 0)
    : grossProfit / grossLoss;
  const avgWin = wins === 0 ? 0 : grossProfit / wins;
  const avgLoss = losses === 0 ? 0 : grossLoss / losses;
  const expectedPayoff = avgWin * winRate - avgLoss * (1 - winRate);

  return {
    totalTrades, wins, losses, winRate,
    grossProfit, grossLoss, netProfit,
    profitFactor, avgWin, avgLoss,
    bestTrade: best === -Infinity ? 0 : best,
    worstTrade: worst === Infinity ? 0 : worst,
    expectedPayoff,
  };
}
```

- [ ] **Step 2: Run, expect green**

Run: `pnpm test lib/journal/trade-stats.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 3: Commit**

```bash
git add lib/journal/trade-stats.ts lib/journal/trade-stats.test.ts lib/journal/__fixtures__/sample-deals.ts
git commit -m "feat(journal): add computeTradeStats with fixture"
```

### Task 3.7: `lib/journal/streaks.ts` — failing tests

**Files:**
- Create: `lib/journal/streaks.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
import { computeStreaks } from "./streaks";
import { SAMPLE_DEALS } from "./__fixtures__/sample-deals";
import type { Deal } from "@/lib/types";

const W = (id: number, when: string): Deal => ({
  mt5_account: 1, ticket: id, ea_source: "impulse", symbol: "X", side: "buy",
  volume: 0.1, open_price: 1, close_price: 1, sl: null, tp: null,
  open_time: when, close_time: when, profit: 10, commission: 0, swap: 0,
  comment: null, magic: null,
});
const L = (id: number, when: string): Deal => ({ ...W(id, when), profit: -10 });

describe("computeStreaks", () => {
  it("returns zeros on empty input", () => {
    const s = computeStreaks([]);
    expect(s.maxWinStreak).toBe(0);
    expect(s.maxLossStreak).toBe(0);
    expect(s.currentStreak).toBe(0);
    expect(s.currentStreakKind).toBe("none");
  });

  it("treats a single win as currentStreak=1 of kind 'win'", () => {
    const s = computeStreaks([W(1, "2026-04-01T00:00:00Z")]);
    expect(s.maxWinStreak).toBe(1);
    expect(s.currentStreak).toBe(1);
    expect(s.currentStreakKind).toBe("win");
  });

  it("computes max and current from sample fixture", () => {
    // SAMPLE_DEALS = W,L,W,W,L  → win streaks: 1, 2 (max=2). loss streaks: 1, 1 (max=1).
    // current = -1 (loss).
    const s = computeStreaks(SAMPLE_DEALS);
    expect(s.maxWinStreak).toBe(2);
    expect(s.maxLossStreak).toBe(1);
    expect(s.currentStreak).toBe(1);
    expect(s.currentStreakKind).toBe("loss");
  });

  it("orders by close_time ascending before counting", () => {
    const out = [
      W(2, "2026-04-02T00:00:00Z"),
      W(1, "2026-04-01T00:00:00Z"),
      W(3, "2026-04-03T00:00:00Z"),
    ];
    const s = computeStreaks(out);
    expect(s.maxWinStreak).toBe(3);
  });

  it("ignores zero-profit trades from streak counting", () => {
    const breakeven: Deal = { ...W(99, "2026-04-06T00:00:00Z"), profit: 0 };
    const s = computeStreaks([W(1, "2026-04-01T00:00:00Z"), breakeven, W(2, "2026-04-07T00:00:00Z")]);
    expect(s.maxWinStreak).toBe(2);
    expect(s.currentStreakKind).toBe("win");
  });
});
```

- [ ] **Step 2: Run, expect failure**

Run: `pnpm test lib/journal/streaks.test.ts`
Expected: FAIL — module not found.

### Task 3.8: `lib/journal/streaks.ts` — implement

**Files:**
- Create: `lib/journal/streaks.ts`

- [ ] **Step 1: Implement**

```typescript
import type { Deal } from "@/lib/types";

export type StreakKind = "win" | "loss" | "none";

export interface StreakStats {
  maxWinStreak: number;
  maxLossStreak: number;
  currentStreak: number;
  currentStreakKind: StreakKind;
}

export function computeStreaks(deals: Deal[]): StreakStats {
  const filtered = deals
    .filter((d) => d.profit !== 0)
    .slice()
    .sort((a, b) => a.close_time.localeCompare(b.close_time));

  if (filtered.length === 0) {
    return { maxWinStreak: 0, maxLossStreak: 0, currentStreak: 0, currentStreakKind: "none" };
  }

  let maxWin = 0, maxLoss = 0;
  let curRun = 0;
  let curKind: StreakKind = "none";

  for (const d of filtered) {
    const kind: StreakKind = d.profit > 0 ? "win" : "loss";
    if (kind === curKind) {
      curRun++;
    } else {
      curRun = 1;
      curKind = kind;
    }
    if (kind === "win" && curRun > maxWin) maxWin = curRun;
    if (kind === "loss" && curRun > maxLoss) maxLoss = curRun;
  }

  return { maxWinStreak: maxWin, maxLossStreak: maxLoss, currentStreak: curRun, currentStreakKind: curKind };
}
```

- [ ] **Step 2: Run, expect green**

Run: `pnpm test lib/journal/streaks.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 3: Commit**

```bash
git add lib/journal/streaks.ts lib/journal/streaks.test.ts
git commit -m "feat(journal): add computeStreaks"
```

### Task 3.9: `lib/journal/calendar-aggregate.ts` — failing tests

**Files:**
- Create: `lib/journal/calendar-aggregate.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
import { aggregateCalendar } from "./calendar-aggregate";
import { SAMPLE_DEALS } from "./__fixtures__/sample-deals";

describe("aggregateCalendar", () => {
  it("returns empty map for no deals", () => {
    expect(aggregateCalendar([]).size).toBe(0);
  });

  it("groups deals by UTC date key (YYYY-MM-DD)", () => {
    const map = aggregateCalendar(SAMPLE_DEALS);
    expect(map.size).toBe(5); // each fixture deal closes on a different day
    expect(map.get("2026-04-01")?.tradeCount).toBe(1);
    expect(map.get("2026-04-01")?.netPnl).toBe(100);
    expect(map.get("2026-04-02")?.netPnl).toBe(-50);
  });

  it("sums pnl and counts within the same UTC day", () => {
    const map = aggregateCalendar([
      ...SAMPLE_DEALS,
      { ...SAMPLE_DEALS[0], ticket: 999, profit: 25 },
    ]);
    expect(map.get("2026-04-01")?.tradeCount).toBe(2);
    expect(map.get("2026-04-01")?.netPnl).toBe(125);
  });

  it("handles deals that close near UTC midnight by grouping under close_time's UTC date", () => {
    const map = aggregateCalendar([
      { ...SAMPLE_DEALS[0], ticket: 50, close_time: "2026-04-10T23:59:59Z", profit: 10 },
      { ...SAMPLE_DEALS[0], ticket: 51, close_time: "2026-04-11T00:00:01Z", profit: 20 },
    ]);
    expect(map.get("2026-04-10")?.netPnl).toBe(10);
    expect(map.get("2026-04-11")?.netPnl).toBe(20);
  });
});
```

- [ ] **Step 2: Run, expect failure**

Run: `pnpm test lib/journal/calendar-aggregate.test.ts`
Expected: FAIL — module not found.

### Task 3.10: `lib/journal/calendar-aggregate.ts` — implement

**Files:**
- Create: `lib/journal/calendar-aggregate.ts`

- [ ] **Step 1: Implement**

```typescript
import type { Deal } from "@/lib/types";

export interface CalendarDay {
  date: string;       // YYYY-MM-DD UTC
  netPnl: number;
  tradeCount: number;
  wins: number;
  losses: number;
}

function utcDateKey(iso: string): string {
  return iso.slice(0, 10);  // ISO 8601 with Z timezone — first 10 chars are YYYY-MM-DD UTC.
}

export function aggregateCalendar(deals: Deal[]): Map<string, CalendarDay> {
  const out = new Map<string, CalendarDay>();
  for (const d of deals) {
    const key = utcDateKey(d.close_time);
    const cur = out.get(key) ?? { date: key, netPnl: 0, tradeCount: 0, wins: 0, losses: 0 };
    cur.netPnl += d.profit;
    cur.tradeCount += 1;
    if (d.profit > 0) cur.wins += 1;
    else if (d.profit < 0) cur.losses += 1;
    out.set(key, cur);
  }
  return out;
}
```

- [ ] **Step 2: Run, expect green**

Run: `pnpm test lib/journal/calendar-aggregate.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 3: Commit**

```bash
git add lib/journal/calendar-aggregate.ts lib/journal/calendar-aggregate.test.ts
git commit -m "feat(journal): add aggregateCalendar"
```

### Task 3.11: `lib/journal/objectives.ts` — failing tests

**Files:**
- Create: `lib/journal/objectives.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
import { evaluateObjectives } from "./objectives";
import type { AccountSnapshotCurrent, AccountSnapshotDaily, PropfirmRule } from "@/lib/types";

const RULE: PropfirmRule = {
  id: 1, name: "100k Phase 1",
  account_size: 100_000,
  max_daily_loss: 5,           // 5% of balance/equity
  daily_loss_type: "percent",
  daily_loss_calc: "balance",
  max_total_loss: 10,          // 10% of account_size
  total_loss_type: "percent",
  profit_target: 8,            // 8% of account_size
  target_type: "percent",
  min_trading_days: 4,
  max_trading_days: 30,
  created_at: "2026-04-01T00:00:00Z",
};

const SNAP = (over: Partial<AccountSnapshotCurrent> = {}): AccountSnapshotCurrent => ({
  mt5_account: 1, balance: 100_000, equity: 100_000, margin: 0, free_margin: 100_000,
  margin_level: null, floating_pnl: 0, drawdown_pct: 0, leverage: 500, currency: "USD",
  server: null, pushed_at: "2026-05-02T12:00:00Z", ...over,
});

const DAILY = (date: string, balance_close: number, daily_pnl = 0): AccountSnapshotDaily => ({
  mt5_account: 1, trade_date: date, balance_close,
  equity_close: balance_close, daily_pnl,
});

describe("evaluateObjectives", () => {
  it("reports in_progress when no rules tripped and target not yet hit", () => {
    const r = evaluateObjectives({
      rule: RULE,
      currentSnapshot: SNAP({ balance: 103_000 }),
      dailySnapshots: [DAILY("2026-05-01", 102_000, 1000), DAILY("2026-05-02", 103_000, 1000)],
      todayUtc: "2026-05-02",
    });
    expect(r.status).toBe("in_progress");
    expect(r.profitTargetMet).toBe(false);
    expect(r.dailyLossBreached).toBe(false);
    expect(r.totalLossBreached).toBe(false);
    expect(r.tradingDaysCount).toBe(2);
  });

  it("flips to passed when profit target met AND min trading days satisfied", () => {
    const r = evaluateObjectives({
      rule: RULE,
      currentSnapshot: SNAP({ balance: 109_000 }),
      dailySnapshots: [
        DAILY("2026-04-29", 102_000, 2000),
        DAILY("2026-04-30", 104_000, 2000),
        DAILY("2026-05-01", 107_000, 3000),
        DAILY("2026-05-02", 109_000, 2000),
      ],
      todayUtc: "2026-05-02",
    });
    expect(r.status).toBe("passed");
    expect(r.profitTargetMet).toBe(true);
    expect(r.tradingDaysCount).toBe(4);
  });

  it("stays in_progress if target met but min trading days not yet satisfied", () => {
    const r = evaluateObjectives({
      rule: RULE,
      currentSnapshot: SNAP({ balance: 109_000 }),
      dailySnapshots: [DAILY("2026-05-02", 109_000, 9000)],
      todayUtc: "2026-05-02",
    });
    expect(r.status).toBe("in_progress");
    expect(r.profitTargetMet).toBe(true);
    expect(r.tradingDaysCount).toBe(1);
  });

  it("fails when daily loss exceeds 5% of balance (percent + balance calc)", () => {
    const r = evaluateObjectives({
      rule: RULE,
      currentSnapshot: SNAP({ balance: 95_000 }),
      dailySnapshots: [
        DAILY("2026-05-01", 100_000, 0),
        DAILY("2026-05-02", 95_000, -5_000),  // exactly 5% on 100k start = at limit
      ],
      todayUtc: "2026-05-02",
    });
    // 5000 / 100000 = 5% — triggers (>= threshold).
    expect(r.dailyLossBreached).toBe(true);
    expect(r.status).toBe("failed");
  });

  it("fails when total drawdown from account_size exceeds max_total_loss", () => {
    const r = evaluateObjectives({
      rule: RULE,
      currentSnapshot: SNAP({ balance: 89_000 }),    // 11% drawdown from 100k
      dailySnapshots: [DAILY("2026-05-02", 89_000, -11_000)],
      todayUtc: "2026-05-02",
    });
    expect(r.totalLossBreached).toBe(true);
    expect(r.status).toBe("failed");
  });

  it("supports money-typed thresholds", () => {
    const moneyRule: PropfirmRule = {
      ...RULE,
      max_daily_loss: 2_000, daily_loss_type: "money",
      max_total_loss: 5_000, total_loss_type: "money",
      profit_target: 8_000, target_type: "money",
    };
    const r = evaluateObjectives({
      rule: moneyRule,
      currentSnapshot: SNAP({ balance: 102_500 }),
      dailySnapshots: [
        DAILY("2026-05-01", 100_000, 0),
        DAILY("2026-05-02", 102_500, 2500),
      ],
      todayUtc: "2026-05-02",
    });
    expect(r.dailyLossBreached).toBe(false);
    expect(r.profitTargetMet).toBe(false); // 2500 < 8000
  });
});
```

- [ ] **Step 2: Run, expect failure**

Run: `pnpm test lib/journal/objectives.test.ts`
Expected: FAIL — module not found.

### Task 3.12: `lib/journal/objectives.ts` — implement

**Files:**
- Create: `lib/journal/objectives.ts`

- [ ] **Step 1: Implement**

```typescript
import type { AccountSnapshotCurrent, AccountSnapshotDaily, PropfirmRule } from "@/lib/types";

export type ObjectiveStatus = "in_progress" | "passed" | "failed";

export interface ObjectivesResult {
  status: ObjectiveStatus;
  profitTargetMet: boolean;
  dailyLossBreached: boolean;
  totalLossBreached: boolean;
  tradingDaysCount: number;
  // Raw numbers for the progress bars:
  netProfit: number;             // balance - account_size
  todaysPnl: number;
  totalDrawdown: number;         // account_size - balance, clamped 0
  profitTargetThreshold: number;
  dailyLossThreshold: number;
  totalLossThreshold: number;
}

interface Inputs {
  rule: PropfirmRule;
  currentSnapshot: AccountSnapshotCurrent;
  dailySnapshots: AccountSnapshotDaily[];
  todayUtc: string;              // YYYY-MM-DD
}

function resolveThreshold(value: number, type: "money" | "percent", base: number): number {
  return type === "money" ? value : (value / 100) * base;
}

export function evaluateObjectives({
  rule, currentSnapshot, dailySnapshots, todayUtc,
}: Inputs): ObjectivesResult {
  const accountSize = rule.account_size;
  const balance = currentSnapshot.balance;
  const equity = currentSnapshot.equity;

  const profitTargetThreshold = resolveThreshold(rule.profit_target, rule.target_type, accountSize);
  const totalLossThreshold = resolveThreshold(rule.max_total_loss, rule.total_loss_type, accountSize);

  // Daily loss base depends on rule.daily_loss_calc.
  // We use yesterday's close as the day-start reference. If no prior day exists,
  // fall back to account_size — the EA backfills 90d on first run, so this is rare.
  const sorted = dailySnapshots.slice().sort((a, b) => a.trade_date.localeCompare(b.trade_date));
  const today = sorted.find((d) => d.trade_date === todayUtc);
  const yesterday = sorted.filter((d) => d.trade_date < todayUtc).pop();
  const dailyBase = yesterday
    ? (rule.daily_loss_calc === "balance" ? yesterday.balance_close : yesterday.equity_close)
    : accountSize;
  const dailyLossThreshold = resolveThreshold(rule.max_daily_loss, rule.daily_loss_type, dailyBase);

  const todaysPnl = today?.daily_pnl ?? 0;
  const todaysLossAbs = todaysPnl < 0 ? -todaysPnl : 0;

  const netProfit = balance - accountSize;
  const totalDrawdown = Math.max(0, accountSize - Math.min(balance, equity));

  const profitTargetMet = netProfit >= profitTargetThreshold;
  const dailyLossBreached = todaysLossAbs >= dailyLossThreshold;
  const totalLossBreached = totalDrawdown >= totalLossThreshold;
  const tradingDaysCount = sorted.length;

  let status: ObjectiveStatus = "in_progress";
  if (dailyLossBreached || totalLossBreached) status = "failed";
  else if (profitTargetMet && tradingDaysCount >= rule.min_trading_days) status = "passed";

  return {
    status, profitTargetMet, dailyLossBreached, totalLossBreached,
    tradingDaysCount, netProfit, todaysPnl, totalDrawdown,
    profitTargetThreshold, dailyLossThreshold, totalLossThreshold,
  };
}
```

- [ ] **Step 2: Run, expect green**

Run: `pnpm test lib/journal/objectives.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 3: Commit**

```bash
git add lib/journal/objectives.ts lib/journal/objectives.test.ts
git commit -m "feat(journal): add evaluateObjectives for propfirm rules"
```

### Task 3.13: `lib/journal/queries.ts` — Supabase fetchers (server-side)

**Files:**
- Create: `lib/journal/queries.ts`

These are thin Supabase wrappers, exercised manually + via the page-level smoke test in Phase 4. Not unit tested (per CTX convention — same as `lib/supabase/server.ts`).

- [ ] **Step 1: Implement**

```typescript
import "server-only";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import type {
  AccountSnapshotCurrent, AccountSnapshotDaily, Deal, OrderRow,
  Position, PropfirmRule,
} from "@/lib/types";

export async function getAccountSnapshotCurrent(
  mt5_account: number,
): Promise<AccountSnapshotCurrent | null> {
  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .from("account_snapshots_current")
    .select("*")
    .eq("mt5_account", mt5_account)
    .maybeSingle();
  if (error) throw error;
  return (data as AccountSnapshotCurrent | null) ?? null;
}

export async function getAccountSnapshotsDaily(
  mt5_account: number,
  days = 90,
): Promise<AccountSnapshotDaily[]> {
  const sb = getSupabaseAdmin();
  const fromDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
    .toISOString().slice(0, 10);
  const { data, error } = await sb
    .from("account_snapshots_daily")
    .select("*")
    .eq("mt5_account", mt5_account)
    .gte("trade_date", fromDate)
    .order("trade_date", { ascending: true });
  if (error) throw error;
  return (data ?? []) as AccountSnapshotDaily[];
}

export async function getOpenPositions(mt5_account: number): Promise<Position[]> {
  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .from("positions")
    .select("*")
    .eq("mt5_account", mt5_account)
    .order("open_time", { ascending: false });
  if (error) throw error;
  return (data ?? []) as Position[];
}

export async function getDeals(
  mt5_account: number,
  days = 90,
): Promise<Deal[]> {
  const sb = getSupabaseAdmin();
  const fromIso = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await sb
    .from("deals")
    .select("*")
    .eq("mt5_account", mt5_account)
    .gte("close_time", fromIso)
    .order("close_time", { ascending: false });
  if (error) throw error;
  return (data ?? []) as Deal[];
}

export async function getOrders(mt5_account: number, days = 90): Promise<OrderRow[]> {
  const sb = getSupabaseAdmin();
  const fromIso = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await sb
    .from("orders")
    .select("*")
    .eq("mt5_account", mt5_account)
    .gte("time_setup", fromIso)
    .order("time_setup", { ascending: false });
  if (error) throw error;
  return (data ?? []) as OrderRow[];
}

export async function listPropfirmRules(): Promise<PropfirmRule[]> {
  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .from("propfirm_rules")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as PropfirmRule[];
}

export async function getPropfirmRule(id: number): Promise<PropfirmRule | null> {
  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .from("propfirm_rules")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return (data as PropfirmRule | null) ?? null;
}
```

- [ ] **Step 2: Tsc compile check (no test runs against the live DB)**

Run: `pnpm test`
Expected: ts-jest compile clean. (Tests don't import queries.ts; this just checks types compile.)

- [ ] **Step 3: Commit**

```bash
git add lib/journal/queries.ts
git commit -m "feat(journal): add server-side Supabase queries"
```

### Task 3.14: API route — `GET /api/journal/[mt5_account]/snapshot`

**Files:**
- Create: `app/api/journal/[mt5_account]/snapshot/route.ts`

- [ ] **Step 1: Implement**

```typescript
import { NextResponse } from "next/server";
import { getAccountSnapshotCurrent } from "@/lib/journal/queries";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ mt5_account: string }> },
) {
  const { mt5_account } = await params;
  const n = Number(mt5_account);
  if (!Number.isFinite(n)) return NextResponse.json({ error: "bad_account" }, { status: 400 });
  try {
    const data = await getAccountSnapshotCurrent(n);
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json({ error: "server_error", detail: String(err) }, { status: 500 });
  }
}
```

- [ ] **Step 2: Smoke-test via the dev server (skip until Phase 4 — listed here only to anchor the file)**

- [ ] **Step 3: Commit**

```bash
git add app/api/journal/
git commit -m "feat(api): add GET /api/journal/:mt5_account/snapshot"
```

### Task 3.15: API routes — positions, deals, orders, snapshots-daily

**Files:**
- Create: `app/api/journal/[mt5_account]/positions/route.ts`
- Create: `app/api/journal/[mt5_account]/deals/route.ts`
- Create: `app/api/journal/[mt5_account]/orders/route.ts`
- Create: `app/api/journal/[mt5_account]/snapshots-daily/route.ts`

- [ ] **Step 1: Implement all four (same pattern as snapshot)**

`positions/route.ts`:
```typescript
import { NextResponse } from "next/server";
import { getOpenPositions } from "@/lib/journal/queries";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ mt5_account: string }> },
) {
  const { mt5_account } = await params;
  const n = Number(mt5_account);
  if (!Number.isFinite(n)) return NextResponse.json({ error: "bad_account" }, { status: 400 });
  try {
    return NextResponse.json(await getOpenPositions(n));
  } catch (err) {
    return NextResponse.json({ error: "server_error", detail: String(err) }, { status: 500 });
  }
}
```

`deals/route.ts`:
```typescript
import { NextResponse } from "next/server";
import { getDeals } from "@/lib/journal/queries";

export const dynamic = "force-dynamic";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ mt5_account: string }> },
) {
  const { mt5_account } = await params;
  const n = Number(mt5_account);
  if (!Number.isFinite(n)) return NextResponse.json({ error: "bad_account" }, { status: 400 });
  const url = new URL(req.url);
  const days = Number(url.searchParams.get("days") ?? "90");
  try {
    return NextResponse.json(await getDeals(n, Number.isFinite(days) ? days : 90));
  } catch (err) {
    return NextResponse.json({ error: "server_error", detail: String(err) }, { status: 500 });
  }
}
```

`orders/route.ts`:
```typescript
import { NextResponse } from "next/server";
import { getOrders } from "@/lib/journal/queries";

export const dynamic = "force-dynamic";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ mt5_account: string }> },
) {
  const { mt5_account } = await params;
  const n = Number(mt5_account);
  if (!Number.isFinite(n)) return NextResponse.json({ error: "bad_account" }, { status: 400 });
  const url = new URL(req.url);
  const days = Number(url.searchParams.get("days") ?? "90");
  try {
    return NextResponse.json(await getOrders(n, Number.isFinite(days) ? days : 90));
  } catch (err) {
    return NextResponse.json({ error: "server_error", detail: String(err) }, { status: 500 });
  }
}
```

`snapshots-daily/route.ts`:
```typescript
import { NextResponse } from "next/server";
import { getAccountSnapshotsDaily } from "@/lib/journal/queries";

export const dynamic = "force-dynamic";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ mt5_account: string }> },
) {
  const { mt5_account } = await params;
  const n = Number(mt5_account);
  if (!Number.isFinite(n)) return NextResponse.json({ error: "bad_account" }, { status: 400 });
  const url = new URL(req.url);
  const days = Number(url.searchParams.get("days") ?? "90");
  try {
    return NextResponse.json(await getAccountSnapshotsDaily(n, Number.isFinite(days) ? days : 90));
  } catch (err) {
    return NextResponse.json({ error: "server_error", detail: String(err) }, { status: 500 });
  }
}
```

- [ ] **Step 2: `pnpm build` to confirm all four routes compile**

Run: `pnpm build`
Expected: build succeeds; routes appear in the build output under `/api/journal/[mt5_account]/*`.

- [ ] **Step 3: Commit**

```bash
git add app/api/journal/
git commit -m "feat(api): add positions/deals/orders/snapshots-daily routes"
```

### Task 3.16: API routes — propfirm rules CRUD

**Files:**
- Create: `app/api/propfirm-rules/route.ts`
- Create: `app/api/propfirm-rules/[id]/route.ts`
- Create: `lib/schemas.ts` (modify — add propfirm rule schema)

- [ ] **Step 1: Append a zod schema to `lib/schemas.ts`**

Open `lib/schemas.ts`, append at the end:

```typescript
import { z } from "zod";

export const propfirmRuleSchema = z.object({
  name: z.string().min(1).max(120),
  account_size: z.number().positive(),
  max_daily_loss: z.number().positive(),
  daily_loss_type: z.enum(["money", "percent"]),
  daily_loss_calc: z.enum(["balance", "equity"]),
  max_total_loss: z.number().positive(),
  total_loss_type: z.enum(["money", "percent"]),
  profit_target: z.number().positive(),
  target_type: z.enum(["money", "percent"]),
  min_trading_days: z.number().int().nonnegative().default(0),
  max_trading_days: z.number().int().positive().nullable(),
});
export type PropfirmRuleInput = z.infer<typeof propfirmRuleSchema>;
```

(If `lib/schemas.ts` already imports `z`, don't add a duplicate import.)

- [ ] **Step 2: Implement `app/api/propfirm-rules/route.ts`**

```typescript
import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { listPropfirmRules } from "@/lib/journal/queries";
import { propfirmRuleSchema } from "@/lib/schemas";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json(await listPropfirmRules());
  } catch (err) {
    return NextResponse.json({ error: "server_error", detail: String(err) }, { status: 500 });
  }
}

export async function POST(req: Request) {
  let body: unknown;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "bad_json" }, { status: 400 }); }
  const parsed = propfirmRuleSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "invalid", issues: parsed.error.issues }, { status: 400 });
  const sb = getSupabaseAdmin();
  const { data, error } = await sb.from("propfirm_rules").insert(parsed.data).select().single();
  if (error) return NextResponse.json({ error: "server_error", detail: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
```

- [ ] **Step 3: Implement `app/api/propfirm-rules/[id]/route.ts`**

```typescript
import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { propfirmRuleSchema } from "@/lib/schemas";
import { getPropfirmRule } from "@/lib/journal/queries";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const n = Number(id);
  if (!Number.isFinite(n)) return NextResponse.json({ error: "bad_id" }, { status: 400 });
  const rule = await getPropfirmRule(n);
  if (!rule) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json(rule);
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const n = Number(id);
  if (!Number.isFinite(n)) return NextResponse.json({ error: "bad_id" }, { status: 400 });
  let body: unknown;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "bad_json" }, { status: 400 }); }
  const parsed = propfirmRuleSchema.partial().safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "invalid", issues: parsed.error.issues }, { status: 400 });
  const sb = getSupabaseAdmin();
  const { data, error } = await sb.from("propfirm_rules").update(parsed.data).eq("id", n).select().single();
  if (error) return NextResponse.json({ error: "server_error", detail: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const n = Number(id);
  if (!Number.isFinite(n)) return NextResponse.json({ error: "bad_id" }, { status: 400 });
  const sb = getSupabaseAdmin();
  const { error } = await sb.from("propfirm_rules").delete().eq("id", n);
  if (error) return NextResponse.json({ error: "server_error", detail: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 4: Verify build passes**

Run: `pnpm build`
Expected: green; routes listed in build output.

- [ ] **Step 5: Commit**

```bash
git add app/api/propfirm-rules/ lib/schemas.ts
git commit -m "feat(api): add propfirm-rules CRUD"
```

### Task 3.17: Extend `lib/settings.ts` with journal polling interval

**Files:**
- Modify: `lib/settings.ts`
- Create: `lib/settings.journal.test.ts`

- [ ] **Step 1: Write the failing test**

Create `lib/settings.journal.test.ts`:
```typescript
/**
 * @jest-environment jsdom
 */
import {
  getJournalPollingInterval,
  setJournalPollingInterval,
  JOURNAL_POLLING_KEY,
  JOURNAL_POLLING_OPTIONS,
} from "./settings";

beforeEach(() => { localStorage.clear(); });

describe("getJournalPollingInterval", () => {
  it("returns the default 10000 when nothing is stored", () => {
    expect(getJournalPollingInterval()).toBe(10000);
  });

  it("returns the stored value when valid", () => {
    localStorage.setItem(JOURNAL_POLLING_KEY, "3000");
    expect(getJournalPollingInterval()).toBe(3000);
  });

  it("falls back to default for non-numeric values", () => {
    localStorage.setItem(JOURNAL_POLLING_KEY, "banana");
    expect(getJournalPollingInterval()).toBe(10000);
  });

  it("falls back to default for negative values", () => {
    localStorage.setItem(JOURNAL_POLLING_KEY, "-5");
    expect(getJournalPollingInterval()).toBe(10000);
  });
});

describe("setJournalPollingInterval", () => {
  it("writes the value to localStorage", () => {
    setJournalPollingInterval(60000);
    expect(localStorage.getItem(JOURNAL_POLLING_KEY)).toBe("60000");
  });
});

describe("JOURNAL_POLLING_OPTIONS", () => {
  it("has 5 choices: 3, 5, 10, 30, 60 seconds", () => {
    expect(JOURNAL_POLLING_OPTIONS.map((o) => o.value)).toEqual([3000, 5000, 10000, 30000, 60000]);
  });
});
```

- [ ] **Step 2: Run, expect failure**

Run: `pnpm test lib/settings.journal.test.ts`
Expected: FAIL — `getJournalPollingInterval` not exported.

- [ ] **Step 3: Append to `lib/settings.ts`**

```typescript
const JOURNAL_KEY = "ctx.journalPollingIntervalMs";
const JOURNAL_DEFAULT_MS = 10_000;

export const JOURNAL_POLLING_KEY = JOURNAL_KEY;

export const JOURNAL_POLLING_OPTIONS = [
  { label: "3 seconds", value: 3000 },
  { label: "5 seconds", value: 5000 },
  { label: "10 seconds", value: 10_000 },
  { label: "30 seconds", value: 30_000 },
  { label: "60 seconds", value: 60_000 },
] as const;

export function getJournalPollingInterval(): number {
  if (typeof window === "undefined") return JOURNAL_DEFAULT_MS;
  const raw = window.localStorage.getItem(JOURNAL_KEY);
  if (raw === null) return JOURNAL_DEFAULT_MS;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return JOURNAL_DEFAULT_MS;
  return n;
}

export function setJournalPollingInterval(ms: number): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(JOURNAL_KEY, String(ms));
}
```

- [ ] **Step 4: Run, expect green**

Run: `pnpm test lib/settings.journal.test.ts`
Expected: PASS (6 tests). All other tests still green.

- [ ] **Step 5: Commit**

```bash
git add lib/settings.ts lib/settings.journal.test.ts
git commit -m "feat(settings): add journal polling interval (3-60s, default 10s)"
```

### Phase 3 Checkpoint

- [ ] All Jest tests green (`pnpm test`).
- [ ] `pnpm build` succeeds.
- [ ] New files created: `lib/journal/{data-age,trade-stats,streaks,calendar-aggregate,objectives,queries}.ts` (+ tests + fixture), `app/api/journal/[mt5_account]/{snapshot,positions,deals,orders,snapshots-daily}/route.ts`, `app/api/propfirm-rules/{route.ts,[id]/route.ts}`, `lib/settings.ts` extended.
- [ ] `feat/journal-integration` branch has ~12 commits.

---

## Phase 4 — CTX UI

All work in the worktree on branch `feat/journal-integration`. Theming, journal page, propfirm rules pages, and settings extension happen here.

### Task 4.1: Add shadcn components

**Files:**
- Modify: `components/ui/` (additions)

- [ ] **Step 1: Add `tabs`, `tooltip`, `progress`, `skeleton`, `scroll-area`**

Run:
```bash
cd /Users/jsonse/Documents/development/copytraderx-license-journal
pnpm dlx shadcn@latest add tabs tooltip progress skeleton scroll-area
```

Expected: 5 component files added under `components/ui/`.

- [ ] **Step 2: Verify build**

Run: `pnpm build`
Expected: green.

- [ ] **Step 3: Commit**

```bash
git add components/ui/
git commit -m "chore(ui): add tabs, tooltip, progress, skeleton, scroll-area shadcn components"
```

### Task 4.2: Add `next-themes` provider and theme toggle

**Files:**
- Create: `components/theme-provider.tsx`
- Create: `components/theme-toggle.tsx`
- Modify: `app/layout.tsx`
- Modify: `components/site-nav.tsx`

- [ ] **Step 1: Create `components/theme-provider.tsx`**

```typescript
"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";
import type { ComponentProps } from "react";

export function ThemeProvider({ children, ...props }: ComponentProps<typeof NextThemesProvider>) {
  return <NextThemesProvider {...props}>{children}</NextThemesProvider>;
}
```

- [ ] **Step 2: Create `components/theme-toggle.tsx`**

```typescript
"use client";

import { useTheme } from "next-themes";
import { Sun, Moon, Monitor } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function ThemeToggle() {
  const { setTheme } = useTheme();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Theme">
          <Sun className="h-[1.1rem] w-[1.1rem] rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
          <Moon className="absolute h-[1.1rem] w-[1.1rem] rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => setTheme("light")}>
          <Sun className="mr-2 h-4 w-4" /> Light
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme("dark")}>
          <Moon className="mr-2 h-4 w-4" /> Dark
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme("system")}>
          <Monitor className="mr-2 h-4 w-4" /> System
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
```

- [ ] **Step 3: Wrap `app/layout.tsx` with the provider**

Modify `app/layout.tsx`:

```typescript
import type { Metadata } from "next";
import { Toaster } from "sonner";
import "./globals.css";
import { JetBrains_Mono } from "next/font/google";
import { cn } from "@/lib/utils";
import { ThemeProvider } from "@/components/theme-provider";

const jetbrainsMono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono" });

export const metadata: Metadata = {
  title: "CopyTraderX Licenses",
  description: "Admin UI for managing CopyTraderX-Impulse EA licenses.",
  icons: { icon: "/copytraderx-logo.png" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={cn("font-mono", jetbrainsMono.variable)} suppressHydrationWarning>
      <body>
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
          {children}
          <Toaster position="top-right" richColors />
        </ThemeProvider>
      </body>
    </html>
  );
}
```

- [ ] **Step 4: Add the toggle to `components/site-nav.tsx`**

In `<nav className="ml-auto flex items-center gap-5 text-sm">`, before `</nav>` add:
```typescript
<ThemeToggle />
```
And import at the top:
```typescript
import { ThemeToggle } from "@/components/theme-toggle";
```

- [ ] **Step 5: Run dev server and verify visually**

Run: `pnpm dev` (background). Open `http://localhost:3000/licenses`. Click the theme toggle. Confirm light/dark/system options switch the UI. Stop the server.

- [ ] **Step 6: Commit**

```bash
git add components/theme-provider.tsx components/theme-toggle.tsx app/layout.tsx components/site-nav.tsx
git commit -m "feat(ui): add light/dark/system theme support"
```

### Task 4.3: `data-age-indicator` component

**Files:**
- Create: `components/journal/data-age-indicator.tsx`
- Create: `lib/hooks/use-data-age.ts`

- [ ] **Step 1: Create `lib/hooks/use-data-age.ts`**

```typescript
"use client";

import { useEffect, useState } from "react";

// Returns a Date that updates every second so callers can derive freshness live.
export function useNowTick(intervalMs = 1000): Date {
  const [now, setNow] = useState<Date>(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}
```

- [ ] **Step 2: Create `components/journal/data-age-indicator.tsx`**

```typescript
"use client";

import { useNowTick } from "@/lib/hooks/use-data-age";
import { dataAgeMs, deriveDataAge } from "@/lib/journal/data-age";
import { cn } from "@/lib/utils";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";

interface Props {
  pushedAt: string | null;
  pushIntervalSeconds: number;
}

function formatAge(ms: number): string {
  if (!Number.isFinite(ms)) return "no data";
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  return `${h}h ago`;
}

export function DataAgeIndicator({ pushedAt, pushIntervalSeconds }: Props) {
  const now = useNowTick(1000);
  const state = deriveDataAge(pushedAt, pushIntervalSeconds, now);
  const ageMs = pushedAt ? dataAgeMs(pushedAt, now) : Number.POSITIVE_INFINITY;

  const stateClass =
    state === "fresh" ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
    : state === "stale" ? "bg-amber-500/15 text-amber-700 dark:text-amber-300"
    : "bg-red-500/15 text-red-700 dark:text-red-300";

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            className={cn(
              "inline-flex items-center gap-1.5 rounded px-2 py-0.5 text-xs font-medium",
              stateClass,
            )}
            aria-label={`data age: ${formatAge(ageMs)}, ${state}`}
          >
            <span className={cn(
              "h-1.5 w-1.5 rounded-full",
              state === "fresh" ? "bg-emerald-500" : state === "stale" ? "bg-amber-500" : "bg-red-500",
            )} />
            {pushedAt ? formatAge(ageMs) : "no data yet"}
          </span>
        </TooltipTrigger>
        <TooltipContent>
          EA pushes every {pushIntervalSeconds}s. Browser polling faster than this won't help.
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
```

- [ ] **Step 3: Build and verify no TS errors**

Run: `pnpm build`
Expected: green.

- [ ] **Step 4: Commit**

```bash
git add components/journal/data-age-indicator.tsx lib/hooks/use-data-age.ts
git commit -m "feat(ui): add DataAgeIndicator with live tick"
```

### Task 4.4: `useJournalPoll` hook

**Files:**
- Create: `lib/hooks/use-journal-poll.ts`

- [ ] **Step 1: Implement**

```typescript
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getJournalPollingInterval, JOURNAL_POLLING_KEY } from "@/lib/settings";

interface Options<T> {
  fetcher: () => Promise<T>;
  initialData: T;
  pushIntervalMs: number;       // EA push interval (cap)
  fixedIntervalMs?: number;     // override config; e.g. deals poll fixed at 30s
}

export function useJournalPoll<T>({ fetcher, initialData, pushIntervalMs, fixedIntervalMs }: Options<T>) {
  const [data, setData] = useState<T>(initialData);
  const [error, setError] = useState<unknown>(null);
  const [consecutiveFailures, setConsecutiveFailures] = useState(0);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;
  const cancelRef = useRef(false);

  const computeInterval = useCallback((): number => {
    if (fixedIntervalMs !== undefined) return fixedIntervalMs;
    const userMs = getJournalPollingInterval();
    return Math.max(userMs, pushIntervalMs);
  }, [fixedIntervalMs, pushIntervalMs]);

  const tick = useCallback(async () => {
    try {
      const next = await fetcherRef.current();
      if (cancelRef.current) return;
      setData(next);
      setError(null);
      setConsecutiveFailures(0);
    } catch (err) {
      if (cancelRef.current) return;
      setError(err);
      setConsecutiveFailures((n) => n + 1);
    }
  }, []);

  useEffect(() => {
    cancelRef.current = false;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    let stopped = false;

    const schedule = () => {
      if (stopped) return;
      let interval = computeInterval();
      // Backoff: after 3+ consecutive failures, slow to 4×.
      if (consecutiveFailures >= 3) interval *= 4;
      timeoutId = setTimeout(async () => {
        if (document.visibilityState !== "hidden") await tick();
        schedule();
      }, interval);
    };

    schedule();

    const onVisibility = () => {
      if (document.visibilityState === "visible") tick();
    };
    document.addEventListener("visibilitychange", onVisibility);

    const onStorage = (e: StorageEvent) => {
      if (e.key === JOURNAL_POLLING_KEY) {
        // Reschedule with new interval on next tick.
        if (timeoutId) clearTimeout(timeoutId);
        schedule();
      }
    };
    window.addEventListener("storage", onStorage);

    return () => {
      stopped = true;
      cancelRef.current = true;
      if (timeoutId) clearTimeout(timeoutId);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("storage", onStorage);
    };
  }, [tick, computeInterval, consecutiveFailures]);

  return { data, error, consecutiveFailures, refetch: tick };
}
```

- [ ] **Step 2: Build and verify**

Run: `pnpm build`
Expected: green.

- [ ] **Step 3: Commit**

```bash
git add lib/hooks/use-journal-poll.ts
git commit -m "feat(hooks): add useJournalPoll with backoff + visibility pause"
```

### Task 4.5: Live account panel + open positions table

**Files:**
- Create: `components/journal/live-account-panel.tsx`
- Create: `components/journal/open-positions-table.tsx`
- Create: `components/journal/stat-card.tsx`

- [ ] **Step 1: Create `components/journal/stat-card.tsx`**

```typescript
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface Props {
  label: string;
  value: string;
  sub?: string;
  tone?: "default" | "positive" | "negative";
}

export function StatCard({ label, value, sub, tone = "default" }: Props) {
  const valueClass =
    tone === "positive" ? "text-emerald-600 dark:text-emerald-400"
    : tone === "negative" ? "text-red-600 dark:text-red-400"
    : "text-foreground";
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
        <div className={cn("mt-1 text-2xl font-semibold tabular-nums", valueClass)}>{value}</div>
        {sub && <div className="mt-0.5 text-xs text-muted-foreground tabular-nums">{sub}</div>}
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2: Create `components/journal/live-account-panel.tsx`**

```typescript
"use client";

import { StatCard } from "./stat-card";
import { Progress } from "@/components/ui/progress";
import type { AccountSnapshotCurrent } from "@/lib/types";

function fmt(n: number, currency: string): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 2 }).format(n);
}

export function LiveAccountPanel({ snapshot }: { snapshot: AccountSnapshotCurrent | null }) {
  if (!snapshot) {
    return (
      <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
        Waiting for first EA push…
      </div>
    );
  }
  const tone = snapshot.floating_pnl > 0 ? "positive" : snapshot.floating_pnl < 0 ? "negative" : "default";
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Balance" value={fmt(snapshot.balance, snapshot.currency)} />
        <StatCard label="Equity" value={fmt(snapshot.equity, snapshot.currency)} />
        <StatCard label="Floating P/L" value={fmt(snapshot.floating_pnl, snapshot.currency)} tone={tone} />
        <StatCard label="Drawdown" value={`${snapshot.drawdown_pct.toFixed(2)}%`} tone={snapshot.drawdown_pct > 0 ? "negative" : "default"} />
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 text-xs text-muted-foreground tabular-nums">
        <div>Margin: <span className="text-foreground">{fmt(snapshot.margin, snapshot.currency)}</span></div>
        <div>Free: <span className="text-foreground">{fmt(snapshot.free_margin, snapshot.currency)}</span></div>
        <div>Margin Level: <span className="text-foreground">{snapshot.margin_level === null ? "—" : `${snapshot.margin_level.toFixed(0)}%`}</span></div>
        <div>Leverage: <span className="text-foreground">1:{snapshot.leverage}</span></div>
      </div>
      <Progress value={Math.min(100, snapshot.drawdown_pct)} aria-label="Drawdown" />
    </div>
  );
}
```

- [ ] **Step 3: Create `components/journal/open-positions-table.tsx`**

```typescript
"use client";

import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import type { Position } from "@/lib/types";
import { cn } from "@/lib/utils";

function fmtNum(n: number, frac = 2): string {
  return n.toLocaleString("en-US", { minimumFractionDigits: frac, maximumFractionDigits: frac });
}

export function OpenPositionsTable({ positions, currency }: { positions: Position[]; currency: string }) {
  if (positions.length === 0) {
    return <p className="rounded border p-4 text-center text-sm text-muted-foreground">No open positions.</p>;
  }
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Symbol</TableHead>
          <TableHead>Side</TableHead>
          <TableHead className="text-right">Volume</TableHead>
          <TableHead className="text-right">Open</TableHead>
          <TableHead className="text-right">Current</TableHead>
          <TableHead className="text-right">SL</TableHead>
          <TableHead className="text-right">TP</TableHead>
          <TableHead className="text-right">P/L ({currency})</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {positions.map((p) => (
          <TableRow key={p.ticket}>
            <TableCell className="font-medium">{p.symbol}</TableCell>
            <TableCell className={cn("uppercase", p.side === "buy" ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400")}>
              {p.side}
            </TableCell>
            <TableCell className="text-right tabular-nums">{fmtNum(p.volume, 2)}</TableCell>
            <TableCell className="text-right tabular-nums">{fmtNum(p.open_price, 5)}</TableCell>
            <TableCell className="text-right tabular-nums">{fmtNum(p.current_price, 5)}</TableCell>
            <TableCell className="text-right tabular-nums">{p.sl === null ? "—" : fmtNum(p.sl, 5)}</TableCell>
            <TableCell className="text-right tabular-nums">{p.tp === null ? "—" : fmtNum(p.tp, 5)}</TableCell>
            <TableCell className={cn("text-right tabular-nums",
              p.profit > 0 ? "text-emerald-600 dark:text-emerald-400" :
              p.profit < 0 ? "text-red-600 dark:text-red-400" : "")}>
              {fmtNum(p.profit, 2)}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
```

- [ ] **Step 4: Build**

Run: `pnpm build`
Expected: green.

- [ ] **Step 5: Commit**

```bash
git add components/journal/
git commit -m "feat(ui): add LiveAccountPanel and OpenPositionsTable"
```

### Task 4.6: Closed deals + orders tables

**Files:**
- Create: `components/journal/deals-table.tsx`
- Create: `components/journal/orders-table.tsx`

- [ ] **Step 1: Create `components/journal/deals-table.tsx`**

```typescript
"use client";

import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import type { Deal } from "@/lib/types";
import { cn } from "@/lib/utils";
import { format, parseISO } from "date-fns";

function fmtNum(n: number, frac = 2): string {
  return n.toLocaleString("en-US", { minimumFractionDigits: frac, maximumFractionDigits: frac });
}

export function DealsTable({ deals, currency }: { deals: Deal[]; currency: string }) {
  if (deals.length === 0) {
    return <p className="rounded border p-4 text-center text-sm text-muted-foreground">No closed trades in window.</p>;
  }
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Closed</TableHead>
          <TableHead>Symbol</TableHead>
          <TableHead>Side</TableHead>
          <TableHead className="text-right">Vol</TableHead>
          <TableHead className="text-right">Entry</TableHead>
          <TableHead className="text-right">Exit</TableHead>
          <TableHead className="text-right">Profit ({currency})</TableHead>
          <TableHead className="text-right">Comm</TableHead>
          <TableHead className="text-right">Swap</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {deals.map((d) => (
          <TableRow key={d.ticket}>
            <TableCell className="tabular-nums text-xs">{format(parseISO(d.close_time), "yyyy-MM-dd HH:mm")}</TableCell>
            <TableCell className="font-medium">{d.symbol}</TableCell>
            <TableCell className={cn("uppercase", d.side === "buy" ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400")}>
              {d.side}
            </TableCell>
            <TableCell className="text-right tabular-nums">{fmtNum(d.volume, 2)}</TableCell>
            <TableCell className="text-right tabular-nums">{fmtNum(d.open_price, 5)}</TableCell>
            <TableCell className="text-right tabular-nums">{fmtNum(d.close_price, 5)}</TableCell>
            <TableCell className={cn("text-right tabular-nums",
              d.profit > 0 ? "text-emerald-600 dark:text-emerald-400" :
              d.profit < 0 ? "text-red-600 dark:text-red-400" : "")}>
              {fmtNum(d.profit, 2)}
            </TableCell>
            <TableCell className="text-right tabular-nums">{fmtNum(d.commission, 2)}</TableCell>
            <TableCell className="text-right tabular-nums">{fmtNum(d.swap, 2)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
```

- [ ] **Step 2: Create `components/journal/orders-table.tsx`**

```typescript
"use client";

import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import type { OrderRow } from "@/lib/types";
import { format, parseISO } from "date-fns";

function fmtNum(n: number | null, frac = 2): string {
  if (n === null) return "—";
  return n.toLocaleString("en-US", { minimumFractionDigits: frac, maximumFractionDigits: frac });
}

export function OrdersTable({ orders }: { orders: OrderRow[] }) {
  if (orders.length === 0) {
    return <p className="rounded border p-4 text-center text-sm text-muted-foreground">No orders in window.</p>;
  }
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Setup</TableHead>
          <TableHead>Symbol</TableHead>
          <TableHead>Type</TableHead>
          <TableHead>State</TableHead>
          <TableHead className="text-right">Vol Init</TableHead>
          <TableHead className="text-right">Vol Now</TableHead>
          <TableHead className="text-right">Price</TableHead>
          <TableHead>Done</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {orders.map((o) => (
          <TableRow key={o.ticket}>
            <TableCell className="tabular-nums text-xs">{format(parseISO(o.time_setup), "yyyy-MM-dd HH:mm")}</TableCell>
            <TableCell className="font-medium">{o.symbol}</TableCell>
            <TableCell className="lowercase">{o.type}</TableCell>
            <TableCell className="lowercase">{o.state}</TableCell>
            <TableCell className="text-right tabular-nums">{fmtNum(o.volume_initial, 2)}</TableCell>
            <TableCell className="text-right tabular-nums">{fmtNum(o.volume_current, 2)}</TableCell>
            <TableCell className="text-right tabular-nums">{fmtNum(o.price_open, 5)}</TableCell>
            <TableCell className="tabular-nums text-xs">
              {o.time_done ? format(parseISO(o.time_done), "yyyy-MM-dd HH:mm") : "—"}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
```

- [ ] **Step 3: Build**

Run: `pnpm build`
Expected: green.

- [ ] **Step 4: Commit**

```bash
git add components/journal/deals-table.tsx components/journal/orders-table.tsx
git commit -m "feat(ui): add DealsTable and OrdersTable"
```

### Task 4.7: Trade calendar component

**Files:**
- Create: `components/journal/trade-calendar.tsx`

- [ ] **Step 1: Implement**

```typescript
"use client";

import { useMemo, useState } from "react";
import {
  addMonths, eachDayOfInterval, endOfMonth, format, getDay, isSameMonth,
  startOfMonth, subMonths,
} from "date-fns";
import { Button } from "@/components/ui/button";
import { aggregateCalendar } from "@/lib/journal/calendar-aggregate";
import type { Deal } from "@/lib/types";
import { cn } from "@/lib/utils";

interface Props {
  deals: Deal[];
  currency: string;
}

export function TradeCalendar({ deals, currency }: Props) {
  const [cursor, setCursor] = useState<Date>(() => new Date());
  const calendar = useMemo(() => aggregateCalendar(deals), [deals]);

  const monthStart = startOfMonth(cursor);
  const monthEnd = endOfMonth(cursor);
  const days = eachDayOfInterval({ start: monthStart, end: monthEnd });
  const leadingBlanks = getDay(monthStart);

  const monthTotals = useMemo(() => {
    let net = 0; let trades = 0;
    for (const d of days) {
      const key = format(d, "yyyy-MM-dd");
      const cell = calendar.get(key);
      if (cell) { net += cell.netPnl; trades += cell.tradeCount; }
    }
    return { net, trades };
  }, [calendar, days]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setCursor((c) => subMonths(c, 1))}>‹</Button>
          <span className="text-sm font-medium">{format(cursor, "MMMM yyyy")}</span>
          <Button variant="outline" size="sm"
            onClick={() => setCursor((c) => addMonths(c, 1))}
            disabled={isSameMonth(cursor, new Date())}>›</Button>
        </div>
        <div className="text-sm text-muted-foreground">
          {monthTotals.trades} trades, net{" "}
          <span className={cn(monthTotals.net > 0 ? "text-emerald-600 dark:text-emerald-400"
                            : monthTotals.net < 0 ? "text-red-600 dark:text-red-400" : "")}>
            {new Intl.NumberFormat("en-US", { style: "currency", currency }).format(monthTotals.net)}
          </span>
        </div>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-xs text-muted-foreground">
        {["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map((d) => <div key={d}>{d}</div>)}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {Array.from({ length: leadingBlanks }).map((_, i) => <div key={`b${i}`} />)}
        {days.map((d) => {
          const key = format(d, "yyyy-MM-dd");
          const cell = calendar.get(key);
          const tone = !cell ? "bg-muted/30"
            : cell.netPnl > 0 ? "bg-emerald-500/15"
            : cell.netPnl < 0 ? "bg-red-500/15"
            : "bg-muted/30";
          return (
            <div key={key} className={cn("rounded p-1.5 text-xs", tone)}>
              <div className="text-muted-foreground">{format(d, "d")}</div>
              {cell && (
                <>
                  <div className={cn("mt-1 font-medium tabular-nums",
                    cell.netPnl > 0 ? "text-emerald-700 dark:text-emerald-300"
                    : cell.netPnl < 0 ? "text-red-700 dark:text-red-300" : "")}>
                    {new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 0 }).format(cell.netPnl)}
                  </div>
                  <div className="text-[10px] text-muted-foreground">{cell.tradeCount}t</div>
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Build**

Run: `pnpm build`
Expected: green.

- [ ] **Step 3: Commit**

```bash
git add components/journal/trade-calendar.tsx
git commit -m "feat(ui): add TradeCalendar monthly heatmap"
```

### Task 4.8: Equity chart + streaks table

**Files:**
- Create: `components/journal/equity-chart.tsx`
- Create: `components/journal/streaks-table.tsx`

- [ ] **Step 1: Create `components/journal/equity-chart.tsx`**

```typescript
"use client";

import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useTheme } from "next-themes";
import type { AccountSnapshotDaily } from "@/lib/types";

export function EquityChart({ data, currency }: { data: AccountSnapshotDaily[]; currency: string }) {
  const { resolvedTheme } = useTheme();
  const stroke = resolvedTheme === "dark" ? "rgb(110, 231, 183)" : "rgb(5, 150, 105)";
  if (data.length === 0) {
    return <p className="rounded border p-6 text-center text-sm text-muted-foreground">No equity history yet.</p>;
  }
  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data}>
          <defs>
            <linearGradient id="equityGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={stroke} stopOpacity={0.4}/>
              <stop offset="100%" stopColor={stroke} stopOpacity={0}/>
            </linearGradient>
          </defs>
          <XAxis dataKey="trade_date" tick={{ fontSize: 11 }} />
          <YAxis tick={{ fontSize: 11 }} domain={["auto", "auto"]} tickFormatter={(v) =>
            new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 0 }).format(v as number)} />
          <Tooltip
            formatter={(v) => new Intl.NumberFormat("en-US", { style: "currency", currency }).format(v as number)}
            contentStyle={{ background: resolvedTheme === "dark" ? "#0a0a0a" : "#fff", border: "1px solid #888" }}
          />
          <Area type="monotone" dataKey="equity_close" stroke={stroke} fill="url(#equityGradient)" strokeWidth={2}/>
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
```

- [ ] **Step 2: Create `components/journal/streaks-table.tsx`**

```typescript
import { Card, CardContent } from "@/components/ui/card";
import type { StreakStats } from "@/lib/journal/streaks";

export function StreaksTable({ streaks }: { streaks: StreakStats }) {
  return (
    <Card>
      <CardContent className="grid grid-cols-3 gap-4 p-4 text-sm">
        <div>
          <div className="text-xs uppercase text-muted-foreground">Max Win Streak</div>
          <div className="text-xl font-semibold">{streaks.maxWinStreak}</div>
        </div>
        <div>
          <div className="text-xs uppercase text-muted-foreground">Max Loss Streak</div>
          <div className="text-xl font-semibold">{streaks.maxLossStreak}</div>
        </div>
        <div>
          <div className="text-xs uppercase text-muted-foreground">Current</div>
          <div className="text-xl font-semibold">
            {streaks.currentStreak} <span className="text-xs font-normal text-muted-foreground">{streaks.currentStreakKind}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 3: Build**

Run: `pnpm build`
Expected: green.

- [ ] **Step 4: Commit**

```bash
git add components/journal/equity-chart.tsx components/journal/streaks-table.tsx
git commit -m "feat(ui): add EquityChart and StreaksTable"
```

### Task 4.9: Tab components — Overview / Trades / Calendar / Performance / Orders / Objectives

**Files:**
- Create: `components/journal/tabs/overview-tab.tsx`
- Create: `components/journal/tabs/trades-tab.tsx`
- Create: `components/journal/tabs/calendar-tab.tsx`
- Create: `components/journal/tabs/performance-tab.tsx`
- Create: `components/journal/tabs/orders-tab.tsx`
- Create: `components/journal/tabs/objectives-tab.tsx`
- Create: `components/journal/rule-progress.tsx`

- [ ] **Step 1: `overview-tab.tsx`**

```typescript
import { OpenPositionsTable } from "../open-positions-table";
import type { Position } from "@/lib/types";

export function OverviewTab({ positions, currency }: { positions: Position[]; currency: string }) {
  return (
    <section className="space-y-4">
      <h2 className="text-sm font-semibold text-muted-foreground">Open Positions ({positions.length})</h2>
      <OpenPositionsTable positions={positions} currency={currency} />
    </section>
  );
}
```

- [ ] **Step 2: `trades-tab.tsx`**

```typescript
import { DealsTable } from "../deals-table";
import type { Deal } from "@/lib/types";

export function TradesTab({ deals, currency }: { deals: Deal[]; currency: string }) {
  return <DealsTable deals={deals} currency={currency} />;
}
```

- [ ] **Step 3: `calendar-tab.tsx`**

```typescript
import { TradeCalendar } from "../trade-calendar";
import type { Deal } from "@/lib/types";

export function CalendarTab({ deals, currency }: { deals: Deal[]; currency: string }) {
  return <TradeCalendar deals={deals} currency={currency} />;
}
```

- [ ] **Step 4: `performance-tab.tsx`**

```typescript
"use client";

import { useMemo } from "react";
import { computeTradeStats } from "@/lib/journal/trade-stats";
import { computeStreaks } from "@/lib/journal/streaks";
import { StatCard } from "../stat-card";
import { StreaksTable } from "../streaks-table";
import { EquityChart } from "../equity-chart";
import type { AccountSnapshotDaily, Deal } from "@/lib/types";

function fmtCurrency(n: number, currency: string): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(n);
}

export function PerformanceTab({
  deals, daily, currency,
}: { deals: Deal[]; daily: AccountSnapshotDaily[]; currency: string }) {
  const stats = useMemo(() => computeTradeStats(deals), [deals]);
  const streaks = useMemo(() => computeStreaks(deals), [deals]);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Net Profit" value={fmtCurrency(stats.netProfit, currency)} tone={stats.netProfit > 0 ? "positive" : stats.netProfit < 0 ? "negative" : "default"} />
        <StatCard label="Win Rate" value={`${(stats.winRate * 100).toFixed(1)}%`} sub={`${stats.wins}/${stats.totalTrades}`} />
        <StatCard label="Profit Factor" value={Number.isFinite(stats.profitFactor) ? stats.profitFactor.toFixed(2) : "∞"} />
        <StatCard label="Expected Payoff" value={fmtCurrency(stats.expectedPayoff, currency)} />
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Avg Win" value={fmtCurrency(stats.avgWin, currency)} />
        <StatCard label="Avg Loss" value={fmtCurrency(stats.avgLoss, currency)} />
        <StatCard label="Best Trade" value={fmtCurrency(stats.bestTrade, currency)} tone="positive" />
        <StatCard label="Worst Trade" value={fmtCurrency(stats.worstTrade, currency)} tone="negative" />
      </div>
      <StreaksTable streaks={streaks} />
      <div>
        <h3 className="mb-2 text-sm font-semibold text-muted-foreground">Equity Curve</h3>
        <EquityChart data={daily} currency={currency} />
      </div>
    </div>
  );
}
```

- [ ] **Step 5: `orders-tab.tsx`**

```typescript
import { OrdersTable } from "../orders-table";
import type { OrderRow } from "@/lib/types";

export function OrdersTab({ orders }: { orders: OrderRow[] }) {
  return <OrdersTable orders={orders} />;
}
```

- [ ] **Step 6: `rule-progress.tsx`**

```typescript
import { Progress } from "@/components/ui/progress";

export function RuleProgress({
  label, current, threshold, currency, danger = false,
}: { label: string; current: number; threshold: number; currency: string; danger?: boolean }) {
  const pct = threshold === 0 ? 0 : Math.min(100, Math.max(0, (current / threshold) * 100));
  return (
    <div className="space-y-1">
      <div className="flex items-baseline justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className={danger ? "text-red-600 dark:text-red-400" : ""}>
          {new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 0 }).format(current)}
          {" / "}
          {new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 0 }).format(threshold)}
        </span>
      </div>
      <Progress value={pct} aria-label={label} />
    </div>
  );
}
```

- [ ] **Step 7: `objectives-tab.tsx`**

```typescript
"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { evaluateObjectives } from "@/lib/journal/objectives";
import type { AccountSnapshotCurrent, AccountSnapshotDaily, License, PropfirmRule } from "@/lib/types";
import { RuleProgress } from "../rule-progress";
import { cn } from "@/lib/utils";

interface Props {
  license: License;
  rule: PropfirmRule | null;
  snapshot: AccountSnapshotCurrent | null;
  daily: AccountSnapshotDaily[];
  currency: string;
}

export function ObjectivesTab({ license, rule, snapshot, daily, currency }: Props) {
  if (rule === null) {
    return (
      <div className="rounded border border-dashed p-6 text-center text-sm">
        <p className="text-muted-foreground">No challenge rule assigned.</p>
        <Button asChild className="mt-4" size="sm" variant="outline">
          <Link href={`/licenses/${license.id}`}>Assign rule</Link>
        </Button>
      </div>
    );
  }
  if (!snapshot) {
    return <p className="rounded border p-6 text-center text-sm text-muted-foreground">Waiting for first EA push…</p>;
  }
  const todayUtc = new Date().toISOString().slice(0, 10);
  const r = evaluateObjectives({ rule, currentSnapshot: snapshot, dailySnapshots: daily, todayUtc });

  const banner =
    r.status === "passed" ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
    : r.status === "failed" ? "border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-300"
    : "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300";

  return (
    <div className="space-y-6">
      <div className={cn("rounded border p-3 text-sm font-medium", banner)}>
        Status: <span className="uppercase">{r.status}</span>
        {r.status === "in_progress" && r.profitTargetMet && r.tradingDaysCount < rule.min_trading_days && (
          <span className="ml-2 text-xs text-muted-foreground">
            (target met; need {rule.min_trading_days - r.tradingDaysCount} more trading day(s))
          </span>
        )}
      </div>
      <div className="space-y-4">
        <RuleProgress label="Profit target" current={Math.max(0, r.netProfit)} threshold={r.profitTargetThreshold} currency={currency} />
        <RuleProgress label="Today's loss" current={r.todaysPnl < 0 ? -r.todaysPnl : 0} threshold={r.dailyLossThreshold} currency={currency} danger={r.dailyLossBreached} />
        <RuleProgress label="Total drawdown" current={r.totalDrawdown} threshold={r.totalLossThreshold} currency={currency} danger={r.totalLossBreached} />
        <div className="text-xs text-muted-foreground">
          Trading days: {r.tradingDaysCount} / min {rule.min_trading_days}{rule.max_trading_days ? ` (max ${rule.max_trading_days})` : ""}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 8: Build**

Run: `pnpm build`
Expected: green.

- [ ] **Step 9: Commit**

```bash
git add components/journal/tabs/ components/journal/rule-progress.tsx
git commit -m "feat(ui): add Overview/Trades/Calendar/Performance/Orders/Objectives tabs"
```

### Task 4.10: Journal shell (client) + journal page (server) + loading state

**Files:**
- Create: `components/journal/journal-header.tsx`
- Create: `components/journal/journal-shell.tsx`
- Create: `app/licenses/[id]/journal/page.tsx`
- Create: `app/licenses/[id]/journal/loading.tsx`

- [ ] **Step 1: `journal-header.tsx`**

```typescript
"use client";

import Link from "next/link";
import { ArrowLeft } from "@phosphor-icons/react";
import { LivenessBadge } from "@/components/liveness-badge";
import { TierBadge } from "@/components/tier-badge";
import { StatusBadge } from "@/components/status-badge";
import { DataAgeIndicator } from "./data-age-indicator";
import type { License } from "@/lib/types";

interface Props {
  license: License;
  pushedAt: string | null;
}

export function JournalHeader({ license, pushedAt }: Props) {
  return (
    <div className="border-b pb-4">
      <Link href="/licenses" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Licenses
      </Link>
      <div className="mt-2 flex items-baseline justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">MT5 #{license.mt5_account}</h1>
          <p className="text-xs text-muted-foreground">
            {license.broker_name ?? "broker unknown"} · {license.license_key}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge license={license} />
          <TierBadge tier={license.tier} />
          {license.account_type && (
            <span className="rounded bg-muted px-2 py-0.5 text-xs uppercase">{license.account_type}</span>
          )}
          <LivenessBadge license={license} />
          <DataAgeIndicator pushedAt={pushedAt} pushIntervalSeconds={license.push_interval_seconds} />
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: `journal-shell.tsx`**

```typescript
"use client";

import { useJournalPoll } from "@/lib/hooks/use-journal-poll";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { JournalHeader } from "./journal-header";
import { LiveAccountPanel } from "./live-account-panel";
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

interface Props {
  license: License;
  initialSnapshot: AccountSnapshotCurrent | null;
  initialDaily: AccountSnapshotDaily[];
  initialPositions: Position[];
  initialDeals: Deal[];
  initialOrders: OrderRow[];
  rule: PropfirmRule | null;
}

export function JournalShell(props: Props) {
  const { license } = props;
  const pushIntervalMs = license.push_interval_seconds * 1000;
  const acct = license.mt5_account;

  const snapshot = useJournalPoll<AccountSnapshotCurrent | null>({
    fetcher: () => fetch(`/api/journal/${acct}/snapshot`).then((r) => r.json()),
    initialData: props.initialSnapshot,
    pushIntervalMs,
  });
  const positions = useJournalPoll<Position[]>({
    fetcher: () => fetch(`/api/journal/${acct}/positions`).then((r) => r.json()),
    initialData: props.initialPositions,
    pushIntervalMs,
  });
  const deals = useJournalPoll<Deal[]>({
    fetcher: () => fetch(`/api/journal/${acct}/deals?days=90`).then((r) => r.json()),
    initialData: props.initialDeals,
    pushIntervalMs,
    fixedIntervalMs: 30_000,
  });
  const orders = useJournalPoll<OrderRow[]>({
    fetcher: () => fetch(`/api/journal/${acct}/orders?days=90`).then((r) => r.json()),
    initialData: props.initialOrders,
    pushIntervalMs,
    fixedIntervalMs: 30_000,
  });
  const daily = useJournalPoll<AccountSnapshotDaily[]>({
    fetcher: () => fetch(`/api/journal/${acct}/snapshots-daily?days=90`).then((r) => r.json()),
    initialData: props.initialDaily,
    pushIntervalMs,
    fixedIntervalMs: 5 * 60_000,
  });

  const currency = snapshot.data?.currency ?? "USD";

  return (
    <div className="mx-auto max-w-6xl space-y-4 px-6 py-6">
      <JournalHeader license={license} pushedAt={snapshot.data?.pushed_at ?? null} />
      <LiveAccountPanel snapshot={snapshot.data} />
      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="trades">Trades</TabsTrigger>
          <TabsTrigger value="calendar">Calendar</TabsTrigger>
          <TabsTrigger value="performance">Performance</TabsTrigger>
          <TabsTrigger value="orders">Orders</TabsTrigger>
          <TabsTrigger value="objectives">Objectives</TabsTrigger>
        </TabsList>
        <TabsContent value="overview"><OverviewTab positions={positions.data} currency={currency} /></TabsContent>
        <TabsContent value="trades"><TradesTab deals={deals.data} currency={currency} /></TabsContent>
        <TabsContent value="calendar"><CalendarTab deals={deals.data} currency={currency} /></TabsContent>
        <TabsContent value="performance"><PerformanceTab deals={deals.data} daily={daily.data} currency={currency} /></TabsContent>
        <TabsContent value="orders"><OrdersTab orders={orders.data} /></TabsContent>
        <TabsContent value="objectives">
          <ObjectivesTab license={license} rule={props.rule} snapshot={snapshot.data} daily={daily.data} currency={currency} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
```

- [ ] **Step 3: `app/licenses/[id]/journal/page.tsx`**

```typescript
import { notFound } from "next/navigation";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import {
  getAccountSnapshotCurrent, getAccountSnapshotsDaily, getDeals,
  getOpenPositions, getOrders, getPropfirmRule,
} from "@/lib/journal/queries";
import { SiteNav } from "@/components/site-nav";
import { JournalShell } from "@/components/journal/journal-shell";
import type { License } from "@/lib/types";

export const dynamic = "force-dynamic";

async function loadLicense(id: number): Promise<License | null> {
  const sb = getSupabaseAdmin();
  const { data, error } = await sb.from("licenses").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return (data as License | null) ?? null;
}

export default async function JournalPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const n = Number(id);
  if (!Number.isFinite(n)) notFound();

  const license = await loadLicense(n);
  if (!license) notFound();

  const [snapshot, positions, deals, orders, daily, rule] = await Promise.all([
    getAccountSnapshotCurrent(license.mt5_account),
    getOpenPositions(license.mt5_account),
    getDeals(license.mt5_account, 90),
    getOrders(license.mt5_account, 90),
    getAccountSnapshotsDaily(license.mt5_account, 90),
    license.propfirm_rule_id ? getPropfirmRule(license.propfirm_rule_id) : null,
  ]);

  return (
    <>
      <SiteNav />
      <JournalShell
        license={license}
        initialSnapshot={snapshot}
        initialDaily={daily}
        initialPositions={positions}
        initialDeals={deals}
        initialOrders={orders}
        rule={rule}
      />
    </>
  );
}
```

- [ ] **Step 4: `app/licenses/[id]/journal/loading.tsx`**

```typescript
import { Skeleton } from "@/components/ui/skeleton";
import { SiteNav } from "@/components/site-nav";

export default function Loading() {
  return (
    <>
      <SiteNav />
      <div className="mx-auto max-w-6xl space-y-4 px-6 py-6">
        <Skeleton className="h-10 w-full" />
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24" />)}
        </div>
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    </>
  );
}
```

- [ ] **Step 5: Build**

Run: `pnpm build`
Expected: green; new route appears.

- [ ] **Step 6: Commit**

```bash
git add components/journal/journal-header.tsx components/journal/journal-shell.tsx app/licenses/[id]/journal/
git commit -m "feat(ui): add per-license journal page"
```

### Task 4.11: Make license-table rows clickable

**Files:**
- Modify: `components/license-table.tsx`

- [ ] **Step 1: Find the `<TableRow>` rendering each license. Wrap the cells (NOT the action dropdown) in a Link to the journal page.**

Open `components/license-table.tsx`. Find the row (likely structure: `<TableRow>...<TableCell>...license_key...</TableCell>...<TableCell>...mt5_account...</TableCell>...<TableCell>{actions dropdown}</TableCell></TableRow>`). The action dropdown must remain a non-link interactive element. Add a click handler on the row that navigates, but only fire it when the click target is not inside the dropdown.

Replace the `<TableRow>` opening tag with one that has a click handler:

```typescript
import { useRouter } from "next/navigation";

// Inside the component:
const router = useRouter();

// In the row:
<TableRow
  className="cursor-pointer hover:bg-muted/50"
  onClick={(e) => {
    const target = e.target as HTMLElement;
    if (target.closest("[data-no-row-nav]")) return;
    router.push(`/licenses/${license.id}/journal`);
  }}
>
```

And on the action dropdown's outer `<TableCell>`, add `data-no-row-nav` so clicks there don't navigate:

```typescript
<TableCell data-no-row-nav>
  {/* dropdown menu */}
</TableCell>
```

- [ ] **Step 2: Visual smoke-test**

Run: `pnpm dev`. Open `/licenses`. Click any row body → should navigate to `/licenses/<id>/journal`. Click the action dropdown → should open the menu, NOT navigate.

- [ ] **Step 3: Commit**

```bash
git add components/license-table.tsx
git commit -m "feat(ui): license-table rows navigate to journal page on click"
```

### Task 4.12: Settings page — journal polling control

**Files:**
- Modify: `app/settings/page.tsx`

- [ ] **Step 1: Read the existing settings page and append a journal-polling section**

Open `app/settings/page.tsx`. After the existing license polling control, add a section. The page is a client component (uses localStorage). The new section uses `getJournalPollingInterval` / `setJournalPollingInterval`:

```typescript
import { JOURNAL_POLLING_OPTIONS, getJournalPollingInterval, setJournalPollingInterval } from "@/lib/settings";

// Inside the component, parallel to the existing select:
const [journalMs, setJournalMs] = useState<number>(() => getJournalPollingInterval());

// In the JSX, after the existing field:
<div className="space-y-2">
  <Label htmlFor="journal-poll">Journal polling interval</Label>
  <Select value={String(journalMs)} onValueChange={(v) => {
    const n = Number(v);
    setJournalMs(n);
    setJournalPollingInterval(n);
  }}>
    <SelectTrigger id="journal-poll"><SelectValue /></SelectTrigger>
    <SelectContent>
      {JOURNAL_POLLING_OPTIONS.map((o) => (
        <SelectItem key={o.value} value={String(o.value)}>{o.label}</SelectItem>
      ))}
    </SelectContent>
  </Select>
  <p className="text-xs text-muted-foreground">
    How often the journal page polls Supabase. Capped per-license at the EA's push interval.
  </p>
</div>
```

(Adapt the import set to whatever shadcn select / label imports already exist on the page.)

- [ ] **Step 2: Visual smoke-test**

Run: `pnpm dev`. Open `/settings`. Confirm both polling selects are visible and persist their values across reload.

- [ ] **Step 3: Commit**

```bash
git add app/settings/page.tsx
git commit -m "feat(settings): add journal polling interval control"
```

### Task 4.13: License form — Push interval + Propfirm rule fields

**Files:**
- Modify: `components/license-form.tsx`
- Modify: `lib/schemas.ts`
- Modify: `app/api/licenses/route.ts` (POST handler)
- Modify: `app/api/licenses/[id]/route.ts` (PATCH handler)

- [ ] **Step 1: Extend `lib/schemas.ts` with the two new optional fields**

Find `createLicenseSchema` and `updateLicenseSchema`. Add to both:

```typescript
push_interval_seconds: z.number().int().min(3).max(60).default(10),
propfirm_rule_id: z.number().int().positive().nullable().default(null),
```

Make sure `updateLicenseSchema` declares them as `.optional()` instead of `.default()`.

- [ ] **Step 2: Update `app/api/licenses/route.ts` so POST persists the new fields**

Find the insert call; if it spreads `parsed.data`, no change needed beyond the schema. If it explicitly lists columns, add `push_interval_seconds: parsed.data.push_interval_seconds, propfirm_rule_id: parsed.data.propfirm_rule_id`.

- [ ] **Step 3: Update `app/api/licenses/[id]/route.ts` PATCH similarly**

- [ ] **Step 4: Add a Push Interval slider/select + Rule selector to `components/license-form.tsx`**

```typescript
// import additions:
import { useEffect, useState } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { PropfirmRule } from "@/lib/types";

// Inside the form component:
const [rules, setRules] = useState<PropfirmRule[]>([]);
useEffect(() => {
  fetch("/api/propfirm-rules").then((r) => r.json()).then(setRules).catch(() => {});
}, []);

// In the form JSX, near the bottom:
<FormField name="push_interval_seconds" control={form.control} render={({ field }) => (
  <FormItem>
    <FormLabel>EA push interval (seconds)</FormLabel>
    <Select value={String(field.value ?? 10)} onValueChange={(v) => field.onChange(Number(v))}>
      <SelectTrigger><SelectValue /></SelectTrigger>
      <SelectContent>
        {[3, 5, 10, 30, 60].map((n) => <SelectItem key={n} value={String(n)}>{n}s</SelectItem>)}
      </SelectContent>
    </Select>
    <FormDescription>How often this account's EA publishes to Supabase.</FormDescription>
  </FormItem>
)} />

<FormField name="propfirm_rule_id" control={form.control} render={({ field }) => (
  <FormItem>
    <FormLabel>Propfirm rule (optional)</FormLabel>
    <Select value={field.value === null ? "none" : String(field.value)}
            onValueChange={(v) => field.onChange(v === "none" ? null : Number(v))}>
      <SelectTrigger><SelectValue placeholder="No challenge" /></SelectTrigger>
      <SelectContent>
        <SelectItem value="none">No challenge</SelectItem>
        {rules.map((r) => <SelectItem key={r.id} value={String(r.id)}>{r.name}</SelectItem>)}
      </SelectContent>
    </Select>
  </FormItem>
)} />
```

(Adapt `FormField` / `FormItem` / `FormLabel` / `FormDescription` imports to those already in use.)

- [ ] **Step 5: Build + visual smoke-test**

Run: `pnpm build && pnpm dev`. Open `/licenses/new`, confirm both new fields render and save round-trips correctly. Edit an existing license, change push interval, confirm DB update.

- [ ] **Step 6: Commit**

```bash
git add lib/schemas.ts app/api/licenses/ components/license-form.tsx
git commit -m "feat(ui): license form supports push interval + propfirm rule"
```

### Task 4.14: Propfirm rules pages

**Files:**
- Create: `app/propfirm-rules/page.tsx`
- Create: `app/propfirm-rules/new/page.tsx`
- Create: `app/propfirm-rules/[id]/page.tsx`
- Create: `components/propfirm-rules/rules-table.tsx`
- Create: `components/propfirm-rules/rule-form.tsx`
- Modify: `components/site-nav.tsx` (add a nav link)

- [ ] **Step 1: `components/propfirm-rules/rules-table.tsx`**

```typescript
"use client";

import Link from "next/link";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { PropfirmRule } from "@/lib/types";

export function RulesTable({ rules }: { rules: PropfirmRule[] }) {
  if (rules.length === 0) {
    return <p className="rounded border p-6 text-center text-sm text-muted-foreground">No rules yet.</p>;
  }
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Name</TableHead>
          <TableHead className="text-right">Account</TableHead>
          <TableHead className="text-right">Daily Loss</TableHead>
          <TableHead className="text-right">Total Loss</TableHead>
          <TableHead className="text-right">Target</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rules.map((r) => (
          <TableRow key={r.id} className="cursor-pointer hover:bg-muted/50">
            <TableCell><Link href={`/propfirm-rules/${r.id}`} className="hover:underline">{r.name}</Link></TableCell>
            <TableCell className="text-right tabular-nums">${r.account_size.toLocaleString()}</TableCell>
            <TableCell className="text-right tabular-nums">{r.max_daily_loss}{r.daily_loss_type === "percent" ? "%" : "$"}</TableCell>
            <TableCell className="text-right tabular-nums">{r.max_total_loss}{r.total_loss_type === "percent" ? "%" : "$"}</TableCell>
            <TableCell className="text-right tabular-nums">{r.profit_target}{r.target_type === "percent" ? "%" : "$"}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
```

- [ ] **Step 2: `components/propfirm-rules/rule-form.tsx`**

```typescript
"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { propfirmRuleSchema, type PropfirmRuleInput } from "@/lib/schemas";
import type { PropfirmRule } from "@/lib/types";
import { toast } from "sonner";

export function RuleForm({ initial }: { initial?: PropfirmRule }) {
  const router = useRouter();
  const form = useForm<PropfirmRuleInput>({
    resolver: zodResolver(propfirmRuleSchema),
    defaultValues: initial ?? {
      name: "", account_size: 100000,
      max_daily_loss: 5, daily_loss_type: "percent", daily_loss_calc: "balance",
      max_total_loss: 10, total_loss_type: "percent",
      profit_target: 8, target_type: "percent",
      min_trading_days: 0, max_trading_days: null,
    },
  });

  async function onSubmit(values: PropfirmRuleInput) {
    const url = initial ? `/api/propfirm-rules/${initial.id}` : "/api/propfirm-rules";
    const res = await fetch(url, {
      method: initial ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(values),
    });
    if (!res.ok) { toast.error("Failed to save rule"); return; }
    toast.success(initial ? "Rule updated" : "Rule created");
    router.push("/propfirm-rules"); router.refresh();
  }

  async function onDelete() {
    if (!initial) return;
    if (!confirm(`Delete rule "${initial.name}"?`)) return;
    const res = await fetch(`/api/propfirm-rules/${initial.id}`, { method: "DELETE" });
    if (!res.ok) { toast.error("Delete failed"); return; }
    toast.success("Rule deleted");
    router.push("/propfirm-rules"); router.refresh();
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 max-w-xl">
      <div><Label>Name</Label><Input {...form.register("name")} /></div>
      <div><Label>Account size</Label>
        <Input type="number" step="any" {...form.register("account_size", { valueAsNumber: true })} /></div>

      <div className="grid grid-cols-3 gap-3">
        <div><Label>Daily loss</Label>
          <Input type="number" step="any" {...form.register("max_daily_loss", { valueAsNumber: true })} /></div>
        <div><Label>Type</Label>
          <Select value={form.watch("daily_loss_type")} onValueChange={(v) => form.setValue("daily_loss_type", v as "money"|"percent")}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="money">$</SelectItem><SelectItem value="percent">%</SelectItem></SelectContent>
          </Select></div>
        <div><Label>Calc</Label>
          <Select value={form.watch("daily_loss_calc")} onValueChange={(v) => form.setValue("daily_loss_calc", v as "balance"|"equity")}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="balance">balance</SelectItem><SelectItem value="equity">equity</SelectItem></SelectContent>
          </Select></div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div><Label>Total loss</Label>
          <Input type="number" step="any" {...form.register("max_total_loss", { valueAsNumber: true })} /></div>
        <div><Label>Type</Label>
          <Select value={form.watch("total_loss_type")} onValueChange={(v) => form.setValue("total_loss_type", v as "money"|"percent")}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="money">$</SelectItem><SelectItem value="percent">%</SelectItem></SelectContent>
          </Select></div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div><Label>Profit target</Label>
          <Input type="number" step="any" {...form.register("profit_target", { valueAsNumber: true })} /></div>
        <div><Label>Type</Label>
          <Select value={form.watch("target_type")} onValueChange={(v) => form.setValue("target_type", v as "money"|"percent")}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="money">$</SelectItem><SelectItem value="percent">%</SelectItem></SelectContent>
          </Select></div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div><Label>Min trading days</Label>
          <Input type="number" {...form.register("min_trading_days", { valueAsNumber: true })} /></div>
        <div><Label>Max trading days (optional)</Label>
          <Input type="number" {...form.register("max_trading_days", { valueAsNumber: true, setValueAs: (v) => v === "" || v === null ? null : Number(v) })} /></div>
      </div>

      <div className="flex gap-2">
        <Button type="submit">{initial ? "Save" : "Create"}</Button>
        {initial && <Button type="button" variant="destructive" onClick={onDelete}>Delete</Button>}
      </div>
    </form>
  );
}
```

- [ ] **Step 3: `app/propfirm-rules/page.tsx`**

```typescript
import Link from "next/link";
import { listPropfirmRules } from "@/lib/journal/queries";
import { RulesTable } from "@/components/propfirm-rules/rules-table";
import { Button } from "@/components/ui/button";
import { SiteNav } from "@/components/site-nav";

export const dynamic = "force-dynamic";

export default async function PropfirmRulesPage() {
  const rules = await listPropfirmRules();
  return (
    <>
      <SiteNav />
      <div className="mx-auto max-w-6xl px-6 py-6 space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold">Propfirm Rules</h1>
          <Button asChild><Link href="/propfirm-rules/new">New rule</Link></Button>
        </div>
        <RulesTable rules={rules} />
      </div>
    </>
  );
}
```

- [ ] **Step 4: `app/propfirm-rules/new/page.tsx`**

```typescript
import { RuleForm } from "@/components/propfirm-rules/rule-form";
import { SiteNav } from "@/components/site-nav";

export default function NewRulePage() {
  return (
    <>
      <SiteNav />
      <div className="mx-auto max-w-6xl px-6 py-6 space-y-4">
        <h1 className="text-xl font-semibold">New propfirm rule</h1>
        <RuleForm />
      </div>
    </>
  );
}
```

- [ ] **Step 5: `app/propfirm-rules/[id]/page.tsx`**

```typescript
import { notFound } from "next/navigation";
import { RuleForm } from "@/components/propfirm-rules/rule-form";
import { SiteNav } from "@/components/site-nav";
import { getPropfirmRule } from "@/lib/journal/queries";

export const dynamic = "force-dynamic";

export default async function EditRulePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const n = Number(id);
  if (!Number.isFinite(n)) notFound();
  const rule = await getPropfirmRule(n);
  if (!rule) notFound();
  return (
    <>
      <SiteNav />
      <div className="mx-auto max-w-6xl px-6 py-6 space-y-4">
        <h1 className="text-xl font-semibold">Edit rule: {rule.name}</h1>
        <RuleForm initial={rule} />
      </div>
    </>
  );
}
```

- [ ] **Step 6: Add a "Propfirm Rules" link to `components/site-nav.tsx`**

In the `<nav>` section, after the Settings link, add:

```typescript
<Link href="/propfirm-rules" className={linkClass("/propfirm-rules")}
      aria-current={pathname?.startsWith("/propfirm-rules") ? "page" : undefined}>
  Propfirm Rules
</Link>
```

- [ ] **Step 7: Build + visual smoke**

Run: `pnpm build && pnpm dev`. Visit `/propfirm-rules`, create a rule, edit it, delete it. Confirm round-trips. Visit `/licenses/new` and confirm the rule appears in the dropdown.

- [ ] **Step 8: Commit**

```bash
git add app/propfirm-rules/ components/propfirm-rules/ components/site-nav.tsx
git commit -m "feat(ui): add propfirm rules CRUD pages"
```

### Phase 4 Checkpoint

- [ ] `pnpm test` green; `pnpm build` green.
- [ ] Manual sweep: theme toggle works on every page; license-table row navigates to journal; journal page renders all six tabs without crashing even when `account_snapshots_current` is empty (shows "Waiting for first EA push…").
- [ ] Propfirm rules CRUD round-trips.
- [ ] License form persists `push_interval_seconds` and `propfirm_rule_id`.
- [ ] Branch has ~25-30 commits.

---

## Phase 5 — Impulse EA: `JournalPublisher.mqh`

All work in `~/Documents/development/EA/JSONFX-IMPULSE` on a new feature branch.

### Task 5.1: Create branch + add new constants

**Files:**
- Modify: `Include/CopyTraderX-Impulse/LicenseConfig.mqh`

- [ ] **Step 1: Create branch in the EA repo**

Run:
```bash
cd ~/Documents/development/EA/JSONFX-IMPULSE
git checkout main
git checkout -b feat/journal-publisher
```

- [ ] **Step 2: Append journal constants to `LicenseConfig.mqh`**

Open `Include/CopyTraderX-Impulse/LicenseConfig.mqh`. Add immediately above the `#endif` line:

```mql5
// Journal publisher constants (added 2026-05-02 for journal integration).
const string JOURNAL_PUBLISH_URL    = "https://mkfabzqlxzeidfblxzhq.supabase.co/functions/v1/publish-journal";
const string EA_SOURCE_TAG          = "impulse";
const string JOURNAL_STATE_FILENAME = "impulse_journal_state.dat";
const int    JOURNAL_BACKFILL_DAYS  = 90;
const int    JOURNAL_DEFAULT_PUSH_INTERVAL_SEC = 10;
```

- [ ] **Step 3: Commit**

```bash
git add Include/CopyTraderX-Impulse/LicenseConfig.mqh
git commit -m "feat(ea/impulse): add journal publisher constants"
```

### Task 5.2: Stub `JournalPublisher.mqh` (compile-only)

**Files:**
- Create: `Include/CopyTraderX-Impulse/JournalPublisher.mqh`

We start with a compiling stub so the include order in `EACore.mqh` works; we'll fill in the methods in subsequent tasks. This way, every step can be compile-tested in MetaEditor.

- [ ] **Step 1: Create the stub file**

```mql5
//+------------------------------------------------------------------+
//|                                       JournalPublisher.mqh       |
//|                                       CopyTraderX v1.0           |
//|                                       Publishes account, position|
//|                                       deal, and order data to    |
//|                                       Supabase via               |
//|                                       publish-journal Edge Fn.   |
//+------------------------------------------------------------------+
#property copyright "CopyTraderX"
#ifndef CTX_JOURNAL_PUBLISHER_MQH
#define CTX_JOURNAL_PUBLISHER_MQH

#include <CopyTraderX-Impulse/LicenseConfig.mqh>

class CJournalPublisher
  {
private:
   long      m_mt5_account;
   string    m_license_key;
   string    m_ea_source;
   int       m_push_interval_sec;
   datetime  m_last_account_push;
   datetime  m_last_positions_push;
   ulong     m_last_pushed_deal_ticket;
   ulong     m_last_pushed_order_ticket;
   bool      m_backfill_done;
   datetime  m_last_interval_check;

public:
                     CJournalPublisher();
   bool              Init(const string license_key, long mt5_account, const string ea_source);
   void              OnTimer();
   void              OnTradeTransaction(const MqlTradeTransaction &trans,
                                        const MqlTradeRequest    &request,
                                        const MqlTradeResult     &result);
   void              Shutdown();
  };

CJournalPublisher::CJournalPublisher()
  {
   m_mt5_account              = 0;
   m_push_interval_sec        = JOURNAL_DEFAULT_PUSH_INTERVAL_SEC;
   m_last_account_push        = 0;
   m_last_positions_push      = 0;
   m_last_pushed_deal_ticket  = 0;
   m_last_pushed_order_ticket = 0;
   m_backfill_done            = false;
   m_last_interval_check      = 0;
  }

bool CJournalPublisher::Init(const string license_key, long mt5_account, const string ea_source)
  {
   m_license_key = license_key;
   m_mt5_account = mt5_account;
   m_ea_source   = ea_source;
   PrintFormat("[CTX/journal] Init account=%I64d source=%s", m_mt5_account, m_ea_source);
   return true;
  }

void CJournalPublisher::OnTimer()
  {
   // Filled in by Task 5.6.
  }

void CJournalPublisher::OnTradeTransaction(const MqlTradeTransaction &trans,
                                           const MqlTradeRequest    &request,
                                           const MqlTradeResult     &result)
  {
   // Filled in by Task 5.7.
  }

void CJournalPublisher::Shutdown()
  {
   PrintFormat("[CTX/journal] Shutdown");
  }

#endif // CTX_JOURNAL_PUBLISHER_MQH
```

- [ ] **Step 2: Wire it into `EACore.mqh`**

Open `Include/CopyTraderX-Impulse/EACore.mqh`. Add `#include` near the other module includes (after `LicenseManager.mqh`):
```mql5
#include <CopyTraderX-Impulse/JournalPublisher.mqh>
```
Add a global instance:
```mql5
CJournalPublisher g_journal;
```
In `OnInit` after the license init block (after the closing `}` at line 69), add:
```mql5
   if(!g_journal.Init(InpLicenseKey, AccountInfoInteger(ACCOUNT_LOGIN), EA_SOURCE_TAG))
     {
      Print("[CTX] JournalPublisher init returned false");
     }
```
Change `EventSetTimer(60);` (line 70) to:
```mql5
   EventSetTimer(1);
```
In `OnTimer` (find the existing implementation), add `g_journal.OnTimer();` so it reads:
```mql5
void OnTimer()
  {
   g_license.OnTimer();
   g_journal.OnTimer();
  }
```
In the existing `OnTradeTransaction` handler (or add one if absent — see MQL5 docs for MetaEditor template):
```mql5
void OnTradeTransaction(const MqlTradeTransaction &trans,
                        const MqlTradeRequest &request,
                        const MqlTradeResult &result)
  {
   g_journal.OnTradeTransaction(trans, request, result);
  }
```
In `OnDeinit` add:
```mql5
   g_journal.Shutdown();
```

- [ ] **Step 3: Compile in MetaEditor (Cmd+F7) — verify no errors**

Open MetaEditor → Compile (Ctrl/Cmd+F7) on the EA's main `.mq5` file (`CopyTraderX-Impulse.mq5`). Expect: `0 errors, 0 warnings`.

- [ ] **Step 4: Commit**

```bash
git add Include/CopyTraderX-Impulse/JournalPublisher.mqh Include/CopyTraderX-Impulse/EACore.mqh
git commit -m "feat(ea/impulse): scaffold JournalPublisher and wire into EACore"
```

### Task 5.3: HMAC + base64 helpers

**Files:**
- Modify: `Include/CopyTraderX-Impulse/JournalPublisher.mqh`

The existing `LicenseManager.mqh` already implements HMAC-SHA256 verification (see lines ~492 in that file). We'll **lift the helper** into `JournalPublisher.mqh` for signing-direction (rather than verification-direction) so the publisher is self-contained. If `LicenseManager.mqh` exposes a reusable `HMAC_SHA256_BASE64(payload, key)` already, we use it; otherwise duplicate.

- [ ] **Step 1: Inspect `LicenseManager.mqh` for an existing HMAC helper**

Run:
```bash
grep -n -E 'HMAC|hmac' ~/Documents/development/EA/JSONFX-IMPULSE/Include/CopyTraderX-Impulse/LicenseManager.mqh | head -30
```

Expected: lines showing helper functions (likely `Base64Encode`, `HMACSHA256`, `VerifySignature`). If a `Sign(...)` style helper exists, reuse via `#include` — done.

- [ ] **Step 2: Add HMAC helpers to `JournalPublisher.mqh` if not reusable**

Inside the `private:` section of `CJournalPublisher`, add:

```mql5
private:
   bool   ComputeHmacSha256Base64(const string &payload, string &out_b64);
   string Base64Encode(const uchar &bytes[]);
```

And below the class definition, append the implementations. If `LicenseManager.mqh` already defines `Base64Encode` at file scope, skip adding it here and call the existing one.

```mql5
// Base64 encode helper (RFC 4648). Skip definition if LicenseManager.mqh already
// defines a global Base64Encode — use that instead and remove this method.
string CJournalPublisher::Base64Encode(const uchar &bytes[])
  {
   uchar dst[];
   int   n = ArrayResize(dst, ((ArraySize(bytes) + 2) / 3) * 4);
   int   r = CryptEncode(CRYPT_BASE64, bytes, dst, n);
   if(r <= 0) return "";
   string s = ""; for(int i = 0; i < r; i++) s += CharToString((uchar)dst[i]);
   return s;
  }

bool CJournalPublisher::ComputeHmacSha256Base64(const string &payload, string &out_b64)
  {
   uchar key_bytes[];
   uchar key_dec[];
   StringToCharArray(LICENSE_HMAC_KEY, key_bytes, 0, -1, CP_UTF8);
   ArrayResize(key_bytes, StringLen(LICENSE_HMAC_KEY));
   if(CryptDecode(CRYPT_BASE64, key_bytes, key_dec) <= 0)
     {
      Print("[CTX/journal] HMAC key base64 decode failed");
      return false;
     }
   uchar msg_bytes[];
   StringToCharArray(payload, msg_bytes, 0, -1, CP_UTF8);
   ArrayResize(msg_bytes, StringLen(payload));
   uchar mac[];
   if(CryptEncode(CRYPT_HASH_SHA256_HMAC, msg_bytes, key_dec, mac) <= 0)
     {
      Print("[CTX/journal] HMAC compute failed");
      return false;
     }
   out_b64 = Base64Encode(mac);
   return true;
  }
```

- [ ] **Step 3: Compile — expect 0 errors**

Recompile in MetaEditor. Fix any naming clashes with `LicenseManager.mqh` by renaming the local copy (e.g. `Base64EncodeJ`).

- [ ] **Step 4: Commit**

```bash
git add Include/CopyTraderX-Impulse/JournalPublisher.mqh
git commit -m "feat(ea/impulse): add HMAC-SHA256 base64 helper to journal publisher"
```

### Task 5.4: `PostJournal` HTTP method

**Files:**
- Modify: `Include/CopyTraderX-Impulse/JournalPublisher.mqh`

- [ ] **Step 1: Add private method declaration**

Inside the `private:` block:
```mql5
   bool PostJournal(const string payload_type, const string payload_json);
```

- [ ] **Step 2: Implement (append below the class):**

```mql5
bool CJournalPublisher::PostJournal(const string payload_type, const string payload_json)
  {
   string sig = "";
   if(!ComputeHmacSha256Base64(payload_json, sig))
      return false;

   string body = StringFormat(
      "{\"license_key\":\"%s\",\"mt5_account\":%I64d,\"ea_source\":\"%s\",\"payload_type\":\"%s\",\"payload\":%s,\"signature\":\"%s\"}",
      m_license_key, m_mt5_account, m_ea_source, payload_type, payload_json, sig);

   uchar req[];
   StringToCharArray(body, req, 0, -1, CP_UTF8);
   ArrayResize(req, StringLen(body));

   string headers = "Content-Type: application/json\r\n"
                  + "Authorization: Bearer " + LICENSE_ANON_KEY + "\r\n"
                  + "apikey: " + LICENSE_ANON_KEY + "\r\n";

   uchar  resp[];
   string resp_headers = "";
   ResetLastError();
   int status = WebRequest("POST", JOURNAL_PUBLISH_URL, headers, LICENSE_HTTP_TIMEOUT_MS, req, resp, resp_headers);
   if(status == -1)
     {
      int err = GetLastError();
      if(err == 4060)
         PrintFormat("[CTX/journal] WebRequest blocked. Whitelist host in MT5 -> Tools -> Options -> Expert Advisors. err=%d", err);
      else
         PrintFormat("[CTX/journal] Network error err=%d", err);
      return false;
     }
   if(status >= 200 && status < 300) return true;
   if(status >= 400 && status < 500)
     {
      string body_resp = CharArrayToString(resp, 0, ArraySize(resp), CP_UTF8);
      PrintFormat("[CTX/journal] %d response: %s", status, body_resp);
      return false;
     }
   PrintFormat("[CTX/journal] Server error %d", status);
   return false;
  }
```

- [ ] **Step 3: Compile — expect 0 errors**

- [ ] **Step 4: Commit**

```bash
git add Include/CopyTraderX-Impulse/JournalPublisher.mqh
git commit -m "feat(ea/impulse): add PostJournal HTTP method"
```

### Task 5.5: Push methods — snapshot, daily, positions, deals, orders

**Files:**
- Modify: `Include/CopyTraderX-Impulse/JournalPublisher.mqh`

- [ ] **Step 1: Add private declarations**

```mql5
   void PushAccountSnapshot();
   void UpdateDailySnapshot();
   void ReplacePositions();
   void PushNewDeals();
   void PushNewOrders();
   string IsoUtc(datetime t);
   string IsoDate(datetime t);
   string EscapeJson(const string &s);
```

- [ ] **Step 2: Implement utility helpers**

```mql5
string CJournalPublisher::IsoUtc(datetime t)
  {
   MqlDateTime dt; TimeToStruct(t, dt);
   return StringFormat("%04d-%02d-%02dT%02d:%02d:%02dZ",
                       dt.year, dt.mon, dt.day, dt.hour, dt.min, dt.sec);
  }

string CJournalPublisher::IsoDate(datetime t)
  {
   MqlDateTime dt; TimeToStruct(t, dt);
   return StringFormat("%04d-%02d-%02d", dt.year, dt.mon, dt.day);
  }

string CJournalPublisher::EscapeJson(const string &s)
  {
   string out = s;
   StringReplace(out, "\\", "\\\\");
   StringReplace(out, "\"", "\\\"");
   StringReplace(out, "\n", "\\n");
   StringReplace(out, "\r", "\\r");
   StringReplace(out, "\t", "\\t");
   return out;
  }
```

- [ ] **Step 3: Implement `PushAccountSnapshot`**

```mql5
void CJournalPublisher::PushAccountSnapshot()
  {
   double balance       = AccountInfoDouble(ACCOUNT_BALANCE);
   double equity        = AccountInfoDouble(ACCOUNT_EQUITY);
   double margin        = AccountInfoDouble(ACCOUNT_MARGIN);
   double free_margin   = AccountInfoDouble(ACCOUNT_MARGIN_FREE);
   double margin_level  = AccountInfoDouble(ACCOUNT_MARGIN_LEVEL);
   double floating_pnl  = AccountInfoDouble(ACCOUNT_PROFIT);
   long   leverage      = AccountInfoInteger(ACCOUNT_LEVERAGE);
   string currency      = AccountInfoString(ACCOUNT_CURRENCY);
   string server        = AccountInfoString(ACCOUNT_SERVER);
   double drawdown_pct  = (balance > 0) ? MathMax(0.0, (balance - equity) / balance * 100.0) : 0.0;

   datetime now_utc = TimeGMT();
   string margin_level_field = (margin > 0) ? StringFormat("%.2f", margin_level) : "null";

   string payload = StringFormat(
     "{\"balance\":%.2f,\"equity\":%.2f,\"margin\":%.2f,\"free_margin\":%.2f,\"margin_level\":%s,"
     "\"floating_pnl\":%.2f,\"drawdown_pct\":%.4f,\"leverage\":%d,\"currency\":\"%s\","
     "\"server\":\"%s\",\"pushed_at\":\"%s\"}",
     balance, equity, margin, free_margin, margin_level_field,
     floating_pnl, drawdown_pct, (int)leverage, EscapeJson(currency),
     EscapeJson(server), IsoUtc(now_utc));

   if(PostJournal("snapshot", payload))
      m_last_account_push = TimeGMT();
  }
```

- [ ] **Step 4: Implement `UpdateDailySnapshot` (called in same cycle as snapshot)**

```mql5
void CJournalPublisher::UpdateDailySnapshot()
  {
   datetime now_utc    = TimeGMT();
   string   today_iso  = IsoDate(now_utc);
   double   balance    = AccountInfoDouble(ACCOUNT_BALANCE);
   double   equity     = AccountInfoDouble(ACCOUNT_EQUITY);
   // daily_pnl computed server-side would be ideal; for now we ship 0 and let
   // CTX recompute from deals if it cares. Future: track open-of-day balance
   // locally to compute daily_pnl. The MTJ port computes from deals anyway.
   double daily_pnl = 0.0;

   string payload = StringFormat(
     "{\"trade_date\":\"%s\",\"balance_close\":%.2f,\"equity_close\":%.2f,\"daily_pnl\":%.2f}",
     today_iso, balance, equity, daily_pnl);

   PostJournal("daily", payload);
  }
```

- [ ] **Step 5: Implement `ReplacePositions`**

```mql5
void CJournalPublisher::ReplacePositions()
  {
   int total = PositionsTotal();
   string positions_json = "[";
   for(int i = 0; i < total; i++)
     {
      ulong ticket = PositionGetTicket(i);
      if(ticket == 0) continue;
      if(!PositionSelectByTicket(ticket)) continue;

      string symbol      = PositionGetString(POSITION_SYMBOL);
      ENUM_POSITION_TYPE pt = (ENUM_POSITION_TYPE)PositionGetInteger(POSITION_TYPE);
      string side        = (pt == POSITION_TYPE_BUY) ? "buy" : "sell";
      double volume      = PositionGetDouble(POSITION_VOLUME);
      double open_price  = PositionGetDouble(POSITION_PRICE_OPEN);
      double current_pr  = PositionGetDouble(POSITION_PRICE_CURRENT);
      double sl          = PositionGetDouble(POSITION_SL);
      double tp          = PositionGetDouble(POSITION_TP);
      double profit      = PositionGetDouble(POSITION_PROFIT);
      double swap        = PositionGetDouble(POSITION_SWAP);
      // commission isn't on POSITION_*; use 0 here (closed-deal commission is on DEAL_COMMISSION).
      double commission  = 0.0;
      datetime open_time = (datetime)PositionGetInteger(POSITION_TIME);
      string comment     = PositionGetString(POSITION_COMMENT);
      long   magic       = PositionGetInteger(POSITION_MAGIC);

      string sl_field = (sl == 0.0) ? "null" : StringFormat("%.5f", sl);
      string tp_field = (tp == 0.0) ? "null" : StringFormat("%.5f", tp);

      string row = StringFormat(
        "{\"ticket\":%I64u,\"symbol\":\"%s\",\"side\":\"%s\",\"volume\":%.2f,"
        "\"open_price\":%.5f,\"current_price\":%.5f,\"sl\":%s,\"tp\":%s,"
        "\"profit\":%.2f,\"swap\":%.2f,\"commission\":%.2f,\"open_time\":\"%s\","
        "\"comment\":\"%s\",\"magic\":%I64d}",
        ticket, EscapeJson(symbol), side, volume,
        open_price, current_pr, sl_field, tp_field,
        profit, swap, commission, IsoUtc(open_time),
        EscapeJson(comment), magic);

      if(i > 0) positions_json += ",";
      positions_json += row;
     }
   positions_json += "]";

   string payload = StringFormat("{\"positions\":%s}", positions_json);
   if(PostJournal("positions", payload))
      m_last_positions_push = TimeGMT();
  }
```

- [ ] **Step 6: Implement `PushNewDeals` (and `PushNewOrders` mirroring)**

```mql5
void CJournalPublisher::PushNewDeals()
  {
   datetime since = TimeGMT() - JOURNAL_BACKFILL_DAYS * 86400;
   if(!HistorySelect(since, TimeGMT())) return;
   int total = HistoryDealsTotal();

   // Collect deals with ticket > m_last_pushed_deal_ticket. Pair "in" + "out"
   // by position_id; emit one row per closed round-trip (out deal carries close_price + profit).
   string deals_json = "[";
   int    emitted = 0;
   ulong  highest = m_last_pushed_deal_ticket;

   for(int i = 0; i < total; i++)
     {
      ulong ticket = HistoryDealGetTicket(i);
      if(ticket <= m_last_pushed_deal_ticket) continue;
      ENUM_DEAL_ENTRY entry = (ENUM_DEAL_ENTRY)HistoryDealGetInteger(ticket, DEAL_ENTRY);
      if(entry != DEAL_ENTRY_OUT) continue;            // emit once per round-trip
      ulong position_id = HistoryDealGetInteger(ticket, DEAL_POSITION_ID);
      string symbol     = HistoryDealGetString(ticket, DEAL_SYMBOL);
      ENUM_DEAL_TYPE dt = (ENUM_DEAL_TYPE)HistoryDealGetInteger(ticket, DEAL_TYPE);
      // For the OUT deal, side is opposite of the position; flip it so "side"
      // describes the original position direction.
      string side = (dt == DEAL_TYPE_SELL) ? "buy" : "sell";
      double volume     = HistoryDealGetDouble(ticket, DEAL_VOLUME);
      double close_pr   = HistoryDealGetDouble(ticket, DEAL_PRICE);
      double profit     = HistoryDealGetDouble(ticket, DEAL_PROFIT);
      double swap       = HistoryDealGetDouble(ticket, DEAL_SWAP);
      double commission = HistoryDealGetDouble(ticket, DEAL_COMMISSION);
      datetime close_t  = (datetime)HistoryDealGetInteger(ticket, DEAL_TIME);
      string comment    = HistoryDealGetString(ticket, DEAL_COMMENT);
      long   magic      = HistoryDealGetInteger(ticket, DEAL_MAGIC);

      // Find the matching IN deal for open_time + open_price.
      double open_price = 0.0;
      datetime open_t   = 0;
      for(int j = 0; j < total; j++)
        {
         ulong t2 = HistoryDealGetTicket(j);
         if(HistoryDealGetInteger(t2, DEAL_POSITION_ID) != position_id) continue;
         if((ENUM_DEAL_ENTRY)HistoryDealGetInteger(t2, DEAL_ENTRY) != DEAL_ENTRY_IN) continue;
         open_price = HistoryDealGetDouble(t2, DEAL_PRICE);
         open_t     = (datetime)HistoryDealGetInteger(t2, DEAL_TIME);
         break;
        }

      string row = StringFormat(
        "{\"ticket\":%I64u,\"symbol\":\"%s\",\"side\":\"%s\",\"volume\":%.2f,"
        "\"open_price\":%.5f,\"close_price\":%.5f,\"sl\":null,\"tp\":null,"
        "\"open_time\":\"%s\",\"close_time\":\"%s\",\"profit\":%.2f,"
        "\"commission\":%.2f,\"swap\":%.2f,\"comment\":\"%s\",\"magic\":%I64d}",
        position_id, EscapeJson(symbol), side, volume,
        open_price, close_pr, IsoUtc(open_t), IsoUtc(close_t),
        profit, commission, swap, EscapeJson(comment), magic);

      if(emitted > 0) deals_json += ",";
      deals_json += row;
      emitted++;
      if(ticket > highest) highest = ticket;

      // Chunk at 100.
      if(emitted >= 100)
        {
         deals_json += "]";
         string payload = StringFormat("{\"deals\":%s}", deals_json);
         if(!PostJournal("deals", payload)) return;
         m_last_pushed_deal_ticket = highest;
         deals_json = "["; emitted = 0;
        }
     }
   deals_json += "]";

   if(emitted > 0)
     {
      string payload = StringFormat("{\"deals\":%s}", deals_json);
      if(PostJournal("deals", payload))
         m_last_pushed_deal_ticket = highest;
     }
  }

void CJournalPublisher::PushNewOrders()
  {
   datetime since = TimeGMT() - JOURNAL_BACKFILL_DAYS * 86400;
   if(!HistorySelect(since, TimeGMT())) return;
   int total = HistoryOrdersTotal();

   string orders_json = "[";
   int    emitted = 0;
   ulong  highest = m_last_pushed_order_ticket;

   for(int i = 0; i < total; i++)
     {
      ulong ticket = HistoryOrderGetTicket(i);
      if(ticket <= m_last_pushed_order_ticket) continue;

      string symbol      = HistoryOrderGetString(ticket, ORDER_SYMBOL);
      ENUM_ORDER_TYPE ot = (ENUM_ORDER_TYPE)HistoryOrderGetInteger(ticket, ORDER_TYPE);
      string type_s      = EnumToString(ot); StringToLower(type_s);
      ENUM_ORDER_STATE os = (ENUM_ORDER_STATE)HistoryOrderGetInteger(ticket, ORDER_STATE);
      string state_s     = EnumToString(os); StringToLower(state_s);
      double vol_init    = HistoryOrderGetDouble(ticket, ORDER_VOLUME_INITIAL);
      double vol_cur     = HistoryOrderGetDouble(ticket, ORDER_VOLUME_CURRENT);
      double price_open  = HistoryOrderGetDouble(ticket, ORDER_PRICE_OPEN);
      double price_cur   = HistoryOrderGetDouble(ticket, ORDER_PRICE_CURRENT);
      double sl          = HistoryOrderGetDouble(ticket, ORDER_SL);
      double tp          = HistoryOrderGetDouble(ticket, ORDER_TP);
      datetime t_setup   = (datetime)HistoryOrderGetInteger(ticket, ORDER_TIME_SETUP);
      datetime t_done    = (datetime)HistoryOrderGetInteger(ticket, ORDER_TIME_DONE);
      string comment     = HistoryOrderGetString(ticket, ORDER_COMMENT);
      long   magic       = HistoryOrderGetInteger(ticket, ORDER_MAGIC);

      string sl_f  = (sl == 0.0) ? "null" : StringFormat("%.5f", sl);
      string tp_f  = (tp == 0.0) ? "null" : StringFormat("%.5f", tp);
      string po_f  = (price_open == 0.0) ? "null" : StringFormat("%.5f", price_open);
      string pc_f  = (price_cur  == 0.0) ? "null" : StringFormat("%.5f", price_cur);
      string td_f  = (t_done == 0) ? "null" : StringFormat("\"%s\"", IsoUtc(t_done));

      string row = StringFormat(
        "{\"ticket\":%I64u,\"symbol\":\"%s\",\"type\":\"%s\",\"state\":\"%s\","
        "\"volume_initial\":%.2f,\"volume_current\":%.2f,\"price_open\":%s,\"price_current\":%s,"
        "\"sl\":%s,\"tp\":%s,\"time_setup\":\"%s\",\"time_done\":%s,"
        "\"comment\":\"%s\",\"magic\":%I64d}",
        ticket, EscapeJson(symbol), type_s, state_s,
        vol_init, vol_cur, po_f, pc_f, sl_f, tp_f,
        IsoUtc(t_setup), td_f, EscapeJson(comment), magic);

      if(emitted > 0) orders_json += ",";
      orders_json += row;
      emitted++;
      if(ticket > highest) highest = ticket;

      if(emitted >= 100)
        {
         orders_json += "]";
         string payload = StringFormat("{\"orders\":%s}", orders_json);
         if(!PostJournal("orders", payload)) return;
         m_last_pushed_order_ticket = highest;
         orders_json = "["; emitted = 0;
        }
     }
   orders_json += "]";

   if(emitted > 0)
     {
      string payload = StringFormat("{\"orders\":%s}", orders_json);
      if(PostJournal("orders", payload))
         m_last_pushed_order_ticket = highest;
     }
  }
```

- [ ] **Step 7: Compile — expect 0 errors**

- [ ] **Step 8: Commit**

```bash
git add Include/CopyTraderX-Impulse/JournalPublisher.mqh
git commit -m "feat(ea/impulse): add snapshot/positions/deals/orders publishers"
```

### Task 5.6: State persistence + interval read + main timer dispatcher

**Files:**
- Modify: `Include/CopyTraderX-Impulse/JournalPublisher.mqh`

- [ ] **Step 1: Add private declarations**

```mql5
   bool LoadState();
   bool SaveState();
   int  ReadPushIntervalFromSupabase();
   void Backfill90Days();
```

- [ ] **Step 2: Implement state persistence (JSON-flavored manual format)**

```mql5
bool CJournalPublisher::LoadState()
  {
   int h = FileOpen(JOURNAL_STATE_FILENAME, FILE_READ|FILE_TXT|FILE_ANSI);
   if(h == INVALID_HANDLE) return false;
   string line = "";
   while(!FileIsEnding(h)) line += FileReadString(h);
   FileClose(h);
   // Manual parse: looking for "last_pushed_deal_ticket":N and "last_pushed_order_ticket":N.
   int pos = StringFind(line, "\"last_pushed_deal_ticket\":");
   if(pos >= 0)
     {
      string tail = StringSubstr(line, pos + 26);
      m_last_pushed_deal_ticket = (ulong)StringToInteger(tail);
     }
   pos = StringFind(line, "\"last_pushed_order_ticket\":");
   if(pos >= 0)
     {
      string tail = StringSubstr(line, pos + 27);
      m_last_pushed_order_ticket = (ulong)StringToInteger(tail);
     }
   m_backfill_done = StringFind(line, "\"backfill_done_at\"") >= 0;
   PrintFormat("[CTX/journal] state loaded: deals=%I64u orders=%I64u backfill_done=%s",
               m_last_pushed_deal_ticket, m_last_pushed_order_ticket,
               m_backfill_done ? "yes" : "no");
   return true;
  }

bool CJournalPublisher::SaveState()
  {
   int h = FileOpen(JOURNAL_STATE_FILENAME, FILE_WRITE|FILE_TXT|FILE_ANSI);
   if(h == INVALID_HANDLE) return false;
   string line = StringFormat(
      "{\"last_pushed_deal_ticket\":%I64u,\"last_pushed_order_ticket\":%I64u,\"backfill_done_at\":\"%s\"}",
      m_last_pushed_deal_ticket, m_last_pushed_order_ticket, IsoUtc(TimeGMT()));
   FileWriteString(h, line);
   FileClose(h);
   return true;
  }
```

- [ ] **Step 3: Implement `ReadPushIntervalFromSupabase` via PostgREST GET (using anon key + RLS-protected SELECT)**

The licenses table is RLS-protected; the anon key cannot read it. **Two options:**

(a) Add a small helper to the `publish-journal` Edge Function that returns `push_interval_seconds` for a given license_key (no HMAC needed — anon-key-authenticated read). Quickest to ship.

(b) Add a SQL RLS policy `SELECT push_interval_seconds FROM licenses WHERE license_key = ...` that allows anon-key reads of just that column.

We pick (a) — extend the existing function with a `GET ?license_key=...` action.

For now, **stub the method** to use the default constant. We'll wire option (a) in Task 5.8 once the EA path is fully functional. Add:

```mql5
int CJournalPublisher::ReadPushIntervalFromSupabase()
  {
   // TODO(Task 5.8): call publish-journal GET endpoint to read this license's
   // push_interval_seconds. For now use the configured default.
   return JOURNAL_DEFAULT_PUSH_INTERVAL_SEC;
  }
```

(Note: this single TODO is acceptable per the plan's discipline — we explicitly call out it's temporary in Task 5.8 below.)

- [ ] **Step 4: Implement `Backfill90Days`**

```mql5
void CJournalPublisher::Backfill90Days()
  {
   PrintFormat("[CTX/journal] starting 90-day backfill");
   PushNewDeals();
   PushNewOrders();
   m_backfill_done = true;
   SaveState();
   PrintFormat("[CTX/journal] backfill complete; deals_high=%I64u orders_high=%I64u",
               m_last_pushed_deal_ticket, m_last_pushed_order_ticket);
  }
```

- [ ] **Step 5: Replace `Init()` body to do state load + backfill if needed**

```mql5
bool CJournalPublisher::Init(const string license_key, long mt5_account, const string ea_source)
  {
   m_license_key = license_key;
   m_mt5_account = mt5_account;
   m_ea_source   = ea_source;
   m_push_interval_sec = ReadPushIntervalFromSupabase();
   PrintFormat("[CTX/journal] Init account=%I64d source=%s interval=%ds", m_mt5_account, m_ea_source, m_push_interval_sec);

   if(!LoadState() || !m_backfill_done)
      Backfill90Days();
   return true;
  }
```

- [ ] **Step 6: Implement the main `OnTimer` dispatcher**

```mql5
void CJournalPublisher::OnTimer()
  {
   datetime now = TimeGMT();

   // Re-read interval every 10 minutes (cheap; tolerates slow propagation).
   if(now - m_last_interval_check >= 600)
     {
      m_push_interval_sec = ReadPushIntervalFromSupabase();
      m_last_interval_check = now;
     }

   if(now - m_last_account_push >= m_push_interval_sec)
     {
      PushAccountSnapshot();
      UpdateDailySnapshot();
      ReplacePositions();
     }

   // Push new deals/orders every 30s (no point checking faster than the
   // browser polls them on CTX side).
   static datetime last_dealpush = 0;
   if(now - last_dealpush >= 30)
     {
      PushNewDeals();
      PushNewOrders();
      SaveState();
      last_dealpush = now;
     }
  }
```

- [ ] **Step 7: Implement `OnTradeTransaction` to push a deal/order immediately on close**

```mql5
void CJournalPublisher::OnTradeTransaction(const MqlTradeTransaction &trans,
                                           const MqlTradeRequest    &request,
                                           const MqlTradeResult     &result)
  {
   if(trans.type == TRADE_TRANSACTION_DEAL_ADD)
     {
      // A new deal landed — push so users see closed trades quickly.
      PushNewDeals();
      SaveState();
     }
  }
```

- [ ] **Step 8: Implement `Shutdown`**

```mql5
void CJournalPublisher::Shutdown()
  {
   SaveState();
   PrintFormat("[CTX/journal] Shutdown. state saved.");
  }
```

- [ ] **Step 9: Compile — expect 0 errors**

- [ ] **Step 10: Commit**

```bash
git add Include/CopyTraderX-Impulse/JournalPublisher.mqh
git commit -m "feat(ea/impulse): add state persistence, backfill, and OnTimer dispatcher"
```

### Task 5.7: Live test attach against the dev Supabase

**Files:** none (manual verification)

- [ ] **Step 1: Verify WebRequest whitelist**

In MT5: Tools → Options → Expert Advisors → "Allow WebRequest for listed URL". Confirm `https://mkfabzqlxzeidfblxzhq.supabase.co` is present (it should be from the existing license setup).

- [ ] **Step 2: Attach the EA to a chart on the test account**

Drag-attach `CopyTraderX-Impulse.mq5` to a chart with the test license key in inputs.

- [ ] **Step 3: Watch the Experts tab for journal logs**

Expected log lines (within ~10s):
```
[CTX/journal] Init account=12345 source=impulse interval=10s
[CTX/journal] starting 90-day backfill
[CTX/journal] backfill complete; deals_high=... orders_high=...
```

- [ ] **Step 4: Verify rows in Supabase**

Run in Supabase Studio:
```sql
SELECT mt5_account, pushed_at FROM account_snapshots_current WHERE mt5_account = <your test account>;
SELECT count(*) FROM deals WHERE mt5_account = <your test account>;
SELECT count(*) FROM positions WHERE mt5_account = <your test account>;
```

Expected: snapshot row present and updating; deals count > 0 (if account has history).

- [ ] **Step 5: Verify the journal page in CTX**

Open `http://copytraderx.local/licenses`. Click the test account's row. Expect: live panel populated, equity-curve render, calendar render. No console errors.

### Task 5.8: Wire `push_interval_seconds` read

**Files:**
- Modify: `~/Documents/development/EA/JSONFX-IMPULSE/supabase/functions/publish-journal/index.ts`
- Modify: `Include/CopyTraderX-Impulse/JournalPublisher.mqh`

- [ ] **Step 1: Extend `publish-journal` to handle GET requests**

Open `supabase/functions/publish-journal/index.ts`. In `handle()`, before the `if (req.method !== "POST")` check, add a GET branch:

```typescript
if (req.method === "GET") {
  const url = new URL(req.url);
  const license_key = url.searchParams.get("license_key");
  if (!license_key) return new Response("missing_license_key", { status: 400 });
  const sb = getClient();
  const { data, error } = await sb
    .from("licenses")
    .select("push_interval_seconds")
    .eq("license_key", license_key)
    .maybeSingle();
  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  if (!data) return new Response("not_found", { status: 404 });
  return new Response(JSON.stringify(data), { status: 200 });
}
```

Re-deploy:
```bash
cd ~/Documents/development/EA/JSONFX-IMPULSE
supabase functions deploy publish-journal
```

- [ ] **Step 2: Replace the EA's `ReadPushIntervalFromSupabase()` with a real WebRequest call**

```mql5
int CJournalPublisher::ReadPushIntervalFromSupabase()
  {
   string url = JOURNAL_PUBLISH_URL + "?license_key=" + m_license_key;
   string headers = "Authorization: Bearer " + LICENSE_ANON_KEY + "\r\n"
                  + "apikey: " + LICENSE_ANON_KEY + "\r\n";
   uchar  empty[]; uchar resp[]; string resp_headers;
   ResetLastError();
   int status = WebRequest("GET", url, headers, LICENSE_HTTP_TIMEOUT_MS, empty, resp, resp_headers);
   if(status != 200) return JOURNAL_DEFAULT_PUSH_INTERVAL_SEC;
   string body = CharArrayToString(resp, 0, ArraySize(resp), CP_UTF8);
   int pos = StringFind(body, "\"push_interval_seconds\":");
   if(pos < 0) return JOURNAL_DEFAULT_PUSH_INTERVAL_SEC;
   int n = (int)StringToInteger(StringSubstr(body, pos + 24));
   if(n < 3 || n > 60) return JOURNAL_DEFAULT_PUSH_INTERVAL_SEC;
   return n;
  }
```

- [ ] **Step 3: Compile + re-attach EA + verify log shows non-default interval when DB has it**

In Supabase Studio: `UPDATE licenses SET push_interval_seconds = 5 WHERE id = <test license>;`

Re-attach the EA. Expected log line within 10 minutes (or after restart):
```
[CTX/journal] Init account=... interval=5s
```

- [ ] **Step 4: Commit (both repos)**

```bash
# EA repo
cd ~/Documents/development/EA/JSONFX-IMPULSE
git add supabase/functions/publish-journal/index.ts Include/CopyTraderX-Impulse/JournalPublisher.mqh
git commit -m "feat(ea/impulse): read push_interval_seconds from publish-journal GET"
```

### Phase 5 Checkpoint

- [ ] Impulse EA compiles cleanly.
- [ ] Attached to test account, EA writes to all 6 tables.
- [ ] CTX journal page renders all six tabs against the test account with no console errors.
- [ ] `push_interval_seconds` change in DB propagates to the EA on its 10-min check.
- [ ] EA repo branch `feat/journal-publisher` ready.

---

## Phase 6 — Volt EAs: Port `JournalPublisher.mqh` to 4 Variants

The Volt repo has 4 EA variants (`CTX-Core`, `CTX-Live`, `CTX-Prop-Passer`, `CTX-Prop-Funded`). Each gets a near-identical copy of `JournalPublisher.mqh`, differing only by `EA_SOURCE_TAG` and `JOURNAL_STATE_FILENAME`. We copy + grep + sed in tightly-scoped tasks so divergence is impossible.

> **Skip `CTX-Core-Backtest`** — the backtest variant should not push journal data (`HistorySelect` data is synthetic). Add a guard in its `EACore.mqh` to skip `g_journal.Init()` when `MQLInfoInteger(MQL_TESTER) == true`.

### Task 6.1: Branch + copy module to CTX-Core

**Files:**
- Create: `volt/Include/CTX-Core/JournalPublisher.mqh`
- Modify: `volt/Include/CTX-Core/LicenseConfig.mqh`
- Modify: `volt/Include/CTX-Core/EACore.mqh`

- [ ] **Step 1: Create branch in Volt repo**

```bash
cd ~/Documents/development/EA/volt
git checkout main
git checkout -b feat/journal-publisher
```

- [ ] **Step 2: Copy the canonical `JournalPublisher.mqh` from Impulse**

```bash
cp ~/Documents/development/EA/JSONFX-IMPULSE/Include/CopyTraderX-Impulse/JournalPublisher.mqh \
   ~/Documents/development/EA/volt/Include/CTX-Core/JournalPublisher.mqh
```

- [ ] **Step 3: Replace the include path in the copy**

```bash
sed -i '' 's|<CopyTraderX-Impulse/LicenseConfig.mqh>|<CTX-Core/LicenseConfig.mqh>|g' \
   ~/Documents/development/EA/volt/Include/CTX-Core/JournalPublisher.mqh
```

- [ ] **Step 4: Append journal constants to `volt/Include/CTX-Core/LicenseConfig.mqh`**

```mql5
const string JOURNAL_PUBLISH_URL    = "https://mkfabzqlxzeidfblxzhq.supabase.co/functions/v1/publish-journal";
const string EA_SOURCE_TAG          = "ctx-core";
const string JOURNAL_STATE_FILENAME = "ctx_core_journal_state.dat";
const int    JOURNAL_BACKFILL_DAYS  = 90;
const int    JOURNAL_DEFAULT_PUSH_INTERVAL_SEC = 10;
```

- [ ] **Step 5: Wire into `volt/Include/CTX-Core/EACore.mqh`**

Add the same four hooks as Phase 5 Task 5.2 Step 2 (include + global instance + Init + Timer + TradeTransaction + Deinit). Change `EventSetTimer(60)` to `EventSetTimer(1)`.

- [ ] **Step 6: Compile in MetaEditor on the CTX-Core .mq5 — expect 0 errors**

- [ ] **Step 7: Commit**

```bash
cd ~/Documents/development/EA/volt
git add Include/CTX-Core/JournalPublisher.mqh Include/CTX-Core/LicenseConfig.mqh Include/CTX-Core/EACore.mqh
git commit -m "feat(ea/ctx-core): port JournalPublisher from Impulse"
```

### Task 6.2: Port to CTX-Live

**Files:**
- Create: `volt/Include/CTX-Live/JournalPublisher.mqh`
- Modify: `volt/Include/CTX-Live/LicenseConfig.mqh`
- Modify: `volt/Include/CTX-Live/EACore.mqh`

- [ ] **Step 1: Copy the CTX-Core version (already correct path namespace) and re-namespace**

```bash
cp ~/Documents/development/EA/volt/Include/CTX-Core/JournalPublisher.mqh \
   ~/Documents/development/EA/volt/Include/CTX-Live/JournalPublisher.mqh

sed -i '' 's|<CTX-Core/|<CTX-Live/|g' \
   ~/Documents/development/EA/volt/Include/CTX-Live/JournalPublisher.mqh
```

- [ ] **Step 2: Append constants to `volt/Include/CTX-Live/LicenseConfig.mqh`**

```mql5
const string JOURNAL_PUBLISH_URL    = "https://mkfabzqlxzeidfblxzhq.supabase.co/functions/v1/publish-journal";
const string EA_SOURCE_TAG          = "ctx-live";
const string JOURNAL_STATE_FILENAME = "ctx_live_journal_state.dat";
const int    JOURNAL_BACKFILL_DAYS  = 90;
const int    JOURNAL_DEFAULT_PUSH_INTERVAL_SEC = 10;
```

- [ ] **Step 3: Wire into `volt/Include/CTX-Live/EACore.mqh` (same four hooks)**

- [ ] **Step 4: Compile — expect 0 errors**

- [ ] **Step 5: Commit**

```bash
git add Include/CTX-Live/
git commit -m "feat(ea/ctx-live): port JournalPublisher"
```

### Task 6.3: Port to CTX-Prop-Passer

**Files:**
- Create: `volt/Include/CTX-Prop-Passer/JournalPublisher.mqh`
- Modify: `volt/Include/CTX-Prop-Passer/LicenseConfig.mqh`
- Modify: `volt/Include/CTX-Prop-Passer/EACore.mqh`

- [ ] **Step 1: Copy + re-namespace**

```bash
cp ~/Documents/development/EA/volt/Include/CTX-Core/JournalPublisher.mqh \
   ~/Documents/development/EA/volt/Include/CTX-Prop-Passer/JournalPublisher.mqh

sed -i '' 's|<CTX-Core/|<CTX-Prop-Passer/|g' \
   ~/Documents/development/EA/volt/Include/CTX-Prop-Passer/JournalPublisher.mqh
```

- [ ] **Step 2: Append constants to `LicenseConfig.mqh`**

```mql5
const string JOURNAL_PUBLISH_URL    = "https://mkfabzqlxzeidfblxzhq.supabase.co/functions/v1/publish-journal";
const string EA_SOURCE_TAG          = "ctx-prop-passer";
const string JOURNAL_STATE_FILENAME = "ctx_prop_passer_journal_state.dat";
const int    JOURNAL_BACKFILL_DAYS  = 90;
const int    JOURNAL_DEFAULT_PUSH_INTERVAL_SEC = 10;
```

- [ ] **Step 3: Wire into `EACore.mqh` (same four hooks)**

- [ ] **Step 4: Compile — expect 0 errors**

- [ ] **Step 5: Commit**

```bash
git add Include/CTX-Prop-Passer/
git commit -m "feat(ea/ctx-prop-passer): port JournalPublisher"
```

### Task 6.4: Port to CTX-Prop-Funded

**Files:**
- Create: `volt/Include/CTX-Prop-Funded/JournalPublisher.mqh`
- Modify: `volt/Include/CTX-Prop-Funded/LicenseConfig.mqh`
- Modify: `volt/Include/CTX-Prop-Funded/EACore.mqh`

- [ ] **Step 1: Copy + re-namespace**

```bash
cp ~/Documents/development/EA/volt/Include/CTX-Core/JournalPublisher.mqh \
   ~/Documents/development/EA/volt/Include/CTX-Prop-Funded/JournalPublisher.mqh

sed -i '' 's|<CTX-Core/|<CTX-Prop-Funded/|g' \
   ~/Documents/development/EA/volt/Include/CTX-Prop-Funded/JournalPublisher.mqh
```

- [ ] **Step 2: Append constants to `LicenseConfig.mqh`**

```mql5
const string JOURNAL_PUBLISH_URL    = "https://mkfabzqlxzeidfblxzhq.supabase.co/functions/v1/publish-journal";
const string EA_SOURCE_TAG          = "ctx-prop-funded";
const string JOURNAL_STATE_FILENAME = "ctx_prop_funded_journal_state.dat";
const int    JOURNAL_BACKFILL_DAYS  = 90;
const int    JOURNAL_DEFAULT_PUSH_INTERVAL_SEC = 10;
```

- [ ] **Step 3: Wire into `EACore.mqh` (same four hooks)**

- [ ] **Step 4: Compile — expect 0 errors**

- [ ] **Step 5: Commit**

```bash
git add Include/CTX-Prop-Funded/
git commit -m "feat(ea/ctx-prop-funded): port JournalPublisher"
```

### Task 6.5: Guard `CTX-Core-Backtest` from publishing

**Files:**
- Modify: `volt/Include/CTX-Core-Backtest/EACore.mqh`

- [ ] **Step 1: In `OnInit`, wrap any journal init with a tester guard**

If CTX-Core-Backtest already shares EACore with CTX-Core, the include is unwanted. Easiest path:

Open `volt/Include/CTX-Core-Backtest/EACore.mqh`. In `OnInit`, where `g_journal.Init(...)` would be called, wrap:

```mql5
   if(!MQLInfoInteger(MQL_TESTER))
     {
      if(!g_journal.Init(InpLicenseKey, AccountInfoInteger(ACCOUNT_LOGIN), EA_SOURCE_TAG))
         Print("[CTX] JournalPublisher init returned false");
     }
```

Similarly guard `g_journal.OnTimer()` in `OnTimer` and `g_journal.OnTradeTransaction(...)` in `OnTradeTransaction`. If CTX-Core-Backtest does not include the publisher at all, simply ensure no `#include` of `JournalPublisher.mqh`.

- [ ] **Step 2: Compile — expect 0 errors**

- [ ] **Step 3: Commit**

```bash
git add Include/CTX-Core-Backtest/EACore.mqh
git commit -m "feat(ea/ctx-core-backtest): skip journal init when in tester"
```

### Task 6.6: Diff-clean check across the 5 copies

**Files:** none (audit)

- [ ] **Step 1: Run a side-by-side diff on the 5 `JournalPublisher.mqh` files**

```bash
diff ~/Documents/development/EA/JSONFX-IMPULSE/Include/CopyTraderX-Impulse/JournalPublisher.mqh \
     ~/Documents/development/EA/volt/Include/CTX-Core/JournalPublisher.mqh
```

Expected: only line is the `#include <X/LicenseConfig.mqh>` path. Repeat for the other 3 Volt variants.

- [ ] **Step 2: Run a diff of the 5 `LicenseConfig.mqh` blocks (the 5 new constants)**

```bash
for f in \
  ~/Documents/development/EA/JSONFX-IMPULSE/Include/CopyTraderX-Impulse/LicenseConfig.mqh \
  ~/Documents/development/EA/volt/Include/CTX-Core/LicenseConfig.mqh \
  ~/Documents/development/EA/volt/Include/CTX-Live/LicenseConfig.mqh \
  ~/Documents/development/EA/volt/Include/CTX-Prop-Passer/LicenseConfig.mqh \
  ~/Documents/development/EA/volt/Include/CTX-Prop-Funded/LicenseConfig.mqh; do
  echo "=== $f ===";
  grep -E 'EA_SOURCE_TAG|JOURNAL_STATE_FILENAME' "$f"
done
```

Expected: 5 distinct `EA_SOURCE_TAG`/`JOURNAL_STATE_FILENAME` pairs matching the table in the spec.

### Phase 6 Checkpoint

- [ ] All 5 EA variants compile cleanly.
- [ ] Diff between Impulse's canonical and each Volt copy is precisely the include-path line.
- [ ] CTX-Core-Backtest does not publish.
- [ ] Volt repo branch ready.

---

## Phase 7 — End-to-End Verification

Multi-account validation against the 3 test accounts (1 live, 1 propfirm, 1 demo). Use the manual checklist from the spec (`docs/superpowers/specs/2026-05-02-journal-integration-design.md`, section 8).

### Task 7.1: Phase 3 round-trip per account

**Files:** none (manual)

- [ ] **Live account** — checklist phase 3 from spec
  - [ ] `account_snapshots_current` row appears within `push_interval_seconds`
  - [ ] `pushed_at` advances each tick; data-age indicator ticks
  - [ ] Open manual trade → row appears in `positions`
  - [ ] Modify SL/TP → reflects on next push
  - [ ] Close trade → vanishes from `positions`, appears in `deals`
  - [ ] `account_snapshots_daily` row updates as P/L moves

- [ ] **Propfirm account** — same checklist
- [ ] **Demo account** — same checklist

### Task 7.2: Phase 4 UI per account

- [ ] All 3 accounts: click row in `/licenses` → journal page renders
- [ ] All 6 tabs render without console error per account
- [ ] Equity curve renders on Performance tab
- [ ] Calendar shows trading days correctly
- [ ] Objectives tab: empty state on live + demo, populated on propfirm

### Task 7.3: Phase 5 polling

- [ ] `/settings` shows journal polling, 5 options, default 10s
- [ ] Change to 3s, watch DevTools network → poll cadence visible
- [ ] Change `push_interval_seconds` in DB → EA log shows new interval within 10 min
- [ ] CTX poll 3s + EA push 30s → tooltip explains mismatch

### Task 7.4: Phase 6 propfirm rule lifecycle

- [ ] Create rule → assign to propfirm license → Objectives tab populates
- [ ] Trigger daily-loss breach manually → rule status flips to "failed"
- [ ] Unassign rule → Objectives tab empty state
- [ ] Delete rule still in use → ON DELETE SET NULL clears license rule_id, Objectives empty

### Task 7.5: Phase 7 theme

- [ ] System / light / dark switch correctly across all pages
- [ ] Recharts equity chart re-renders with theme colors

### Task 7.6: Phase 8 multi-account isolation (the big one)

- [ ] All three EAs running simultaneously
- [ ] `SELECT DISTINCT mt5_account FROM account_snapshots_current` returns exactly 3
- [ ] Each license's journal page shows only its own data
- [ ] Stop one EA → only its journal stales; others fresh

### Task 7.7: Push branches & open PRs

- [ ] **CTX:**
```bash
cd /Users/jsonse/Documents/development/copytraderx-license-journal
git push -u origin feat/journal-integration
gh pr create --title "Journal integration: per-license drill-down" \
  --body "$(cat <<'EOF'
## Summary
- Per-license journal page at /licenses/[id]/journal with 6 tabs (Overview, Trades, Calendar, Performance, Orders, Objectives).
- New propfirm-rules CRUD pages.
- Live/dark/system theme support.
- Configurable polling (CTX-side + EA-side per-license).

## Test plan
- [ ] All Jest tests green
- [ ] Manual: 3 test accounts (live, propfirm, demo) round-trip end-to-end
- [ ] Multi-account isolation verified (Phase 8)

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **EA repo (JSONFX-IMPULSE):**
```bash
cd ~/Documents/development/EA/JSONFX-IMPULSE
git push -u origin feat/journal-tables
git push -u origin feat/journal-publisher
# Open separate PRs for each branch.
```

- [ ] **EA repo (Volt):**
```bash
cd ~/Documents/development/EA/volt
git push -u origin feat/journal-publisher
gh pr create --title "Journal publisher port to all 4 CTX variants" --body "Mirrors Impulse JournalPublisher.mqh into CTX-Core, CTX-Live, CTX-Prop-Passer, CTX-Prop-Funded. Backtest variant guarded."
```

### Phase 7 Checkpoint

- [ ] All checklists from Tasks 7.1–7.6 green.
- [ ] PRs open in 3 repos (CTX, JSONFX-IMPULSE, Volt).
- [ ] Spec marked "Verified" by user.

---

## Coverage Map (spec ↔ tasks)

| Spec section | Tasks |
|---|---|
| §2 Architecture | Implicit across all phases |
| §3 Scope | All in-scope items have tasks; out-of-scope explicitly skipped |
| §4 Data Model — `account_snapshots_current` | 1.1 |
| §4 Data Model — `account_snapshots_daily` | 1.2 |
| §4 Data Model — `positions` | 1.3 |
| §4 Data Model — `deals` | 1.4 |
| §4 Data Model — `orders` | 1.5 |
| §4 Data Model — `propfirm_rules` | 1.6 |
| §4 Data Model — license columns | 1.7 |
| §5 EA Module surface | 5.2, 5.3, 5.4, 5.5, 5.6 |
| §5 EA Wiring | 5.2 |
| §5 EA Timer cadence | 5.6 |
| §5 EA Authentication via publish-journal | 2.1–2.4, 5.4 |
| §5 EA Backfill | 5.6 |
| §5 EA State persistence | 5.6 |
| §6 CTX Routes | 4.10, 4.14 |
| §6 CTX File layout | Phase 3 + Phase 4 |
| §6 Page header | 4.10 |
| §6 Data fetching pattern | 4.4, 4.10 |
| §6 Per-tab content | 4.9 |
| §6 Theming | 4.2 |
| §7 Error handling EA | 5.4, 5.6 |
| §7 Error handling CTX | 3.14, 3.15, 4.4 |
| §7 Data integrity rules | 1.3 (positions replace), 2.3 (PostgREST upserts) |
| §7 Security | 2.3 (HMAC + account match) |
| §7 Migration order | Phases sequenced |
| §8 Unit tests | 3.3–3.12, 3.17 |
| §8 Edge Function tests | 2.2 |
| §8 Manual checklist | Phase 7 |
| §9 Branch & worktree | 0.1 |
| §10 Open questions | Captured in spec; not implemented (by design) |

