# Free Trial Tier Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the admin-side surface for issuing 7-day throwaway trial licenses to leads (Telegram/Discord DMs), fully isolated from `app_users`/`subscriptions`/`licenses`. Includes the SQL migration delivered as a `.sql` file in `docs/superpowers/plans/` and the full Next.js admin UI (list, create, detail, actions). EA-side migration to the new `validate_license` RPC is deferred to per-EA plans.

**Architecture:** Two new isolated tables (`trial_leads`, `trial_licenses`) with zero foreign keys into the subscriber schema. Hard-block dedupe on `mt5_account`, `email`, `telegram_handle`, `discord_handle` via DB unique indexes plus an app-level pre-check that surfaces per-field errors. A Postgres function `validate_license(key, mt5)` checks `licenses` first then `trial_licenses` so the EA can adopt a single RPC. New `/admin/trials` section parallel to `/admin/licenses`, never co-mingling data.

**Tech Stack:** Next.js 16 App Router, React 19, Tailwind v4, shadcn/ui, react-hook-form + zod, @supabase/supabase-js (service role on the server), Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-05-15-free-trial-tier-design.md`

**Conventions (verified against existing repo code):**

- API routes use `getSupabaseSSR()` for the caller's session + `extractRole({ user }) !== "admin"` → 403, then `getSupabaseAdmin()` for service-role DB writes (see `app/api/subscriptions/admin-create/route.ts`).
- Schema validation: `schema.safeParse(body)` → on failure return `400 { error: "invalid_request", issues: parsed.error.issues }`.
- Error response shape: `{ error: "<machine_code>", details?: "<message>" }`.
- Tests live next to the code: `lib/foo.ts` + `lib/foo.test.ts` (Vitest).
- e2e: `e2e/<name>.spec.ts` using `e2e/helpers/auth.ts` + `e2e/helpers/seed.ts`.
- Schema migrations are delivered as SQL files in `docs/superpowers/plans/` and applied via `supabase db push` from `~/Documents/development/EA/JSONFX-IMPULSE` (per repo README).

---

## Task 1: SQL migration deliverable

**Files:**
- Create: `docs/superpowers/plans/2026-05-15-trial-tier-migration.sql`

- [ ] **Step 1: Create the migration file**

```sql
-- Migration deliverable for the Supabase repo.
-- Suggested filename in the EA repo:
--   supabase/migrations/YYYYMMDDHHMMSS_create_trial_tier.sql
--
-- Pairs with the application changes on branch `feat/trial-tier`.
-- Ship the migration first (idempotent, additive), then the app code.

begin;

-- ── Enums ────────────────────────────────────────────────────────────────────
create type public.trial_lead_status as enum ('active', 'converted', 'abandoned');
create type public.trial_license_status as enum ('active', 'revoked');

-- ── Tables ───────────────────────────────────────────────────────────────────
create extension if not exists citext;

create table public.trial_leads (
  id                  bigserial primary key,
  email               citext       not null,
  telegram_handle     text         null,
  discord_handle      text         null,
  notes               text         null,
  status              public.trial_lead_status not null default 'active',
  converted_user_id   uuid         null references auth.users(id) on delete set null,
  created_at          timestamptz  not null default now(),
  created_by          uuid         null references auth.users(id)
);

create table public.trial_licenses (
  id                  bigserial primary key,
  trial_lead_id       bigint       not null references public.trial_leads(id) on delete cascade,
  product             text         not null,
  license_key         text         not null,
  mt5_account         bigint       not null,
  expires_at          timestamptz  not null,
  activated_at        timestamptz  null,
  last_validated_at   timestamptz  null,
  status              public.trial_license_status not null default 'active',
  broker_name         text         null,
  account_type        text         null check (account_type in ('demo','live','contest')),
  created_at          timestamptz  not null default now()
);

-- ── Dedupe indexes (hard-block) ──────────────────────────────────────────────
create unique index trial_leads_email_key
  on public.trial_leads (lower(email::text));
create unique index trial_leads_telegram_key
  on public.trial_leads (lower(telegram_handle))
  where telegram_handle is not null;
create unique index trial_leads_discord_key
  on public.trial_leads (lower(discord_handle))
  where discord_handle is not null;

create unique index trial_licenses_license_key_key
  on public.trial_licenses (license_key);
create unique index trial_licenses_mt5_account_key
  on public.trial_licenses (mt5_account);

-- Helper index for the validate function on the trial side.
create index trial_licenses_lookup_idx
  on public.trial_licenses (license_key, mt5_account);

-- ── RLS ──────────────────────────────────────────────────────────────────────
alter table public.trial_leads    enable row level security;
alter table public.trial_licenses enable row level security;

-- Admin-only direct access. The EA's anon key never touches these tables
-- directly; it calls validate_license() which runs as security definer.
create policy "trial_leads_admin_all" on public.trial_leads
  for all to authenticated
  using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
  with check ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

create policy "trial_licenses_admin_all" on public.trial_licenses
  for all to authenticated
  using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
  with check ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

