# Subscriptions Schema, Multi-Product Licenses, RLS, Backfill — Implementation Plan (Plan 2 of 5)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the `subscriptions` table, alter `licenses` to carry `product`/`subscription_id`/`user_id`, swap the single-EA `mt5_account` unique for `(mt5_account, product)`, install the subscription→license status-cascade trigger, write RLS policies, and backfill legacy licenses to `product='impulse'`. Make the existing license-key generator product-aware.

**Architecture:** Schema changes live in the EA repo migrations directory (`~/Documents/development/EA/JSONFX-IMPULSE/supabase/migrations/`), per existing convention. App-level code changes (license-key generator, schemas, types) live in this repo. **No UI work in this plan** — Plan 3 (admin users) and Plan 4 (user dashboard) consume what this plan exposes.

**Tech Stack:** Supabase Postgres + RLS, plus existing Zod schemas + Jest tests in this repo.

**Spec:** `docs/superpowers/specs/2026-05-06-admin-client-roles-design.md` — particularly §3.5 (products), §5.2–§5.6 (data model), §10 (migration plan).

**Branch:** `feat/admin-client-roles`. Already created in Plan 1; do **not** switch.

**Prerequisites:** Plan 1 must be complete (`users` table exists, seed admin works, login + middleware are deployed).

---

## Resuming this plan in a new session

Same protocol as Plan 1 (see `2026-05-06-roles-foundation.md`). To resume:

1. Confirm branch: `git branch --show-current` → `feat/admin-client-roles`.
2. Find the first unchecked `- [ ]` step in this file.
3. Verify the previous task's commit landed: `git log --oneline -10`.
4. Read the **Status** block below.
5. Each completed step flips its `- [ ]` to `- [x]` **in the same commit** as the code change. `git log -- docs/superpowers/plans/2026-05-06-roles-subscriptions-schema.md` shows the precise progression.
6. **Never** delete checked-off steps; append a **Correction** sub-section if a step needs to change after being checked.

---

## Status

> **Updated by the executor after each completed task. Single source of truth for "what's done."**

- **Last completed:** _(none yet — Plan 1 must be complete first)_
- **Last completed commit:** _(none yet)_
- **Next task to execute:** Task 1 (after Plan 1 closes out)
- **Plan version:** 1.0

---

## File Structure

| Path | Action | Responsibility |
|---|---|---|
| `~/Documents/development/EA/JSONFX-IMPULSE/supabase/migrations/20260506000002_create_subscriptions_table.sql` | Create | `subscriptions` table + indexes |
| `~/Documents/development/EA/JSONFX-IMPULSE/supabase/migrations/20260506000003_alter_licenses_add_user_subscription.sql` | Create | Add `subscription_id`, `user_id`, `product` to `licenses`; replace `mt5_account` unique with `(mt5_account, product)`; new indexes |
| `~/Documents/development/EA/JSONFX-IMPULSE/supabase/migrations/20260506000005_subscription_expiry_trigger.sql` | Create | Cascade `subscriptions.status` changes to child licenses |
| `~/Documents/development/EA/JSONFX-IMPULSE/supabase/migrations/20260506000006_rls_policies.sql` | Create | RLS for `users`, `subscriptions`, `licenses`, journal tables |
| `~/Documents/development/EA/JSONFX-IMPULSE/supabase/migrations/20260506000007_backfill_legacy_licenses.sql` | Create | Synthetic legacy admin user + legacy subscription; attach existing licenses; set NOT NULL |
| `lib/products.ts` | Create | Canonical product list, prefix table, type exports |
| `lib/products.test.ts` | Create | Unit tests for product helpers |
| `lib/license-key.ts` | Modify | `generateLicenseKey(product)` returns per-product prefix |
| `lib/license-key.test.ts` | Modify | Cover all 5 prefixes |
| `lib/schemas.ts` | Modify | New `LICENSE_KEY_PATTERNS` map; `licenseKeyForProduct(product)` regex; subscription schemas |
| `lib/schemas.test.ts` | Modify | Cover new schemas + product-aware patterns |
| `lib/types.ts` | Modify | Add `Product` type alias; add `product` field to `License`; add `Subscription` interface |
| `app/api/licenses/route.ts` | Modify | Accept `product` on POST; use product-aware key generation |
| `app/api/licenses/[id]/route.ts` | Modify | Allow updating `product`? **No** — product is immutable on a license; reject in PATCH |
| `app/admin/licenses/new/page.tsx` (already moved in Plan 1) | Modify | Add product dropdown (admin can manually pick) |
| `components/license-form.tsx` | Modify | Render product dropdown, validate per-product regex |
| `docs/superpowers/plans/2026-05-06-roles-subscriptions-schema.md` | Modify (each task) | Flip `- [ ]` → `- [x]` and update Status |

We are **not** touching: the `/dashboard` tree (Plan 4), the email module (Plan 3), Playwright (Plan 5), the request-license modal (Plan 4), or the pending-requests panel (Plan 5).

---

## Conventions

Same as Plan 1:
- Each step is its own commit unless explicitly grouped.
- Conventional-commit messages with `Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>` trailer.
- Plan-file checkbox flips happen in the same commit as the code change.
- Tests-first for pure logic (`lib/products.ts`, `lib/license-key.ts`, `lib/schemas.ts`).
- Manual verification (browser) for routes that render forms.

---

## Task 1: Canonical product module (TDD)

A pure-data module that holds the 5 product codes, their display names, and their license-key prefixes. Becomes the single source of truth used by every other piece (license-key generator, regex map, UI dropdowns).