-- ── Validate function (RPC) ──────────────────────────────────────────────────
-- Checks licenses first (hot path; preserves paid precedence during
-- conversion overlap), then falls back to trial_licenses. Returns a
-- unified row shape so EA result-parsing code stays uniform.
create or replace function public.validate_license(
  p_license_key text,
  p_mt5_account bigint
) returns table (
  source        text,
  id            bigint,
  product       text,
  license_key   text,
  mt5_account   bigint,
  status        text,
  expires_at    timestamptz,
  activated_at  timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
    select 'license'::text,
           l.id,
           l.product::text,
           l.license_key,
           l.mt5_account,
           l.status::text,
           l.expires_at,
           l.activated_at
    from public.licenses l
    where l.license_key = p_license_key
      and l.mt5_account = p_mt5_account
    limit 1;
  if found then return; end if;

  return query
    select 'trial'::text,
           t.id,
           t.product,
           t.license_key,
           t.mt5_account,
           case
             when t.status = 'revoked'   then 'revoked'
             when t.expires_at < now()   then 'expired'
             else 'active'
           end::text,
           t.expires_at,
           t.activated_at
    from public.trial_licenses t
    where t.license_key = p_license_key
      and t.mt5_account = p_mt5_account
    limit 1;
end;
$$;

grant execute on function public.validate_license(text, bigint) to anon, authenticated;

-- ── Stamp function (RPC) ─────────────────────────────────────────────────────
-- Called by EAs after a successful validate() to record activation +
-- last-seen + broker metadata. Branches by source so the EA does not need
-- to know which table the license came from.
create or replace function public.stamp_license_validated(
  p_source       text,
  p_id           bigint,
  p_broker_name  text,
  p_account_type text
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_source = 'license' then
    update public.licenses
       set last_validated_at = now(),
           activated_at      = coalesce(activated_at, now()),
           broker_name       = coalesce(p_broker_name, broker_name),
           account_type      = coalesce(p_account_type, account_type)
     where id = p_id;
  elsif p_source = 'trial' then
    update public.trial_licenses
       set last_validated_at = now(),
           activated_at      = coalesce(activated_at, now()),
           broker_name       = coalesce(p_broker_name, broker_name),
           account_type      = coalesce(p_account_type, account_type)
     where id = p_id;
  else
    raise exception 'unknown source: %', p_source;
  end if;
end;
$$;

grant execute on function public.stamp_license_validated(text, bigint, text, text) to anon, authenticated;

commit;
```

- [ ] **Step 2: Commit**

```bash
git add docs/superpowers/plans/2026-05-15-trial-tier-migration.sql
git commit -m "feat(migration): trial_leads + trial_licenses + validate_license RPC"
```

---

## Task 2: TypeScript types

**Files:**
- Modify: `lib/types.ts` (append new section at end)

- [ ] **Step 1: Append new types**

Open `lib/types.ts` and append at the end of the file:

```ts
// ── Trial tier (isolated from app_users / subscriptions / licenses) ──────────

export type TrialLeadStatus = "active" | "converted" | "abandoned";
export type TrialLicenseStatus = "active" | "revoked";
export type TrialDisplayStatus = "active" | "revoked" | "expired";

export interface TrialLead {
  id: number;
  email: string;
  telegram_handle: string | null;
  discord_handle: string | null;
  notes: string | null;
  status: TrialLeadStatus;
  converted_user_id: string | null;
  created_at: string;
  created_by: string | null;
}

export interface TrialLicense {
  id: number;
  trial_lead_id: number;
  product: Product;
  license_key: string;
  mt5_account: number;
  expires_at: string;
  activated_at: string | null;
  last_validated_at: string | null;
  status: TrialLicenseStatus;
  broker_name: string | null;
  account_type: AccountType | null;
  created_at: string;
}

export interface TrialRow {
  trial_lead: TrialLead;
  trial_license: TrialLicense;
}
```

- [ ] **Step 2: Verify it typechecks**

```bash
pnpm tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add lib/types.ts
git commit -m "feat(types): TrialLead, TrialLicense, TrialRow"
```

---

## Task 3: Zod schemas + tests

**Files:**
- Modify: `lib/schemas.ts` (append at end)
- Test: `lib/trial-schemas.test.ts` (new)

- [ ] **Step 1: Write failing tests first**

Create `lib/trial-schemas.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { createTrialSchema, convertTrialSchema } from "./schemas";

describe("createTrialSchema", () => {
  const valid = {
    product: "impulse",
    mt5_account: 12345678,
    email: "lead@example.com",
    telegram_handle: "@trader_john",
    discord_handle: "tjohn#1234",
    notes: "from telegram channel",
  };

  it("accepts a fully populated payload", () => {
    const result = createTrialSchema.safeParse(valid);
    expect(result.success).toBe(true);
  });

  it("accepts a payload with only required fields", () => {
    const result = createTrialSchema.safeParse({
      product: "impulse",
      mt5_account: 12345678,
      email: "lead@example.com",
    });
    expect(result.success).toBe(true);
  });

  it("rejects non-positive mt5_account", () => {
    const result = createTrialSchema.safeParse({ ...valid, mt5_account: 0 });
    expect(result.success).toBe(false);
  });

  it("rejects malformed email", () => {
    const result = createTrialSchema.safeParse({ ...valid, email: "not-an-email" });
    expect(result.success).toBe(false);
  });

  it("transforms empty telegram_handle to null", () => {
    const result = createTrialSchema.parse({ ...valid, telegram_handle: "   " });
    expect(result.telegram_handle).toBeNull();
  });

  it("transforms empty discord_handle to null", () => {
    const result = createTrialSchema.parse({ ...valid, discord_handle: "" });
    expect(result.discord_handle).toBeNull();
  });

  it("lowercases the email", () => {
    const result = createTrialSchema.parse({ ...valid, email: "LEAD@Example.COM" });
    expect(result.email).toBe("lead@example.com");
  });
});

describe("convertTrialSchema", () => {
  it("accepts a payload with a valid uuid", () => {
    const result = convertTrialSchema.safeParse({
      converted_user_id: "11111111-2222-3333-4444-555555555555",
    });
    expect(result.success).toBe(true);
  });

  it("accepts an empty payload (converted_user_id optional)", () => {
    const result = convertTrialSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it("rejects a non-uuid converted_user_id", () => {
    const result = convertTrialSchema.safeParse({ converted_user_id: "not-uuid" });
    expect(result.success).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests; expect failure**

```bash
pnpm test lib/trial-schemas.test.ts
```

Expected: FAIL because the schemas do not exist yet.

- [ ] **Step 3: Append schemas to `lib/schemas.ts`**

At the end of `lib/schemas.ts`:

```ts
// ── Trial tier schemas ───────────────────────────────────────────────────────

export const createTrialSchema = z
  .object({
    product: productEnum,
    mt5_account: z.number().int().positive(),
    email: z
      .string()
      .trim()
      .toLowerCase()
      .email()
      .max(254),
    telegram_handle: optionalNonEmpty,
    discord_handle: optionalNonEmpty,
    notes: optionalNonEmpty,
  })
  .strict();

export const convertTrialSchema = z
  .object({
    converted_user_id: z.string().uuid().optional(),
  })
  .strict();

export type CreateTrialInput = z.infer<typeof createTrialSchema>;
export type ConvertTrialInput = z.infer<typeof convertTrialSchema>;
```

- [ ] **Step 4: Run tests; expect pass**

```bash
pnpm test lib/trial-schemas.test.ts
```

Expected: all 10 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/schemas.ts lib/trial-schemas.test.ts
git commit -m "feat(schemas): createTrialSchema + convertTrialSchema with tests"
```

---

## Task 4: Trial display-status helper

**Files:**
- Create: `lib/trial-state.ts`
- Test: `lib/trial-state.test.ts`

- [ ] **Step 1: Write failing test**

Create `lib/trial-state.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { deriveTrialDisplayStatus } from "./trial-state";

const NOW = new Date("2026-05-15T12:00:00Z");

describe("deriveTrialDisplayStatus", () => {
  it("returns 'revoked' when stored status is revoked, regardless of date", () => {
    expect(
      deriveTrialDisplayStatus(
        { status: "revoked", expires_at: "2030-01-01T00:00:00Z" },
        NOW,
      ),
    ).toBe("revoked");
  });

  it("returns 'expired' when active but expires_at is in the past", () => {
    expect(
      deriveTrialDisplayStatus(
        { status: "active", expires_at: "2026-05-14T00:00:00Z" },
        NOW,
      ),
    ).toBe("expired");
  });

  it("returns 'active' when active and expires_at is in the future", () => {
    expect(
      deriveTrialDisplayStatus(
        { status: "active", expires_at: "2026-05-22T00:00:00Z" },
        NOW,
      ),
    ).toBe("active");
  });

  it("returns 'expired' at the exact expires_at boundary", () => {
    expect(
      deriveTrialDisplayStatus(
        { status: "active", expires_at: NOW.toISOString() },
        NOW,
      ),
    ).toBe("expired");
  });
});
```

- [ ] **Step 2: Run test; expect failure**

```bash
pnpm test lib/trial-state.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `lib/trial-state.ts`:

```ts
import type { TrialDisplayStatus, TrialLicenseStatus } from "./types";

export function deriveTrialDisplayStatus(
  license: { status: TrialLicenseStatus; expires_at: string },
  now: Date = new Date(),
): TrialDisplayStatus {
  if (license.status === "revoked") return "revoked";
  const expires = new Date(license.expires_at).getTime();
  if (expires <= now.getTime()) return "expired";
  return "active";
}
```

- [ ] **Step 4: Run test; expect pass**

```bash
pnpm test lib/trial-state.test.ts
```

Expected: 4 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/trial-state.ts lib/trial-state.test.ts
git commit -m "feat(lib): trial display-status derivation helper"
```

---

## Task 5: Trial-dedupe helper

**Files:**
- Create: `lib/trial-dedupe.ts`
- Test: `lib/trial-dedupe.test.ts`

This module exposes a single function that calls Supabase and returns a per-field collision map. The test mocks the Supabase client to keep it a pure unit test.

- [ ] **Step 1: Write failing test**

Create `lib/trial-dedupe.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";
import { checkTrialDedupe } from "./trial-dedupe";

type FakeRow = {
  id: number;
  email: string;
  telegram_handle: string | null;
  discord_handle: string | null;
  trial_licenses: { id: number; mt5_account: number; created_at: string; status: string } | null;
  created_at: string;
  status: string;
};

function mkFakeSb(rows: FakeRow[]) {
  return {
    from(_: string) {
      return {
        select(_: string) {
          return {
            or: vi.fn(() => Promise.resolve({ data: rows, error: null })),
          };
        },
      };
    },
  } as unknown as Parameters<typeof checkTrialDedupe>[0];
}

const baseInput = {
  email: "lead@example.com",
  mt5_account: 12345678,
  telegram_handle: null,
  discord_handle: null,
};

describe("checkTrialDedupe", () => {
  it("returns empty matches when nothing collides", async () => {
    const sb = mkFakeSb([]);
    const result = await checkTrialDedupe(sb, baseInput);
    expect(result).toEqual({});
  });

  it("flags email collision", async () => {
    const sb = mkFakeSb([
      {
        id: 7,
        email: "lead@example.com",
        telegram_handle: null,
        discord_handle: null,
        trial_licenses: null,
        created_at: "2026-04-01T00:00:00Z",
        status: "expired",
      },
    ]);
    const result = await checkTrialDedupe(sb, baseInput);
    expect(result.email).toEqual({
      trial_id: 7,
      created_at: "2026-04-01T00:00:00Z",
      status: "expired",
    });
  });

  it("flags telegram collision (case-insensitive) when provided", async () => {
    const sb = mkFakeSb([
      {
        id: 9,
        email: "other@example.com",
        telegram_handle: "@TRADER_JOHN",
        discord_handle: null,
        trial_licenses: null,
        created_at: "2026-04-02T00:00:00Z",
        status: "active",
      },
    ]);
    const result = await checkTrialDedupe(sb, {
      ...baseInput,
      telegram_handle: "@trader_john",
    });
    expect(result.telegram).toBeDefined();
    expect(result.telegram?.trial_id).toBe(9);
  });

  it("ignores null telegram on the input", async () => {
    const sb = mkFakeSb([
      {
        id: 11,
        email: "other@example.com",
        telegram_handle: "@someone",
        discord_handle: null,
        trial_licenses: null,
        created_at: "2026-04-02T00:00:00Z",
        status: "active",
      },
    ]);
    const result = await checkTrialDedupe(sb, baseInput);
    expect(result.telegram).toBeUndefined();
  });

  it("flags mt5 collision via embedded trial_licenses row", async () => {
    const sb = mkFakeSb([
      {
        id: 13,
        email: "other@example.com",
        telegram_handle: null,
        discord_handle: null,
        trial_licenses: {
          id: 21,
          mt5_account: 12345678,
          created_at: "2026-04-03T00:00:00Z",
          status: "active",
        },
        created_at: "2026-04-03T00:00:00Z",
        status: "active",
      },
    ]);
    const result = await checkTrialDedupe(sb, baseInput);
    expect(result.mt5_account).toBeDefined();
    expect(result.mt5_account?.trial_id).toBe(13);
  });
});
```

- [ ] **Step 2: Run test; expect failure**

```bash
pnpm test lib/trial-dedupe.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `lib/trial-dedupe.ts`:

```ts
import type { SupabaseClient } from "@supabase/supabase-js";

export type TrialDedupeInput = {
  email: string;
  mt5_account: number;
  telegram_handle: string | null;
  discord_handle: string | null;
};

export type TrialDedupeMatch = {
  trial_id: number;
  created_at: string;
  status: string;
};

export type TrialDedupeResult = {
  email?: TrialDedupeMatch;
  telegram?: TrialDedupeMatch;
  discord?: TrialDedupeMatch;
  mt5_account?: TrialDedupeMatch;
};

/**
 * Look up trial_leads (with their trial_licenses) that match any of the
 * four dedupe identifiers in one query. Returns a per-field collision map.
 * Empty object = no collisions; safe to proceed with insert.
 */
export async function checkTrialDedupe(
  sb: SupabaseClient,
  input: TrialDedupeInput,
): Promise<TrialDedupeResult> {
  const orParts: string[] = [`email.eq.${input.email}`];
  if (input.telegram_handle) {
    orParts.push(`telegram_handle.ilike.${escapeIlike(input.telegram_handle)}`);
  }
  if (input.discord_handle) {
    orParts.push(`discord_handle.ilike.${escapeIlike(input.discord_handle)}`);
  }

  const { data, error } = await sb
    .from("trial_leads")
    .select(
      "id, email, telegram_handle, discord_handle, created_at, status, " +
        "trial_licenses(id, mt5_account, created_at, status)",
    )
    .or(orParts.join(","));

  if (error) throw error;

  const result: TrialDedupeResult = {};
  const rows = (data ?? []) as Array<{
    id: number;
    email: string;
    telegram_handle: string | null;
    discord_handle: string | null;
    created_at: string;
    status: string;
    trial_licenses:
      | {
          id: number;
          mt5_account: number;
          created_at: string;
          status: string;
        }
      | Array<{ id: number; mt5_account: number; created_at: string; status: string }>
      | null;
  }>;

  for (const row of rows) {
    if (row.email.toLowerCase() === input.email.toLowerCase() && !result.email) {
      result.email = { trial_id: row.id, created_at: row.created_at, status: row.status };
    }
    if (
      input.telegram_handle &&
      row.telegram_handle &&
      row.telegram_handle.toLowerCase() === input.telegram_handle.toLowerCase() &&
      !result.telegram
    ) {
      result.telegram = { trial_id: row.id, created_at: row.created_at, status: row.status };
    }
    if (
      input.discord_handle &&
      row.discord_handle &&
      row.discord_handle.toLowerCase() === input.discord_handle.toLowerCase() &&
      !result.discord
    ) {
      result.discord = { trial_id: row.id, created_at: row.created_at, status: row.status };
    }
    const license = Array.isArray(row.trial_licenses)
      ? row.trial_licenses[0]
      : row.trial_licenses;
    if (license && license.mt5_account === input.mt5_account && !result.mt5_account) {
      result.mt5_account = {
        trial_id: row.id,
        created_at: license.created_at,
        status: license.status,
      };
    }
  }

  // The .or() above does not cover mt5_account because that lives on
  // trial_licenses. Do a targeted second lookup to catch leads who
  // collide on MT5# but not on contact fields.
  if (!result.mt5_account) {
    const { data: licRow, error: licErr } = await sb
      .from("trial_licenses")
      .select("id, mt5_account, status, created_at, trial_lead_id")
      .eq("mt5_account", input.mt5_account)
      .maybeSingle();
    if (licErr) throw licErr;
    if (licRow) {
      result.mt5_account = {
        trial_id: (licRow as { trial_lead_id: number }).trial_lead_id,
        created_at: (licRow as { created_at: string }).created_at,
        status: (licRow as { status: string }).status,
      };
    }
  }

  return result;
}

function escapeIlike(value: string): string {
  // PostgREST .or() uses commas as separators; escape any in the value.
  return value.replace(/,/g, "\\,");
}
```

- [ ] **Step 4: Run test; expect pass**

```bash
pnpm test lib/trial-dedupe.test.ts
```

Expected: 5 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/trial-dedupe.ts lib/trial-dedupe.test.ts
git commit -m "feat(lib): trial dedupe check with per-field collision map"
```

---

## Task 6: POST /api/trials (create)

**Files:**
- Create: `app/api/trials/route.ts`

This is the create endpoint. It uses `getSupabaseSSR()` to gate on admin role, validates with `createTrialSchema`, runs the dedupe pre-check, generates a license key, and inserts both rows in a transaction-like sequence. If the DB unique index raises despite the pre-check (race), the error is mapped back to the same `duplicate_trial` 409 shape.

- [ ] **Step 1: Implement**

Create `app/api/trials/route.ts`:

```ts
import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { getSupabaseSSR } from "@/lib/supabase/ssr";
import { extractRole } from "@/lib/role";
import { createTrialSchema } from "@/lib/schemas";
import { checkTrialDedupe } from "@/lib/trial-dedupe";
import { generateLicenseKey } from "@/lib/license-key";

const TRIAL_DURATION_MS = 7 * 24 * 60 * 60 * 1000;

export async function POST(req: Request) {
  const ssr = await getSupabaseSSR();
  const { data: { user } } = await ssr.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  if (extractRole({ user }) !== "admin") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  let body: unknown;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const parsed = createTrialSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_request", issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const input = parsed.data;

  const sb = getSupabaseAdmin();

  // App-level dedupe pre-check — returns 409 with per-field detail.
  const dedupe = await checkTrialDedupe(sb, {
    email: input.email,
    mt5_account: input.mt5_account,
    telegram_handle: input.telegram_handle ?? null,
    discord_handle: input.discord_handle ?? null,
  });
  if (Object.keys(dedupe).length > 0) {
    return NextResponse.json(
      { error: "duplicate_trial", fields: dedupe },
      { status: 409 },
    );
  }

  // Generate a license key. Retry up to 3 times on the (effectively zero)
  // chance the generated key collides with an existing key in either table.
  let licenseKey = generateLicenseKey(input.product);
  for (let attempt = 0; attempt < 3; attempt++) {
    const { count: cLic } = await sb
      .from("licenses")
      .select("id", { count: "exact", head: true })
      .eq("license_key", licenseKey);
    const { count: cTrial } = await sb
      .from("trial_licenses")
      .select("id", { count: "exact", head: true })
      .eq("license_key", licenseKey);
    if ((cLic ?? 0) === 0 && (cTrial ?? 0) === 0) break;
    licenseKey = generateLicenseKey(input.product);
  }

  const now = new Date();
  const expiresAt = new Date(now.getTime() + TRIAL_DURATION_MS);

  // Insert the lead first.
  const { data: lead, error: leadErr } = await sb
    .from("trial_leads")
    .insert({
      email: input.email,
      telegram_handle: input.telegram_handle ?? null,
      discord_handle: input.discord_handle ?? null,
      notes: input.notes ?? null,
      created_by: user.id,
    })
    .select()
    .single();
  if (leadErr) {
    if (leadErr.code === "23505") {
      return NextResponse.json(
        { error: "duplicate_trial", fields: { email: { trial_id: 0, created_at: now.toISOString(), status: "active" } } },
        { status: 409 },
      );
    }
    return NextResponse.json({ error: "insert_failed", details: leadErr.message }, { status: 500 });
  }

  // Insert the license. If this fails, roll back the lead manually.
  const { data: license, error: licErr } = await sb
    .from("trial_licenses")
    .insert({
      trial_lead_id: lead.id,
      product: input.product,
      license_key: licenseKey,
      mt5_account: input.mt5_account,
      expires_at: expiresAt.toISOString(),
    })
    .select()
    .single();
  if (licErr) {
    await sb.from("trial_leads").delete().eq("id", lead.id);
    if (licErr.code === "23505") {
      return NextResponse.json(
        { error: "duplicate_trial", fields: { mt5_account: { trial_id: 0, created_at: now.toISOString(), status: "active" } } },
        { status: 409 },
      );
    }
    return NextResponse.json({ error: "insert_failed", details: licErr.message }, { status: 500 });
  }

  return NextResponse.json({ trial_lead: lead, trial_license: license }, { status: 201 });
}
```

- [ ] **Step 2: Verify it typechecks**

```bash
pnpm tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add app/api/trials/route.ts
git commit -m "feat(api): POST /api/trials creates trial lead + license with dedupe"
```

---

## Task 7: POST /api/trials/[id]/revoke

**Files:**
- Create: `app/api/trials/[id]/revoke/route.ts`

- [ ] **Step 1: Implement**

```ts
import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { getSupabaseSSR } from "@/lib/supabase/ssr";
import { extractRole } from "@/lib/role";

export async function POST(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id: idRaw } = await ctx.params;
  const id = Number(idRaw);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: "invalid_id" }, { status: 400 });
  }

  const ssr = await getSupabaseSSR();
  const { data: { user } } = await ssr.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  if (extractRole({ user }) !== "admin") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const sb = getSupabaseAdmin();
  const { data: updated, error } = await sb
    .from("trial_licenses")
    .update({ status: "revoked" })
    .eq("id", id)
    .select()
    .maybeSingle();
  if (error) return NextResponse.json({ error: "update_failed", details: error.message }, { status: 500 });
  if (!updated) return NextResponse.json({ error: "not_found" }, { status: 404 });

  return NextResponse.json({ trial_license: updated });
}
```

- [ ] **Step 2: Commit**

```bash
git add app/api/trials/[id]/revoke/route.ts
git commit -m "feat(api): POST /api/trials/[id]/revoke"
```

---

## Task 8: POST /api/trials/[id]/convert

Sets `trial_leads.status='converted'`, sets `converted_user_id`, and revokes the trial license. All three writes happen in sequence; on any error after the first succeeds, attempt to roll back the prior writes.

**Files:**
- Create: `app/api/trials/[id]/convert/route.ts`

- [ ] **Step 1: Implement**

```ts
import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { getSupabaseSSR } from "@/lib/supabase/ssr";
import { extractRole } from "@/lib/role";
import { convertTrialSchema } from "@/lib/schemas";

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id: idRaw } = await ctx.params;
  const id = Number(idRaw);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: "invalid_id" }, { status: 400 });
  }

  const ssr = await getSupabaseSSR();
  const { data: { user } } = await ssr.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  if (extractRole({ user }) !== "admin") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  let body: unknown;
  try { body = await req.json(); } catch { body = {}; }
  const parsed = convertTrialSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_request", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const sb = getSupabaseAdmin();
  const { data: lead, error: leadErr } = await sb
    .from("trial_leads")
    .update({
      status: "converted",
      converted_user_id: parsed.data.converted_user_id ?? null,
    })
    .eq("id", id)
    .select()
    .maybeSingle();
  if (leadErr) return NextResponse.json({ error: "update_failed", details: leadErr.message }, { status: 500 });
  if (!lead) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const { data: license, error: licErr } = await sb
    .from("trial_licenses")
    .update({ status: "revoked" })
    .eq("trial_lead_id", id)
    .select()
    .maybeSingle();
  if (licErr) {
    // Best-effort rollback of the lead status change.
    await sb.from("trial_leads").update({ status: "active", converted_user_id: null }).eq("id", id);
    return NextResponse.json({ error: "update_failed", details: licErr.message }, { status: 500 });
  }

  return NextResponse.json({ trial_lead: lead, trial_license: license });
}
```

- [ ] **Step 2: Commit**

```bash
git add app/api/trials/[id]/convert/route.ts
git commit -m "feat(api): POST /api/trials/[id]/convert flips lead + revokes license"
```

---

## Task 9: POST /api/trials/[id]/abandon

**Files:**
- Create: `app/api/trials/[id]/abandon/route.ts`

- [ ] **Step 1: Implement**

```ts
import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { getSupabaseSSR } from "@/lib/supabase/ssr";
import { extractRole } from "@/lib/role";