**Files:**
- Create: `lib/products.ts`
- Create: `lib/products.test.ts`

- [ ] **Step 1.1: Write the failing test**

Create `lib/products.test.ts`:

```typescript
import {
  PRODUCTS,
  PRODUCT_CODES,
  productPrefix,
  productByPrefix,
  isProductCode,
  productDisplayName,
} from "./products";

describe("PRODUCTS list", () => {
  it("contains exactly the 5 supported products", () => {
    expect(PRODUCT_CODES).toEqual([
      "impulse",
      "ctx-core",
      "ctx-live",
      "ctx-prop-passer",
      "ctx-prop-funded",
    ]);
  });

  it("each product has a unique 4-character prefix", () => {
    const prefixes = PRODUCTS.map((p) => p.prefix);
    expect(new Set(prefixes).size).toBe(prefixes.length);
    for (const p of prefixes) {
      expect(p).toMatch(/^[A-Z]{4}$/);
    }
  });
});

describe("productPrefix", () => {
  it("returns IMPX for impulse", () => {
    expect(productPrefix("impulse")).toBe("IMPX");
  });
  it("returns CTXL for ctx-live", () => {
    expect(productPrefix("ctx-live")).toBe("CTXL");
  });
  it("returns CTXC for ctx-core", () => {
    expect(productPrefix("ctx-core")).toBe("CTXC");
  });
  it("returns CTXP for ctx-prop-passer", () => {
    expect(productPrefix("ctx-prop-passer")).toBe("CTXP");
  });
  it("returns CTXF for ctx-prop-funded", () => {
    expect(productPrefix("ctx-prop-funded")).toBe("CTXF");
  });
});

describe("productByPrefix", () => {
  it("returns impulse for IMPX", () => {
    expect(productByPrefix("IMPX")).toBe("impulse");
  });
  it("returns ctx-live for CTXL", () => {
    expect(productByPrefix("CTXL")).toBe("ctx-live");
  });
  it("returns null for unknown prefix", () => {
    expect(productByPrefix("ZZZZ")).toBeNull();
  });
});

describe("isProductCode", () => {
  it("accepts known codes", () => {
    expect(isProductCode("impulse")).toBe(true);
    expect(isProductCode("ctx-live")).toBe(true);
  });
  it("rejects unknowns", () => {
    expect(isProductCode("ctx-banana")).toBe(false);
    expect(isProductCode("")).toBe(false);
    expect(isProductCode(undefined as unknown as string)).toBe(false);
  });
});

describe("productDisplayName", () => {
  it("returns 'Impulse' for impulse", () => {
    expect(productDisplayName("impulse")).toBe("Impulse");
  });
  it("returns 'CTX Live' for ctx-live", () => {
    expect(productDisplayName("ctx-live")).toBe("CTX Live");
  });
});
```

- [ ] **Step 1.2: Run the test (expected to fail)**

```bash
pnpm test -- lib/products.test.ts
```

Expected: all tests fail with "Cannot find module './products'".

- [ ] **Step 1.3: Implement `lib/products.ts`**

Create `lib/products.ts`:

```typescript
export type Product =
  | "impulse"
  | "ctx-core"
  | "ctx-live"
  | "ctx-prop-passer"
  | "ctx-prop-funded";

export type ProductDef = {
  code: Product;
  displayName: string;
  prefix: string; // 4 uppercase letters
};

export const PRODUCTS: readonly ProductDef[] = [
  { code: "impulse",          displayName: "Impulse",          prefix: "IMPX" },
  { code: "ctx-core",         displayName: "CTX Core",         prefix: "CTXC" },
  { code: "ctx-live",         displayName: "CTX Live",         prefix: "CTXL" },
  { code: "ctx-prop-passer",  displayName: "CTX Prop Passer",  prefix: "CTXP" },
  { code: "ctx-prop-funded",  displayName: "CTX Prop Funded",  prefix: "CTXF" },
] as const;

export const PRODUCT_CODES: readonly Product[] = PRODUCTS.map((p) => p.code);

export function productPrefix(code: Product): string {
  const def = PRODUCTS.find((p) => p.code === code);
  if (!def) throw new Error(`Unknown product code: ${code}`);
  return def.prefix;
}

export function productByPrefix(prefix: string): Product | null {
  const def = PRODUCTS.find((p) => p.prefix === prefix);
  return def ? def.code : null;
}

export function isProductCode(value: unknown): value is Product {
  return typeof value === "string" && PRODUCT_CODES.includes(value as Product);
}

export function productDisplayName(code: Product): string {
  const def = PRODUCTS.find((p) => p.code === code);
  if (!def) throw new Error(`Unknown product code: ${code}`);
  return def.displayName;
}
```

- [ ] **Step 1.4: Run the test (expected to pass)**

```bash
pnpm test -- lib/products.test.ts
pnpm test
```

Expected: green.

- [ ] **Step 1.5: Commit + update plan**