export async function POST(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id: idRaw } = await ctx.params;
  const id = Number(idRaw);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: "invalid_id" }, { status: 400 });
  }

  const ssr = await getSupabaseSSR();
  const { data: { user } } = await ssr.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  if (extractRole({ user }) !== "admin") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const sb = getSupabaseAdmin();
  const { data: lead, error } = await sb
    .from("trial_leads")
    .update({ status: "abandoned" })
    .eq("id", id)
    .select()
    .maybeSingle();
  if (error) return NextResponse.json({ error: "update_failed", details: error.message }, { status: 500 });
  if (!lead) return NextResponse.json({ error: "not_found" }, { status: 404 });

  return NextResponse.json({ trial_lead: lead });
}
```

- [ ] **Step 2: Commit**

```bash
git add app/api/trials/[id]/abandon/route.ts
git commit -m "feat(api): POST /api/trials/[id]/abandon"
```

---

## Task 10: Trial list page

**Files:**
- Create: `components/trial-table.tsx`
- Create: `app/admin/trials/page.tsx`

- [ ] **Step 1: Create the trial-table component**

`components/trial-table.tsx`:

```tsx
"use client";

import Link from "next/link";
import { deriveTrialDisplayStatus } from "@/lib/trial-state";
import type { TrialLead, TrialLicense } from "@/lib/types";