```bash
git add lib/products.ts lib/products.test.ts docs/superpowers/plans/2026-05-06-roles-subscriptions-schema.md
# Flip Task 1 steps to [x] and update Status.
git commit -m "$(cat <<'EOF'
feat(products): canonical product list + prefix helpers (TDD)

Single source of truth for the 5 supported EAs (Impulse, CTX-Core, CTX-Live,
CTX-Prop-Passer, CTX-Prop-Funded) with their license-key prefixes. Used by
the license-key generator, validation regex map, and UI dropdowns.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Make license-key generator product-aware (TDD)

`lib/license-key.ts` currently hardcodes `IMPX-`. Update it to take a `product` argument.

**Files:**
- Modify: `lib/license-key.ts`
- Modify: `lib/license-key.test.ts`

- [ ] **Step 2.1: Update tests for product-aware API**

Read the existing `lib/license-key.test.ts` first to understand its current shape:

```bash
cat lib/license-key.test.ts
```

Replace the test file with this content (preserve any pre-existing imports if relevant):

```typescript
import { generateLicenseKey, LICENSE_KEY_ALPHABET } from "./license-key";
import { PRODUCTS } from "./products";

describe("generateLicenseKey", () => {
  for (const { code, prefix } of PRODUCTS) {
    it(`generates a key with the ${prefix} prefix for product ${code}`, () => {
      const key = generateLicenseKey(code);
      expect(key.startsWith(`${prefix}-`)).toBe(true);
    });
  }

  it("matches the IMPX-XXXX-XXXX-XXXX-XXXX shape for impulse", () => {
    const key = generateLicenseKey("impulse");
    expect(key).toMatch(/^IMPX-[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
  });

  it("matches the CTXL- shape for ctx-live", () => {
    const key = generateLicenseKey("ctx-live");
    expect(key).toMatch(/^CTXL-[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
  });

  it("uses only safe-alphabet characters in the body", () => {
    const key = generateLicenseKey("impulse");
    const body = key.slice(5).replace(/-/g, "");
    for (const ch of body) {
      expect(LICENSE_KEY_ALPHABET).toContain(ch);
    }
  });

  it("generates distinct keys on repeated calls (sanity check)", () => {
    const a = generateLicenseKey("impulse");
    const b = generateLicenseKey("impulse");
    expect(a).not.toBe(b);
  });
});
```

- [ ] **Step 2.2: Run the test (expected to fail — old API doesn't take a product)**

```bash
pnpm test -- lib/license-key.test.ts
```

Expected: failures along "Expected 0 arguments, but got 1" or runtime mismatches because `generateLicenseKey()` ignores the product and always returns `IMPX-...`.

- [ ] **Step 2.3: Update `lib/license-key.ts`**

Replace the file:

```typescript
import { type Product, productPrefix } from "./products";

/**
 * Safe alphabet for license keys: 31 uppercase alphanumerics excluding
 * ambiguous 0/O/1/I/L. 16 chars over this alphabet ≈ 79 bits of entropy.
 */
export const LICENSE_KEY_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

/** Generates a license key shaped <PREFIX>-XXXX-XXXX-XXXX-XXXX for the given product. */
export function generateLicenseKey(product: Product): string {
  const groups: string[] = [];
  for (let g = 0; g < 4; g++) {
    let group = "";
    for (let i = 0; i < 4; i++) {
      group += pickRandomChar();
    }
    groups.push(group);
  }
  return `${productPrefix(product)}-${groups.join("-")}`;
}

function pickRandomChar(): string {
  const idx = secureRandomIndex(LICENSE_KEY_ALPHABET.length);
  return LICENSE_KEY_ALPHABET[idx];
}

function secureRandomIndex(max: number): number {
  // Rejection sampling to avoid modulo bias.
  const range = 256 - (256 % max);
  const buf = new Uint8Array(1);
  // eslint-disable-next-line no-constant-condition
  while (true) {
    crypto.getRandomValues(buf);
    if (buf[0] < range) return buf[0] % max;
  }
}
```

- [ ] **Step 2.4: Find every existing caller and migrate**

```bash
grep -rn "generateLicenseKey" app components lib 2>&1 | grep -v node_modules
```

For each call site, the caller must now know the product. Most call sites are in:
- `components/license-form.tsx` (or similar — admin "create license" form)
- `app/api/licenses/route.ts` (POST handler)

Update each call to pass the relevant product. Where the caller doesn't have the product yet (because the UI hasn't been updated), pass `"impulse"` as a temporary default and add a `// TODO: Plan 2 Task 6` comment so we can find them in Task 6.

- [ ] **Step 2.5: Run the suite**

```bash
pnpm test
pnpm exec tsc --noEmit
```

Expected: green. If TypeScript fails, the failures should be in the call sites you migrated in Step 2.4.

- [ ] **Step 2.6: Commit + update plan**

```bash
git add lib/license-key.ts lib/license-key.test.ts app components docs/superpowers/plans/2026-05-06-roles-subscriptions-schema.md
# Flip Task 2 steps to [x] and update Status.
git commit -m "$(cat <<'EOF'
feat(license-key): make generator product-aware

generateLicenseKey() now takes a Product argument and returns the matching
4-char prefix from lib/products.ts. Callers updated; admin license-create
form and API route still default to 'impulse' until Task 6 wires the UI.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Schema migration — `subscriptions` table

**Files:**
- Create: `~/Documents/development/EA/JSONFX-IMPULSE/supabase/migrations/20260506000002_create_subscriptions_table.sql`

- [ ] **Step 3.1: Write the migration**

Create the file with exactly this content:

```sql
-- public.subscriptions: one row per paid bundle = entitles user to 1 live + 1 demo
-- license for a specific product. Pending rows are the request workflow.

create table public.subscriptions (
  id                bigserial primary key,
  user_id           uuid not null references public.users(id) on delete cascade,
  product           text not null check (product in (
                       'impulse', 'ctx-core', 'ctx-live',
                       'ctx-prop-passer', 'ctx-prop-funded'
                    )),
  tier              text not null check (tier in ('monthly', 'quarterly', 'yearly')),
  status            text not null check (status in ('pending', 'active', 'rejected', 'expired', 'revoked')),
  requested_at      timestamptz not null default now(),
  approved_at       timestamptz,
  approved_by       uuid references public.users(id),
  expires_at        timestamptz,
  rejection_reason  text,
  notes             text,
  created_at        timestamptz not null default now()
);

create index idx_subscriptions_user on public.subscriptions(user_id, status);
create index idx_subscriptions_pending on public.subscriptions(status) where status = 'pending';
create index idx_subscriptions_user_product on public.subscriptions(user_id, product, status);

alter table public.subscriptions enable row level security;
-- Policies are added in migration 20260506000006 (RLS policies).

comment on table public.subscriptions is
  'One paid bundle = entitles user to 1 live + 1 demo license for one product.';
```

- [ ] **Step 3.2: Apply (user runs)**

The agent does NOT run this. Stop and request the user to:

```bash
cd ~/Documents/development/EA/JSONFX-IMPULSE
supabase db push
```

Verify in Studio:
```sql
select column_name, data_type from information_schema.columns
 where table_schema = 'public' and table_name = 'subscriptions';
```
Expected: 12 rows.

- [ ] **Step 3.3: Commit (in EA repo) + update plan in this repo**

In EA repo:
```bash
cd ~/Documents/development/EA/JSONFX-IMPULSE
git add supabase/migrations/20260506000002_create_subscriptions_table.sql
git commit -m "$(cat <<'EOF'
feat(db): add public.subscriptions table

For copytraderx-license admin/client roles work. One row = one paid bundle
(1 live + 1 demo license) for a specific product. Pending rows are the
request workflow; RLS policies added in subsequent migration.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

In this repo:
```bash
cd /Users/jsonse/Documents/development/copytraderx-license
git add docs/superpowers/plans/2026-05-06-roles-subscriptions-schema.md
# Flip Task 3 steps to [x] and update Status.
git commit -m "$(cat <<'EOF'
docs(plan): mark Plan 2 Task 3 (subscriptions table) complete

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Schema migration — alter `licenses` for product + multi-EA uniqueness

**Files:**
- Create: `~/Documents/development/EA/JSONFX-IMPULSE/supabase/migrations/20260506000003_alter_licenses_add_user_subscription.sql`

- [ ] **Step 4.1: Write the migration**

```sql
-- Add subscription_id, user_id, product to licenses. All nullable during the
-- migration window; flipped to NOT NULL by the backfill migration (000007).

alter table public.licenses
  add column subscription_id bigint references public.subscriptions(id) on delete cascade,
  add column user_id         uuid   references public.users(id),
  add column product         text   check (product in (
                                'impulse', 'ctx-core', 'ctx-live',
                                'ctx-prop-passer', 'ctx-prop-funded'
                             ));

-- The original schema has a UNIQUE on mt5_account (one license per account).
-- Multi-product changes that to (mt5_account, product). Rows with NULL product
-- are exempt from the new unique until the backfill stamps them in 000007.
alter table public.licenses drop constraint if exists licenses_mt5_account_key;

create unique index idx_licenses_mt5_product on public.licenses (mt5_account, product)
  where product is not null;

-- Each subscription holds at most one live + one demo license.
create unique index idx_licenses_one_per_slot on public.licenses (subscription_id, intended_account_type)
  where subscription_id is not null;

create index idx_licenses_user on public.licenses(user_id);
create index idx_licenses_product on public.licenses(product);

comment on column public.licenses.product is
  'EA / product code. License-key prefix encodes this (IMPX, CTXC, CTXL, CTXP, CTXF).';
comment on column public.licenses.subscription_id is
  'Parent subscription. Source of truth for status; trigger cascades.';
comment on column public.licenses.user_id is
  'Owning user (denormalized from subscription for query speed and RLS).';
```

- [ ] **Step 4.2: Apply (user runs)**

```bash
cd ~/Documents/development/EA/JSONFX-IMPULSE
supabase db push
```

Verify:
```sql
select column_name, data_type, is_nullable from information_schema.columns
 where table_schema = 'public' and table_name = 'licenses'
   and column_name in ('subscription_id', 'user_id', 'product');
```
Expected: 3 rows, all `is_nullable = YES` (until backfill).

```sql
select indexname from pg_indexes where schemaname='public' and tablename='licenses';
```
Expected: includes `idx_licenses_mt5_product`, `idx_licenses_one_per_slot`, `idx_licenses_user`, `idx_licenses_product`.

- [ ] **Step 4.3: Commit (EA repo) + plan update (this repo)**

EA repo:
```bash
cd ~/Documents/development/EA/JSONFX-IMPULSE
git add supabase/migrations/20260506000003_alter_licenses_add_user_subscription.sql
git commit -m "$(cat <<'EOF'
feat(db): alter licenses for product + multi-EA support

Adds nullable subscription_id, user_id, product to licenses. Drops the old
single-column unique on mt5_account; replaces with (mt5_account, product)
so one MT5 account can hold one license per product. Indexes for user_id,
product, and per-slot uniqueness.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

This repo:
```bash
cd /Users/jsonse/Documents/development/copytraderx-license
git add docs/superpowers/plans/2026-05-06-roles-subscriptions-schema.md
# Flip Task 4 steps to [x] and update Status.
git commit -m "$(cat <<'EOF'
docs(plan): mark Plan 2 Task 4 (licenses alter for product) complete

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Schema migration — subscription→license status cascade trigger

**Files:**
- Create: `~/Documents/development/EA/JSONFX-IMPULSE/supabase/migrations/20260506000005_subscription_expiry_trigger.sql`

- [ ] **Step 5.1: Write the migration**

```sql
-- When a subscription's status flips to expired/revoked/rejected, cascade the
-- status to all child licenses. Active or pending statuses do NOT cascade
-- (those flow forward at license-creation time, not retroactively).

create or replace function public.handle_subscription_status_cascade()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status is distinct from old.status
     and new.status in ('expired', 'revoked', 'rejected') then
    update public.licenses
       set status = new.status
     where subscription_id = new.id
       and status <> new.status;
  end if;
  return new;
end;
$$;

drop trigger if exists on_subscription_status_change on public.subscriptions;
create trigger on_subscription_status_change
  after update of status on public.subscriptions
  for each row execute function public.handle_subscription_status_cascade();

comment on function public.handle_subscription_status_cascade is
  'Cascade subscription status (expired/revoked/rejected) to all child licenses.';
```

- [ ] **Step 5.2: Apply (user runs)**

```bash
cd ~/Documents/development/EA/JSONFX-IMPULSE
supabase db push
```

Verify trigger exists:
```sql
select trigger_name from information_schema.triggers
 where trigger_name = 'on_subscription_status_change';
```
Expected: 1 row.

Smoke test (only after Task 7 backfill, when there are real licenses):
```sql
-- Insert a fake subscription, attach a license, flip subscription to expired,
-- assert the license also went expired. Roll back.
begin;
  insert into public.subscriptions (user_id, product, tier, status, expires_at)
    values (
      (select id from public.users where role='admin' limit 1),
      'impulse', 'monthly', 'active',
      now() + interval '30 days'
    )
    returning id \gset
  insert into public.licenses (license_key, mt5_account, status, subscription_id, product, user_id, intended_account_type)
    values (
      'IMPX-AAAA-AAAA-AAAA-AAAA', 99999999, 'active', :id, 'impulse',
      (select id from public.users where role='admin' limit 1),
      'live'
    );
  update public.subscriptions set status='expired' where id=:id;
  select status from public.licenses where subscription_id=:id;  -- expect 'expired'
rollback;
```

- [ ] **Step 5.3: Commit + plan update**

EA repo:
```bash
cd ~/Documents/development/EA/JSONFX-IMPULSE
git add supabase/migrations/20260506000005_subscription_expiry_trigger.sql
git commit -m "$(cat <<'EOF'
feat(db): cascade subscription status to child licenses

Subscriptions are the source of truth for license status. When a subscription
flips to expired/revoked/rejected, all attached licenses get the same status.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

This repo:
```bash
cd /Users/jsonse/Documents/development/copytraderx-license
git add docs/superpowers/plans/2026-05-06-roles-subscriptions-schema.md
# Flip Task 5 steps to [x] and update Status.
git commit -m "$(cat <<'EOF'
docs(plan): mark Plan 2 Task 5 (status cascade trigger) complete

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Schema migration — RLS policies

**Files:**
- Create: `~/Documents/development/EA/JSONFX-IMPULSE/supabase/migrations/20260506000006_rls_policies.sql`

- [ ] **Step 6.1: Write the migration**

```sql
-- RLS policies for users, subscriptions, licenses, and journal tables.
-- The service role bypasses RLS, so the existing server-rendered admin
-- flows are unaffected. These policies protect any future direct-from-browser
-- queries (e.g. real-time subscriptions).

-- ── users ────────────────────────────────────────────────────────────────
create policy users_self_select on public.users
  for select to authenticated
  using (id = auth.uid());

create policy users_admin_all on public.users
  for all to authenticated
  using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
  with check ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

-- ── subscriptions ────────────────────────────────────────────────────────
create policy subscriptions_self_select on public.subscriptions
  for select to authenticated
  using (user_id = auth.uid());

create policy subscriptions_self_insert_pending on public.subscriptions
  for insert to authenticated
  with check (user_id = auth.uid() and status = 'pending');

create policy subscriptions_self_cancel_pending on public.subscriptions
  for delete to authenticated
  using (user_id = auth.uid() and status = 'pending');

create policy subscriptions_admin_all on public.subscriptions
  for all to authenticated
  using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
  with check ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

-- ── licenses ─────────────────────────────────────────────────────────────
create policy licenses_self_select on public.licenses
  for select to authenticated
  using (user_id = auth.uid());

create policy licenses_self_claim on public.licenses
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.subscriptions s
       where s.id = subscription_id
         and s.user_id = auth.uid()
         and s.status = 'active'
         and s.product = product
    )
  );

create policy licenses_admin_all on public.licenses
  for all to authenticated
  using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
  with check ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

-- ── journal tables: scope to MT5 accounts owned by the user ──────────────
-- positions
alter table public.positions enable row level security;
create policy positions_self_select on public.positions
  for select to authenticated
  using (mt5_account in (select mt5_account from public.licenses where user_id = auth.uid()));
create policy positions_admin_all on public.positions
  for all to authenticated
  using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
  with check ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

-- deals
alter table public.deals enable row level security;
create policy deals_self_select on public.deals
  for select to authenticated
  using (mt5_account in (select mt5_account from public.licenses where user_id = auth.uid()));
create policy deals_admin_all on public.deals
  for all to authenticated
  using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
  with check ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

-- orders
alter table public.orders enable row level security;
create policy orders_self_select on public.orders
  for select to authenticated
  using (mt5_account in (select mt5_account from public.licenses where user_id = auth.uid()));
create policy orders_admin_all on public.orders
  for all to authenticated
  using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
  with check ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

-- account_snapshots_current
alter table public.account_snapshots_current enable row level security;
create policy snapshots_current_self_select on public.account_snapshots_current
  for select to authenticated
  using (mt5_account in (select mt5_account from public.licenses where user_id = auth.uid()));
create policy snapshots_current_admin_all on public.account_snapshots_current
  for all to authenticated
  using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
  with check ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

-- account_snapshots_daily
alter table public.account_snapshots_daily enable row level security;
create policy snapshots_daily_self_select on public.account_snapshots_daily
  for select to authenticated
  using (mt5_account in (select mt5_account from public.licenses where user_id = auth.uid()));
create policy snapshots_daily_admin_all on public.account_snapshots_daily
  for all to authenticated
  using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
  with check ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
```

- [ ] **Step 6.2: Apply (user runs) and verify**

```bash
cd ~/Documents/development/EA/JSONFX-IMPULSE
supabase db push
```

Verify:
```sql
select schemaname, tablename, policyname from pg_policies
 where schemaname='public'
 order by tablename, policyname;
```
Expected: ~20 rows covering users, subscriptions, licenses, positions, deals, orders, snapshots.

```sql
-- Confirm service role still bypasses (existing app uses service role; must keep working).
set role service_role;
select count(*) from public.licenses;  -- should return the count, not zero.
reset role;
```

- [ ] **Step 6.3: Commit + plan update**

EA repo:
```bash
cd ~/Documents/development/EA/JSONFX-IMPULSE
git add supabase/migrations/20260506000006_rls_policies.sql
git commit -m "$(cat <<'EOF'
feat(db): RLS policies for users/subscriptions/licenses/journals

Authenticated users see only their own rows; admin role sees everything.
Service role continues to bypass RLS for server-rendered flows. Policies
read role from auth.jwt()->app_metadata->>role.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

This repo:
```bash
cd /Users/jsonse/Documents/development/copytraderx-license
git add docs/superpowers/plans/2026-05-06-roles-subscriptions-schema.md
# Flip Task 6 steps to [x] and update Status.
git commit -m "$(cat <<'EOF'
docs(plan): mark Plan 2 Task 6 (RLS policies) complete

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Schema migration — backfill legacy licenses

**Files:**
- Create: `~/Documents/development/EA/JSONFX-IMPULSE/supabase/migrations/20260506000007_backfill_legacy_licenses.sql`

- [ ] **Step 7.1: Write the migration**

This is destructive in the sense that it assigns existing license rows to a synthetic owner. Read the migration carefully before applying.

```sql
-- Backfill existing licenses to a synthetic legacy admin user + legacy
-- subscription, all stamped product='impulse' (the implicit pre-multi-product
-- behavior). After backfill, set product/user_id/subscription_id NOT NULL.

do $$
declare
  legacy_admin_id uuid;
  legacy_sub_id   bigint;
  unowned_count   bigint;
begin
  select count(*) into unowned_count
    from public.licenses
   where subscription_id is null;

  if unowned_count = 0 then
    raise notice 'No legacy licenses to backfill.';
    return;
  end if;

  -- Find or create the legacy synthetic admin (NOT a real auth user; we just
  -- need a valid uuid + public.users row to satisfy FK).
  -- We use a stable sentinel email so re-runs are idempotent.
  select id into legacy_admin_id
    from public.users
   where email = 'legacy@copytraderx.local';

  if legacy_admin_id is null then
    -- We need a corresponding auth.users row for the FK. Create one with
    -- a randomly-generated UUID and an unusable password.
    legacy_admin_id := gen_random_uuid();

    insert into auth.users (id, email, encrypted_password, email_confirmed_at, raw_user_meta_data, raw_app_meta_data)
      values (
        legacy_admin_id,
        'legacy@copytraderx.local',
        crypt('!!disabled!!', gen_salt('bf')),
        now(),
        '{"role": "admin", "full_name": "Legacy"}'::jsonb,
        '{"role": "admin", "must_change_password": false}'::jsonb
      );
    -- The on_auth_user_created trigger from migration 20260506000001 will have
    -- mirrored a row into public.users. Confirm it.
    if not exists (select 1 from public.users where id = legacy_admin_id) then
      insert into public.users (id, email, role, full_name, must_change_password)
        values (legacy_admin_id, 'legacy@copytraderx.local', 'admin', 'Legacy', false);
    end if;
  end if;

  -- Find or create the legacy subscription.
  select id into legacy_sub_id
    from public.subscriptions
   where user_id = legacy_admin_id
     and product = 'impulse'
     and notes = 'legacy backfill — pre-roles synthetic subscription';

  if legacy_sub_id is null then
    insert into public.subscriptions (user_id, product, tier, status, approved_at, expires_at, notes)
      values (
        legacy_admin_id, 'impulse', 'yearly', 'active',
        now(), now() + interval '100 years',
        'legacy backfill — pre-roles synthetic subscription'
      )
      returning id into legacy_sub_id;
  end if;

  -- Stamp legacy licenses.
  update public.licenses
     set subscription_id = legacy_sub_id,
         user_id         = legacy_admin_id,
         product         = 'impulse'
   where subscription_id is null;

  raise notice 'Backfilled % legacy licenses into subscription %', unowned_count, legacy_sub_id;
end;
$$;

-- After the backfill, every row should have non-null product/user_id/subscription_id.
-- Tighten the constraints.
alter table public.licenses
  alter column product         set not null,
  alter column user_id         set not null,
  alter column subscription_id set not null;
```

- [ ] **Step 7.2: Apply (user runs)**

```bash
cd ~/Documents/development/EA/JSONFX-IMPULSE
supabase db push
```

Watch the output for the `RAISE NOTICE` line indicating how many rows were backfilled. Then verify:

```sql
select count(*) from public.licenses where subscription_id is null;  -- expect 0
select count(*) from public.licenses where product is null;          -- expect 0
select count(*) from public.licenses where user_id is null;          -- expect 0
select count(*) from public.licenses where product='impulse';        -- expect = original license count
```

- [ ] **Step 7.3: Commit + plan update**

EA repo:
```bash
cd ~/Documents/development/EA/JSONFX-IMPULSE
git add supabase/migrations/20260506000007_backfill_legacy_licenses.sql
git commit -m "$(cat <<'EOF'
feat(db): backfill legacy licenses to synthetic admin + impulse product

Idempotent. Creates 'legacy@copytraderx.local' synthetic admin + a 100-year
'impulse' subscription, attaches all pre-multi-product licenses to it, then
sets product/user_id/subscription_id NOT NULL.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

This repo:
```bash
cd /Users/jsonse/Documents/development/copytraderx-license
git add docs/superpowers/plans/2026-05-06-roles-subscriptions-schema.md
# Flip Task 7 steps to [x] and update Status.
git commit -m "$(cat <<'EOF'
docs(plan): mark Plan 2 Task 7 (legacy backfill) complete

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: Update app types and schemas (TDD where applicable)

**Files:**
- Modify: `lib/types.ts` — add `Product` to `License`, add `Subscription` interface
- Modify: `lib/schemas.ts` — add product to `createLicenseSchema`, add subscription schemas, replace `LICENSE_KEY_PATTERN` with per-product `LICENSE_KEY_PATTERNS`
- Modify: `lib/schemas.test.ts`

- [ ] **Step 8.1: Add `Product` to `lib/types.ts` and extend `License`**

Read `lib/types.ts` and:
- Replace the inline `EaSource` union with `import { type Product } from "./products"; export type EaSource = Product;` (they're the same set; consolidate). Verify no consumer of `EaSource` breaks by running `pnpm exec tsc --noEmit` after the change.
- Add `product: Product;` to the `License` interface (same position as you'd expect, after `account_type`).
- Add a new `Subscription` interface:

```typescript
import type { Product } from "./products";

export type SubscriptionStatus =
  | "pending"
  | "active"
  | "rejected"
  | "expired"
  | "revoked";

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
}
```

- [ ] **Step 8.2: Update `lib/schemas.ts`**

Read it first. Replace `LICENSE_KEY_PATTERN` with:

```typescript
import { PRODUCTS, type Product } from "./products";

const SAFE_BODY = "[A-Z2-9]{4}";
export const LICENSE_KEY_PATTERNS: Record<Product, RegExp> = Object.fromEntries(
  PRODUCTS.map((p) => [
    p.code,
    new RegExp(`^${p.prefix}-${SAFE_BODY}-${SAFE_BODY}-${SAFE_BODY}-${SAFE_BODY}$`),
  ]),
) as Record<Product, RegExp>;

/** Returns true if `key` matches the product's prefix + body shape. */
export function isValidLicenseKey(key: string, product: Product): boolean {
  return LICENSE_KEY_PATTERNS[product].test(key);
}
```

Update `createLicenseSchema` to require `product`:

```typescript
export const createLicenseSchema = z
  .object({
    license_key: z.string(),
    mt5_account: z.number().int().positive(),
    product: z.enum(PRODUCT_CODES as [Product, ...Product[]]),
    tier: tierEnum,
    intended_account_type: accountTypeEnum,
    customer_email: optionalEmail,
    notes: optionalNonEmpty,
    push_interval_seconds: z.number().int().min(3).max(60).default(10),
    propfirm_rule_id: z.number().int().positive().nullable().default(null),
  })
  .strict()
  .refine(
    (v) => isValidLicenseKey(v.license_key, v.product),
    {
      message: "license_key prefix must match product",
      path: ["license_key"],
    },
  );
```

Same shape for `updateLicenseSchema` — `product` is optional (and updates of `product` should be REJECTED at the API level, but the Zod schema permits it for read-only display purposes; the route handler enforces immutability).

Add new subscription schemas:

```typescript
export const createSubscriptionRequestSchema = z
  .object({
    product: z.enum(PRODUCT_CODES as [Product, ...Product[]]),
    tier: tierEnum,
    notes: optionalNonEmpty,
  })
  .strict();

export const renewSubscriptionRequestSchema = z
  .object({
    source_subscription_id: z.number().int().positive(),
    tier: tierEnum,
    notes: optionalNonEmpty,
  })
  .strict();
// product is intentionally absent — server fetches it from source_subscription_id.

export const approveSubscriptionSchema = z
  .object({
    action: z.literal("approve"),
  })
  .strict();

export const rejectSubscriptionSchema = z
  .object({
    action: z.literal("reject"),
    rejection_reason: z.string().min(1).max(1000),
  })
  .strict();

export type CreateSubscriptionRequestInput = z.infer<typeof createSubscriptionRequestSchema>;
export type RenewSubscriptionRequestInput = z.infer<typeof renewSubscriptionRequestSchema>;
export type ApproveSubscriptionInput = z.infer<typeof approveSubscriptionSchema>;
export type RejectSubscriptionInput = z.infer<typeof rejectSubscriptionSchema>;
```

- [ ] **Step 8.3: Update `lib/schemas.test.ts`**

Add coverage for:
- `createLicenseSchema` rejects `license_key='IMPX-...'` when `product='ctx-live'`.
- `createLicenseSchema` accepts `license_key='CTXL-AAAA-...'` when `product='ctx-live'`.
- `createSubscriptionRequestSchema` accepts each of the 5 products.
- `createSubscriptionRequestSchema` rejects unknown product.
- `rejectSubscriptionSchema` requires non-empty `rejection_reason`.

(Add at least one positive + one negative test per new schema.)

- [ ] **Step 8.4: Run the suite**

```bash
pnpm test
pnpm exec tsc --noEmit
```

Expected: green. Existing schema tests must still pass (they use `IMPX-` keys with `intended_account_type` — they'll need a `product: "impulse"` field added; update the test fixtures).

- [ ] **Step 8.5: Commit + update plan**

```bash
git add lib/types.ts lib/schemas.ts lib/schemas.test.ts docs/superpowers/plans/2026-05-06-roles-subscriptions-schema.md
# Flip Task 8 steps to [x] and update Status.
git commit -m "$(cat <<'EOF'
feat(schemas): product-aware license + subscription schemas

createLicenseSchema now requires product and validates license_key prefix
against it. New schemas for subscription request/renew/approve/reject.
LICENSE_KEY_PATTERN replaced with a per-product map.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: Plug `product` into the admin license form + API

The admin "create license" path is the only writer that exists today. Plan 4 will add the user "claim slot" path and Plan 4/5 will add the request flow. For Plan 2, we just need the existing admin form to not break and to send `product`.

**Files:**
- Modify: `components/license-form.tsx`
- Modify: `app/api/licenses/route.ts`

- [ ] **Step 9.1: Add product dropdown to `components/license-form.tsx`**

Read the component first. Add a `Product` field as a select using the `PRODUCTS` array from `lib/products.ts`. Default to `"impulse"` for backwards compatibility on edits of legacy licenses (which have `product='impulse'` after the backfill).

When the user changes the product, regenerate the license key with `generateLicenseKey(product)` so the prefix matches.

- [ ] **Step 9.2: Update `app/api/licenses/route.ts` (POST handler)**

The POST body must include `product`. Validate via the updated `createLicenseSchema`. The auto-key regeneration helper should call `generateLicenseKey(body.product)`.

Update PATCH handler in `app/api/licenses/[id]/route.ts` to **reject** `product` changes — return 400 with `"product is immutable on a license"`.

- [ ] **Step 9.3: Manual verification**

```bash
pnpm dev
```

Sign in as admin. Open `/admin/licenses/new`. Verify:
- Product dropdown is present, defaults to Impulse.
- Switching product changes the auto-generated key prefix.
- Submitting creates a license with the correct `product` set.
- Editing an existing license: product field is shown but editing it errors.

Verify in Studio:
```sql
select license_key, product from public.licenses order by created_at desc limit 5;
```

Stop the dev server.

- [ ] **Step 9.4: Commit + plan update**

```bash
git add components/license-form.tsx app/api/licenses docs/superpowers/plans/2026-05-06-roles-subscriptions-schema.md
# Flip Task 9 steps to [x] and update Status.
git commit -m "$(cat <<'EOF'
feat(licenses): admin form + API support product field

License form has a product dropdown; key auto-regenerates with the matching
prefix. API enforces product-aware key validation and rejects product
changes on update.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 10: Smoke verification + plan close-out

- [ ] **Step 10.1: Full schema sanity check**

In Studio:
```sql
-- All licenses have a product, user, subscription
select count(*) filter (where product is null)         as no_product,
       count(*) filter (where user_id is null)         as no_user,
       count(*) filter (where subscription_id is null) as no_sub,
       count(*) as total
  from public.licenses;
```
Expected: `no_product=0, no_user=0, no_sub=0`.

```sql
-- The legacy admin user + subscription exists
select id, email, role from public.users where email='legacy@copytraderx.local';
select id, product, status from public.subscriptions
 where notes = 'legacy backfill — pre-roles synthetic subscription';
```
Expected: 1 row each.

```sql
-- RLS policies are present
select count(*) from pg_policies where schemaname='public';
```
Expected: 20+ rows.

- [ ] **Step 10.2: App-level sanity**

```bash
pnpm test
pnpm exec tsc --noEmit
pnpm dev
```

Sign in, create a license with each of the 5 products. Verify keys generated with the correct prefix. Stop dev server.

- [ ] **Step 10.3: Close-out**

Update Status block:
- Last completed: Task 10
- Plan complete: ✅
- Next plan: `2026-05-06-roles-admin-users.md` (Plan 3 — write when ready)

```bash
git add docs/superpowers/plans/2026-05-06-roles-subscriptions-schema.md
git commit -m "$(cat <<'EOF'
docs(plan): close out Plan 2 — subscriptions schema + multi-product

Schema is now multi-product capable. Subscriptions table, status cascade,
and RLS deployed. Legacy licenses backfilled to product='impulse'. Admin
license form supports product selection. Ready for Plan 3 (admin users
+ email module).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Plan complete

When all tasks are checked, update **Status**:

- **Last completed:** Plan 2 of 5
- **Plan complete:** ✅
- **Next plan:** `docs/superpowers/plans/2026-05-06-roles-admin-users.md` (write when ready)

**Branch state at end of plan:** `feat/admin-client-roles`. Do **not** merge to `main` until all 5 plans are complete.