export type TrialRowDisplay = {
  trial_lead: TrialLead;
  trial_license: TrialLicense;
};

export function TrialTable({ rows }: { rows: TrialRowDisplay[] }) {
  if (rows.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No trial licenses yet. Click <strong>New trial</strong> to issue one.
      </p>
    );
  }

  return (
    <table className="w-full text-sm">
      <thead className="text-left text-xs uppercase text-muted-foreground">
        <tr>
          <th className="py-2 pr-3">License key</th>
          <th className="py-2 pr-3">Product</th>
          <th className="py-2 pr-3">MT5</th>
          <th className="py-2 pr-3">Email</th>
          <th className="py-2 pr-3">TG</th>
          <th className="py-2 pr-3">Discord</th>
          <th className="py-2 pr-3">Expires</th>
          <th className="py-2 pr-3">Status</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => {
          const display = deriveTrialDisplayStatus({
            status: r.trial_license.status,
            expires_at: r.trial_license.expires_at,
          });
          return (
            <tr key={r.trial_license.id} className="border-t hover:bg-muted/30">
              <td className="py-2 pr-3 font-mono">
                <Link href={`/admin/trials/${r.trial_lead.id}`} className="hover:underline">
                  {r.trial_license.license_key}
                </Link>
              </td>
              <td className="py-2 pr-3">{r.trial_license.product}</td>
              <td className="py-2 pr-3 font-mono">{r.trial_license.mt5_account}</td>
              <td className="py-2 pr-3">{r.trial_lead.email}</td>
              <td className="py-2 pr-3">{r.trial_lead.telegram_handle ?? "—"}</td>
              <td className="py-2 pr-3">{r.trial_lead.discord_handle ?? "—"}</td>
              <td className="py-2 pr-3">{r.trial_license.expires_at.slice(0, 10)}</td>
              <td className="py-2 pr-3">
                <span
                  className={
                    display === "active"
                      ? "text-emerald-600"
                      : display === "expired"
                        ? "text-amber-600"
                        : "text-red-600"
                  }
                >
                  {display}
                </span>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
```

- [ ] **Step 2: Create the page**

`app/admin/trials/page.tsx`:

```tsx
import Link from "next/link";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { TrialTable } from "@/components/trial-table";
import type { TrialLead, TrialLicense } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function TrialsPage() {
  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .from("trial_leads")
    .select("*, trial_licenses(*)")
    .order("created_at", { ascending: false });

  if (error) {
    return (
      <main className="mx-auto max-w-6xl px-6 py-10">
        <h1 className="text-2xl font-semibold">Trials</h1>
        <p className="mt-4 text-sm text-red-600">Failed to load trials: {error.message}</p>
      </main>
    );
  }

  const rows = (data ?? [])
    .flatMap((lead) => {
      const licenses = Array.isArray(lead.trial_licenses)
        ? lead.trial_licenses
        : lead.trial_licenses
          ? [lead.trial_licenses]
          : [];
      return licenses.map((license: TrialLicense) => ({
        trial_lead: lead as TrialLead,
        trial_license: license,
      }));
    });

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Trials</h1>
        <Link
          href="/admin/trials/new"
          className="rounded-md bg-foreground px-3 py-1.5 text-sm text-background hover:opacity-90"
        >
          + New trial
        </Link>
      </div>
      <div className="mt-6">
        <TrialTable rows={rows} />
      </div>
    </main>
  );
}
```

- [ ] **Step 3: Verify it builds**

```bash
pnpm tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add components/trial-table.tsx app/admin/trials/page.tsx
git commit -m "feat(admin): /admin/trials list page"
```

---

## Task 11: Trial create form + page

**Files:**
- Create: `components/trial-form.tsx`
- Create: `app/admin/trials/new/page.tsx`

- [ ] **Step 1: Create the form component**

`components/trial-form.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { createTrialSchema, type CreateTrialInput } from "@/lib/schemas";
import { PRODUCTS } from "@/lib/products";

type DedupeMatch = { trial_id: number; created_at: string; status: string };
type DedupeError = {
  error: "duplicate_trial";
  fields: {
    email?: DedupeMatch;
    telegram?: DedupeMatch;
    discord?: DedupeMatch;
    mt5_account?: DedupeMatch;
  };
};

export function TrialForm() {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [dedupe, setDedupe] = useState<DedupeError["fields"] | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const [createdKey, setCreatedKey] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<CreateTrialInput>({
    resolver: zodResolver(createTrialSchema),
    defaultValues: {
      product: PRODUCTS[0].code,
    },
  });

  async function onSubmit(values: CreateTrialInput) {
    setSubmitting(true);
    setDedupe(null);
    setServerError(null);
    try {
      const res = await fetch("/api/trials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      if (res.status === 409) {
        const body = (await res.json()) as DedupeError;
        setDedupe(body.fields);
        return;
      }
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setServerError(body.error ?? `HTTP ${res.status}`);
        return;
      }
      const body = (await res.json()) as { trial_license: { license_key: string } };
      setCreatedKey(body.trial_license.license_key);
    } finally {
      setSubmitting(false);
    }
  }

  if (createdKey) {
    return (
      <div className="space-y-4">
        <p className="text-sm">
          Trial issued. Copy the key below and paste it into the lead's
          Telegram or Discord DM:
        </p>
        <pre className="rounded-md border bg-muted/30 px-3 py-2 font-mono text-base">
          {createdKey}
        </pre>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => navigator.clipboard.writeText(createdKey)}
            className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted/50"
          >
            Copy key
          </button>
          <button
            type="button"
            onClick={() => router.push("/admin/trials")}
            className="rounded-md bg-foreground px-3 py-1.5 text-sm text-background hover:opacity-90"
          >
            Back to trials
          </button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div className="grid gap-1">
        <label className="text-sm font-medium">Product</label>
        <select
          {...register("product")}
          className="rounded-md border bg-background px-2 py-1.5 text-sm"
        >
          {PRODUCTS.map((p) => (
            <option key={p.code} value={p.code}>
              {p.displayName}
            </option>
          ))}
        </select>
        {errors.product && (
          <p className="text-xs text-red-600">{errors.product.message}</p>
        )}
      </div>

      <div className="grid gap-1">
        <label className="text-sm font-medium">MT5 account</label>
        <input
          type="number"
          {...register("mt5_account", { valueAsNumber: true })}
          className="rounded-md border bg-background px-2 py-1.5 text-sm"
        />
        {errors.mt5_account && (
          <p className="text-xs text-red-600">{errors.mt5_account.message}</p>
        )}
        {dedupe?.mt5_account && (
          <p className="text-xs text-red-600">
            MT5 account already had a trial on {dedupe.mt5_account.created_at.slice(0, 10)} ({dedupe.mt5_account.status}).
          </p>
        )}
      </div>

      <div className="grid gap-1">
        <label className="text-sm font-medium">Email</label>
        <input
          type="email"
          {...register("email")}
          className="rounded-md border bg-background px-2 py-1.5 text-sm"
        />
        {errors.email && (
          <p className="text-xs text-red-600">{errors.email.message}</p>
        )}
        {dedupe?.email && (
          <p className="text-xs text-red-600">
            Email already had a trial on {dedupe.email.created_at.slice(0, 10)} ({dedupe.email.status}).
          </p>
        )}
      </div>

      <div className="grid gap-1">
        <label className="text-sm font-medium">Telegram handle (optional)</label>
        <input
          type="text"
          {...register("telegram_handle")}
          placeholder="@username"
          className="rounded-md border bg-background px-2 py-1.5 text-sm"
        />
        {dedupe?.telegram && (
          <p className="text-xs text-red-600">
            Telegram handle already used on {dedupe.telegram.created_at.slice(0, 10)}.
          </p>
        )}
      </div>

      <div className="grid gap-1">
        <label className="text-sm font-medium">Discord handle (optional)</label>
        <input
          type="text"
          {...register("discord_handle")}
          placeholder="user#1234 or @user"
          className="rounded-md border bg-background px-2 py-1.5 text-sm"
        />
        {dedupe?.discord && (
          <p className="text-xs text-red-600">
            Discord handle already used on {dedupe.discord.created_at.slice(0, 10)}.
          </p>
        )}
      </div>

      <div className="grid gap-1">
        <label className="text-sm font-medium">Notes (optional)</label>
        <textarea
          {...register("notes")}
          rows={3}
          className="rounded-md border bg-background px-2 py-1.5 text-sm"
        />
      </div>

      {serverError && <p className="text-sm text-red-600">{serverError}</p>}

      <div className="flex justify-end gap-3">
        <button
          type="button"
          onClick={() => router.push("/admin/trials")}
          className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted/50"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={submitting}
          className="rounded-md bg-foreground px-3 py-1.5 text-sm text-background hover:opacity-90 disabled:opacity-50"
        >
          {submitting ? "Creating…" : "Create trial"}
        </button>
      </div>
    </form>
  );
}
```

- [ ] **Step 2: Create the page wrapper**

`app/admin/trials/new/page.tsx`:

```tsx
import { TrialForm } from "@/components/trial-form";

export default function NewTrialPage() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-10">
      <h1 className="text-2xl font-semibold">New trial</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Issue a 7-day trial license. Copy the key from the success screen and
        paste it into the lead's Telegram or Discord DM.
      </p>
      <div className="mt-6">
        <TrialForm />
      </div>
    </main>
  );
}
```

- [ ] **Step 3: Typecheck**

```bash
pnpm tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add components/trial-form.tsx app/admin/trials/new/page.tsx
git commit -m "feat(admin): /admin/trials/new form with dedupe error display"
```

---

## Task 12: Trial detail page with actions

**Files:**
- Create: `app/admin/trials/[id]/page.tsx`
- Create: `components/trial-actions.tsx`

The detail page is a server component that loads the lead + license and renders an actions client component with three buttons: Revoke, Mark converted, Mark abandoned.

- [ ] **Step 1: Create the actions component**

`components/trial-actions.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function TrialActions({
  trialLeadId,
  licenseStatus,
  leadStatus,
}: {
  trialLeadId: number;
  licenseStatus: "active" | "revoked";
  leadStatus: "active" | "converted" | "abandoned";
}) {
  const router = useRouter();
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function action(path: string, body: unknown = {}) {
    setPending(path);
    setError(null);
    try {
      const res = await fetch(`/api/trials/${trialLeadId}/${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        setError(b.error ?? `HTTP ${res.status}`);
        return;
      }
      router.refresh();
    } finally {
      setPending(null);
    }
  }

  async function markConverted() {
    const uid = prompt("New user_id (uuid, optional — leave blank to skip):") ?? "";
    const body = uid.trim() ? { converted_user_id: uid.trim() } : {};
    await action("convert", body);
  }

  return (
    <div className="flex flex-wrap gap-3">
      <button
        type="button"
        disabled={licenseStatus === "revoked" || pending !== null}
        onClick={() => action("revoke")}
        className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted/50 disabled:opacity-50"
      >
        {pending === "revoke" ? "Revoking…" : "Revoke"}
      </button>
      <button
        type="button"
        disabled={leadStatus !== "active" || pending !== null}
        onClick={markConverted}
        className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted/50 disabled:opacity-50"
      >
        {pending === "convert" ? "Saving…" : "Mark converted"}
      </button>
      <button
        type="button"
        disabled={leadStatus !== "active" || pending !== null}
        onClick={() => action("abandon")}
        className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted/50 disabled:opacity-50"
      >
        {pending === "abandon" ? "Saving…" : "Mark abandoned"}
      </button>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
```

- [ ] **Step 2: Create the detail page**

`app/admin/trials/[id]/page.tsx`:

```tsx
import { notFound } from "next/navigation";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { TrialActions } from "@/components/trial-actions";
import { deriveTrialDisplayStatus } from "@/lib/trial-state";
import type { TrialLead, TrialLicense } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function TrialDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: idRaw } = await params;
  const id = Number(idRaw);
  if (!Number.isInteger(id) || id <= 0) notFound();

  const sb = getSupabaseAdmin();
  const { data: lead, error: leadErr } = await sb
    .from("trial_leads")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (leadErr || !lead) notFound();

  const { data: license, error: licErr } = await sb
    .from("trial_licenses")
    .select("*")
    .eq("trial_lead_id", id)
    .maybeSingle();
  if (licErr || !license) notFound();

  const typedLead = lead as TrialLead;
  const typedLicense = license as TrialLicense;
  const display = deriveTrialDisplayStatus({
    status: typedLicense.status,
    expires_at: typedLicense.expires_at,
  });

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <h1 className="text-2xl font-semibold">Trial #{typedLead.id}</h1>

      <section className="mt-6 grid grid-cols-2 gap-4 text-sm">
        <Field label="License key" value={typedLicense.license_key} mono />
        <Field label="Status" value={display} />
        <Field label="Product" value={typedLicense.product} />
        <Field label="MT5 account" value={String(typedLicense.mt5_account)} mono />
        <Field label="Expires at" value={typedLicense.expires_at} />
        <Field label="Activated at" value={typedLicense.activated_at ?? "—"} />
        <Field label="Last validated" value={typedLicense.last_validated_at ?? "—"} />
        <Field label="Account type (reported)" value={typedLicense.account_type ?? "—"} />
        <Field label="Broker (reported)" value={typedLicense.broker_name ?? "—"} />
        <Field label="Lead status" value={typedLead.status} />
        <Field label="Email" value={typedLead.email} />
        <Field label="Telegram" value={typedLead.telegram_handle ?? "—"} />
        <Field label="Discord" value={typedLead.discord_handle ?? "—"} />
        <Field label="Converted user_id" value={typedLead.converted_user_id ?? "—"} mono />
        <Field label="Notes" value={typedLead.notes ?? "—"} />
        <Field label="Created at" value={typedLead.created_at} />
      </section>

      <div className="mt-8">
        <h2 className="text-sm font-medium uppercase text-muted-foreground">Actions</h2>
        <div className="mt-3">
          <TrialActions
            trialLeadId={typedLead.id}
            licenseStatus={typedLicense.status}
            leadStatus={typedLead.status}
          />
        </div>
      </div>
    </main>
  );
}

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <div className="text-xs uppercase text-muted-foreground">{label}</div>
      <div className={mono ? "mt-0.5 font-mono" : "mt-0.5"}>{value}</div>
    </div>
  );
}
```

- [ ] **Step 3: Typecheck**

```bash
pnpm tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add components/trial-actions.tsx app/admin/trials/[id]/page.tsx
git commit -m "feat(admin): /admin/trials/[id] detail page with actions"
```

---

## Task 13: Add Trials nav entry

**Files:**
- Modify: `components/site-nav.tsx`

- [ ] **Step 1: Insert the link after the Licenses entry**

In `components/site-nav.tsx`, find the existing block:

```tsx
          <Link
            href="/admin/licenses"
            className={linkClass("/admin/licenses")}
            aria-current={pathname?.startsWith("/admin/licenses") ? "page" : undefined}
          >
            Licenses
          </Link>
```

Add this directly after it:

```tsx
          <Link
            href="/admin/trials"
            className={linkClass("/admin/trials")}
            aria-current={pathname?.startsWith("/admin/trials") ? "page" : undefined}
          >
            Trials
          </Link>
```

- [ ] **Step 2: Run the dev server and visually verify**

```bash
pnpm dev
```

Then open `http://localhost:3000/admin/licenses` and confirm:
- The "Trials" link appears in the nav between "Licenses" and "Settings".
- Clicking it navigates to `/admin/trials`.
- The active highlight shows on the Trials tab when on `/admin/trials/...`.

Stop the dev server with Ctrl+C when verified.

- [ ] **Step 3: Commit**

```bash
git add components/site-nav.tsx
git commit -m "feat(nav): add Trials entry to site nav"
```

---

## Task 14: Playwright e2e smoke

**Files:**
- Create: `e2e/admin-issues-trial.spec.ts`

Mirrors the shape of `e2e/admin-subscriptions-page.spec.ts`. Logs in as the seeded admin, opens `/admin/trials`, fills the form with random-but-valid identifiers, and confirms the success state.

- [ ] **Step 1: Read the existing seed/auth helpers**

```bash
cat e2e/helpers/auth.ts e2e/helpers/seed.ts
```

Note the helper names and how existing tests acquire an admin session. (`signInAsAdmin`, `seedAdmin`, or equivalent — use whatever the existing tests use; do not invent new helpers.)

- [ ] **Step 2: Write the spec**

`e2e/admin-issues-trial.spec.ts`:

```ts
import { test, expect } from "@playwright/test";
import { signInAsAdmin } from "./helpers/auth";

test("admin issues a trial license and sees the key", async ({ page }) => {
  await signInAsAdmin(page);

  await page.goto("/admin/trials");
  await expect(page.getByRole("heading", { name: "Trials" })).toBeVisible();

  await page.getByRole("link", { name: "+ New trial" }).click();
  await expect(page.getByRole("heading", { name: "New trial" })).toBeVisible();

  // Random-but-deterministic-per-run identifiers so reruns don't collide
  // until the test DB is reset.
  const stamp = Date.now();
  const mt5 = 90000000 + (stamp % 9000000);
  const email = `trial-${stamp}@example.com`;

  await page.getByLabel("Product").selectOption({ index: 0 });
  await page.getByLabel("MT5 account").fill(String(mt5));
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Telegram handle (optional)").fill(`@t${stamp}`);

  await page.getByRole("button", { name: "Create trial" }).click();

  await expect(page.getByText(/Trial issued/)).toBeVisible();
  const keyText = await page.locator("pre").innerText();
  expect(keyText).toMatch(/^[A-Z]+-[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/);

  await page.getByRole("button", { name: "Back to trials" }).click();
  await expect(page.getByText(keyText.trim())).toBeVisible();
});
```

If the existing helper is named differently (e.g., `loginAsAdmin`, `seedAndSignInAdmin`), substitute that name. Do not change other tests.

- [ ] **Step 3: Run the test against a test Supabase project**

```bash
pnpm e2e e2e/admin-issues-trial.spec.ts
```

Expected: PASS. The trial appears in the list after the form submits.

- [ ] **Step 4: Commit**

```bash
git add e2e/admin-issues-trial.spec.ts
git commit -m "test(e2e): smoke admin issues trial flow"
```

---

## Final verification

- [ ] **Run the full unit test suite**

```bash
pnpm test
```

Expected: all tests pass. Trial-related new tests appear in the output.

- [ ] **Run typecheck**

```bash
pnpm tsc --noEmit
```

Expected: no errors.

- [ ] **Apply the SQL migration to staging Supabase**

From `~/Documents/development/EA/JSONFX-IMPULSE`:

```bash
# Copy the SQL into the EA repo's migrations dir with a timestamped name
cp /Users/jsonse/Documents/development/copytraderx-license/docs/superpowers/plans/2026-05-15-trial-tier-migration.sql \
   supabase/migrations/$(date +%Y%m%d%H%M%S)_create_trial_tier.sql

supabase db push
```

Expected: migration applies cleanly. `validate_license(text, bigint)` exists. `trial_leads` and `trial_licenses` exist with the dedupe indexes.

- [ ] **Run e2e against staging**

```bash
pnpm e2e
```

Expected: all e2e tests pass, including the new trial smoke.

---

## Follow-on work (NOT part of this plan)

The plan above intentionally stops at the admin surface. The remaining work to make trials actually validate on EAs:

- One small plan per EA binary (start with IMPX) in the EA repo: switch from
  direct `SELECT * FROM licenses WHERE license_key=$1 AND mt5_account=$2`
  to `rpc('validate_license', { p_license_key, p_mt5_account })` and from
  the corresponding update to `rpc('stamp_license_validated', ...)`.
- Until an EA is migrated, trial keys for that product cannot be validated
  on the user's MT5 — so do not issue trials for products whose EA has not
  been migrated.
