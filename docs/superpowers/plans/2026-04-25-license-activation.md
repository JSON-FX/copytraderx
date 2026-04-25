# License Activation & Liveness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Defer the subscription clock until the EA's first successful validation, surface license liveness (Online/Stale/Offline/Not activated) in the admin UI, and remove the dead `lifetime` tier.

**Architecture:** Add `activated_at` column to `licenses`. The Supabase edge function stamps `activated_at` and computes `expires_at` on first validation. The admin UI gains a pure liveness derivation (`lib/liveness.ts`), a redesigned `Status` column on the list page, and an "Activate now" override on the detail page. Renew also stamps `activated_at` if null. The `lifetime` tier is removed in the same change since we're already in tier/expiry code.

**Tech Stack:** Next.js 16 (App Router), TypeScript, React 19, Tailwind v4, shadcn/ui, react-hook-form + zod, `@supabase/supabase-js`, Jest, Deno (edge function), Postgres (migration). EA-side: MQL5.

**Spec:** [docs/superpowers/specs/2026-04-25-license-activation-design.md](../specs/2026-04-25-license-activation-design.md)

**Repos touched:**
- `~/Documents/development/copytraderx-license` (admin UI — primary)
- `~/Documents/development/EA/JSONFX-IMPULSE` (migration + edge function + EA)

---

## File Structure

### `copytraderx-license` (this repo)

| File | Action | Responsibility |
|---|---|---|
| `lib/types.ts` | Modify | Drop `"lifetime"` from `LicenseTier`. Add `activated_at: string \| null` to `License`. Add `LivenessState` union. |
| `lib/expiry.ts` | Modify | Drop `lifetime` case. Tighten `calculateExpiresAt` return to `Date`. Drop `formatExpiry` null branch (it returns "Lifetime"). |
| `lib/expiry.test.ts` | Modify | Drop lifetime cases. |
| `lib/schemas.ts` | Modify | Drop `lifetime` from `tierEnum`. The existing `renewableTierEnum` already excludes it. |
| `lib/schemas.test.ts` | Modify | Update lifetime-rejection test for `renewActionSchema` (still valid) and `createLicenseSchema` (now also rejects). |
| `lib/liveness.ts` | Create | `deriveLiveness(license, now)` pure function + thresholds + types. |
| `lib/liveness.test.ts` | Create | Boundary tests for liveness states. |
| `components/tier-badge.tsx` | Modify | Drop `lifetime` label. |
| `components/license-form.tsx` | Modify | Drop `lifetime` from form schema, Select, and `previewExpiry`. Update preview to "Expiry will be set on first activation" for create mode. |
| `components/liveness-badge.tsx` | Create | Renders `LivenessState` with color + label. |
| `components/license-table.tsx` | Modify | Replace single Status column with combined Liveness column (badge + relative time). Add liveness filter values. Drop separate Last Validated column. |
| `app/api/licenses/route.ts` | Modify | POST: stop computing `expires_at`. Insert with `expires_at: null`. |
| `app/api/licenses/[id]/route.ts` | Modify | PATCH renew: stamp `activated_at = now()` if null. |
| `app/api/licenses/[id]/activate/route.ts` | Create | POST endpoint that sets `activated_at = now()` and `expires_at = now() + tierDuration(tier)`. |
| `app/licenses/[id]/page.tsx` | Modify | Replace pastExpiry-only Alert with combined activation callout + past-expiry alert. Add `activated_at` to metadata. Render liveness badge in header. |
| `components/activate-now-button.tsx` | Create | Client component with confirm dialog + fetch to activate endpoint. |
| `README.md` | Modify | Drop "Lifetime" from tier list. |

### `JSONFX-IMPULSE` (EA repo)

| File | Action | Responsibility |
|---|---|---|
| `supabase/migrations/20260426000002_add_activated_at.sql` | Create | Add column + index + lifetime-row safety check. |
| `supabase/functions/validate-license/index.ts` | Modify | Stamp `activated_at` and `expires_at` on first validation. Return new `not_configured` reason for null-tier rows. |
| `supabase/functions/validate-license/types.ts` | Modify | Add `"not_configured"` to `ValidateLicenseFailure["reason"]`. |
| `supabase/functions/validate-license/expiry.ts` | Create | `addTierDuration(activatedAtISO, tier)` helper. |
| `supabase/functions/validate-license/test.ts` | Modify | Add `addTierDuration` test cases. |
| `Include/CopyTraderX-Impulse/LicenseManager.mqh` | Modify | Add `not_configured` reason branch with user-friendly message. |

---

## Tasks

### Task 1: Schema migration in EA repo

**Files:**
- Create: `~/Documents/development/EA/JSONFX-IMPULSE/supabase/migrations/20260426000002_add_activated_at.sql`

- [ ] **Step 1: Write the migration**

```sql
-- Add activated_at column for deferred subscription clock.
-- Spec: copytraderx-license/docs/superpowers/specs/2026-04-25-license-activation-design.md

-- Safety: fail loudly if there are existing 'lifetime' rows. We're removing
-- the lifetime tier in this change; surviving lifetime rows must be
-- reconciled by hand before this migration runs.
do $$
declare
  lifetime_count int;
begin
  select count(*) into lifetime_count
    from public.licenses where tier = 'lifetime';
  if lifetime_count > 0 then
    raise exception
      'Refusing to migrate: % licenses still have tier=lifetime. Reconcile manually first.',
      lifetime_count;
  end if;
end $$;

alter table public.licenses
  add column activated_at timestamptz;

create index idx_licenses_activated
  on public.licenses (activated_at);

comment on column public.licenses.activated_at is
  'First successful EA validation timestamp. NULL = never activated. Set by validate-license edge function or admin "Activate now" action.';
```

- [ ] **Step 2: Verify migration file shape**

Run: `ls ~/Documents/development/EA/JSONFX-IMPULSE/supabase/migrations/`
Expected: file appears alongside `20260425000001_create_licenses_table.sql` and `20260426000001_add_tier_column.sql`.

- [ ] **Step 3: Commit (in EA repo)**

```bash
cd ~/Documents/development/EA/JSONFX-IMPULSE
git add supabase/migrations/20260426000002_add_activated_at.sql
git commit -m "feat(db): add activated_at column to licenses"
```

NOTE: do not run `supabase db push` yet — we apply the migration after the edge function and admin UI are ready (Task 18). Order matters because creating a license while old code is live will write `expires_at` non-null, then the new code will skip activation stamping for that row. Doing migration → edge function → admin UI in close succession is fine.

---

### Task 2: tierDuration helper for edge function

**Files:**
- Create: `~/Documents/development/EA/JSONFX-IMPULSE/supabase/functions/validate-license/expiry.ts`

- [ ] **Step 1: Write the failing test**

Append to `~/Documents/development/EA/JSONFX-IMPULSE/supabase/functions/validate-license/test.ts`:

```ts
import { addTierDuration } from "./expiry.ts";

Deno.test("addTierDuration — monthly adds 1 month", () => {
  const from = "2026-04-25T10:00:00.000Z";
  assertEquals(addTierDuration(from, "monthly"), "2026-05-25T10:00:00.000Z");
});

Deno.test("addTierDuration — quarterly adds 3 months", () => {
  const from = "2026-04-25T10:00:00.000Z";
  assertEquals(addTierDuration(from, "quarterly"), "2026-07-25T10:00:00.000Z");
});

Deno.test("addTierDuration — yearly adds 1 year", () => {
  const from = "2026-04-25T10:00:00.000Z";
  assertEquals(addTierDuration(from, "yearly"), "2027-04-25T10:00:00.000Z");
});

Deno.test("addTierDuration — Jan 31 monthly clamps to Feb 28", () => {
  const from = "2026-01-31T00:00:00.000Z";
  assertEquals(addTierDuration(from, "monthly"), "2026-02-28T00:00:00.000Z");
});

Deno.test("addTierDuration — unknown tier throws", () => {
  let threw = false;
  try { addTierDuration("2026-04-25T00:00:00.000Z", "weekly" as never); }
  catch { threw = true; }
  assertEquals(threw, true);
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd ~/Documents/development/EA/JSONFX-IMPULSE/supabase/functions/validate-license
deno test --allow-net test.ts
```

Expected: failure — `Cannot find module './expiry.ts'`.

- [ ] **Step 3: Implement `expiry.ts`**

```ts
export type Tier = "monthly" | "quarterly" | "yearly";

// Mirrors lib/expiry.ts in the admin repo (date-fns addMonths/addYears
// semantics — UTC-stable, end-of-month clamps to the shorter month).
// Duplicated rather than shared because Deno + Node packaging is not
// worth it for a 30-line helper.
export function addTierDuration(activatedAtISO: string, tier: Tier): string {
  const d = new Date(activatedAtISO);
  if (Number.isNaN(d.getTime())) {
    throw new Error(`Invalid ISO date: ${activatedAtISO}`);
  }

  switch (tier) {
    case "monthly":   return addMonthsUTC(d, 1).toISOString();
    case "quarterly": return addMonthsUTC(d, 3).toISOString();
    case "yearly":    return addMonthsUTC(d, 12).toISOString();
    default:
      throw new Error(`Unknown tier: ${tier}`);
  }
}

function addMonthsUTC(d: Date, months: number): Date {
  const year = d.getUTCFullYear();
  const month = d.getUTCMonth() + months;
  const day = d.getUTCDate();
  const hours = d.getUTCHours();
  const minutes = d.getUTCMinutes();
  const seconds = d.getUTCSeconds();
  const ms = d.getUTCMilliseconds();

  // Compute target year/month
  const targetYear = year + Math.floor(month / 12);
  const targetMonth = ((month % 12) + 12) % 12;

  // Clamp day to last day of target month (Jan 31 + 1mo → Feb 28/29)
  const lastDay = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
  const targetDay = Math.min(day, lastDay);

  return new Date(Date.UTC(targetYear, targetMonth, targetDay, hours, minutes, seconds, ms));
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd ~/Documents/development/EA/JSONFX-IMPULSE/supabase/functions/validate-license
deno test --allow-net test.ts
```

Expected: all `addTierDuration` cases pass; existing tests still pass.

- [ ] **Step 5: Commit (EA repo)**

```bash
cd ~/Documents/development/EA/JSONFX-IMPULSE
git add supabase/functions/validate-license/expiry.ts supabase/functions/validate-license/test.ts
git commit -m "feat(edge): add addTierDuration helper"
```

---

### Task 3: Add `not_configured` reason to types

**Files:**
- Modify: `~/Documents/development/EA/JSONFX-IMPULSE/supabase/functions/validate-license/types.ts:14-17`

- [ ] **Step 1: Edit the failure type**

Replace the `ValidateLicenseFailure` interface with:

```ts
export interface ValidateLicenseFailure {
  valid: false;
  reason: "not_found" | "revoked" | "expired" | "not_configured";
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd ~/Documents/development/EA/JSONFX-IMPULSE/supabase/functions/validate-license
deno check index.ts
```

Expected: no errors.

- [ ] **Step 3: Commit (EA repo)**

```bash
cd ~/Documents/development/EA/JSONFX-IMPULSE
git add supabase/functions/validate-license/types.ts
git commit -m "feat(edge): add not_configured reason to validate-license response"
```

---

### Task 4: Edge function — stamp activated_at on first validation

**Files:**
- Modify: `~/Documents/development/EA/JSONFX-IMPULSE/supabase/functions/validate-license/index.ts`

- [ ] **Step 1: Replace the body of the request handler**

Replace the entire `Deno.serve` body (from `const { data, error } = await sb` through the end of the function) with:

```ts
  const { data, error } = await sb
    .from("licenses")
    .select("license_key, mt5_account, status, expires_at, activated_at, tier")
    .eq("license_key", license_key)
    .eq("mt5_account", mt5_account)
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("DB lookup failed:", error);
    return jsonResponse(500, { error: "lookup_failed" });
  }

  if (!data) return jsonResponse(200, fail("not_found"));
  if (data.status === "revoked") return jsonResponse(200, fail("revoked"));
  if (data.status === "expired") return jsonResponse(200, fail("expired"));

  // First-activation stamp: only when activated_at is still null.
  // Requires tier — null tier is a misconfigured row.
  let activatedAt: string | null = data.activated_at;
  let expiresAt: string | null = data.expires_at;

  if (activatedAt === null) {
    if (data.tier === null) {
      return jsonResponse(200, fail("not_configured"));
    }
    if (data.tier !== "monthly" && data.tier !== "quarterly" && data.tier !== "yearly") {
      console.error("Unknown tier on row:", data.tier);
      return jsonResponse(200, fail("not_configured"));
    }
    activatedAt = new Date().toISOString();
    expiresAt = addTierDuration(activatedAt, data.tier);
  }

  // Recheck expiry after potential stamping (covers the corner case where
  // an admin manually set expires_at in the past and tier is null).
  if (expiresAt !== null && new Date(expiresAt) <= new Date()) {
    return jsonResponse(200, fail("expired"));
  }

  // Persist last_validated_at + broker_name, plus activated_at + expires_at
  // when newly stamped. Failure is non-fatal for last_validated_at, but
  // first-activation must succeed so the EA cache and DB stay consistent.
  const updatePayload: Record<string, unknown> = {
    last_validated_at: new Date().toISOString(),
    broker_name: broker_name ?? null,
  };
  const isFirstActivation = data.activated_at === null;
  if (isFirstActivation) {
    updatePayload.activated_at = activatedAt;
    updatePayload.expires_at = expiresAt;
  }

  const { error: updErr } = await sb
    .from("licenses")
    .update(updatePayload)
    .eq("license_key", license_key)
    .eq("mt5_account", mt5_account);
  if (updErr) {
    if (isFirstActivation) {
      console.error("first-activation update failed:", updErr);
      return jsonResponse(500, { error: "activation_persist_failed" });
    }
    console.warn("update last_validated_at failed:", updErr);
  }

  // Build canonical payload. Property order is fixed and matches the EA's
  // parser. Whitespace must be exact — JSON.stringify with no spaces.
  const issuedAt = new Date();
  const validUntil = new Date(issuedAt.getTime() + TOKEN_VALIDITY_MS);
  const payloadObj = {
    mt5_account: data.mt5_account,
    expires_at: expiresAt,                  // ISO string (always set after activation)
    issued_at: issuedAt.toISOString(),
    valid_until: validUntil.toISOString(),
  };
  const payload = JSON.stringify(payloadObj);
  const signature = await hmacSha256Base64(HMAC_SECRET, payload);

  const success: ValidateLicenseSuccess = { valid: true, payload, signature };
  return jsonResponse(200, success);
});
```

- [ ] **Step 2: Add the import for `addTierDuration` at the top of the file**

Add directly after the existing `import { hmacSha256Base64 }` line:

```ts
import { addTierDuration } from "./expiry.ts";
```

- [ ] **Step 3: Type-check**

```bash
cd ~/Documents/development/EA/JSONFX-IMPULSE/supabase/functions/validate-license
deno check index.ts
```

Expected: no errors.

- [ ] **Step 4: Run existing tests**

```bash
deno test --allow-net test.ts
```

Expected: all green.

- [ ] **Step 5: Commit (EA repo)**

```bash
cd ~/Documents/development/EA/JSONFX-IMPULSE
git add supabase/functions/validate-license/index.ts
git commit -m "feat(edge): stamp activated_at and expires_at on first validation"
```

---

### Task 5: EA — handle `not_configured` reason

**Files:**
- Modify: `~/Documents/development/EA/JSONFX-IMPULSE/Include/CopyTraderX-Impulse/LicenseManager.mqh:391-401`

- [ ] **Step 1: Edit the reason-branching block in `FetchAndStoreToken`**

Find the block:

```cpp
   if(StringFind(resp, "\"valid\":false") >= 0)
   {
      if(StringFind(resp, "\"reason\":\"not_found\"") >= 0)
         SetState(LICENSE_NOT_FOUND, "License key not found. Check the key matches the email you received.");
      else if(StringFind(resp, "\"reason\":\"revoked\"") >= 0)
         SetState(LICENSE_REVOKED, "License revoked. Contact support.");
      else if(StringFind(resp, "\"reason\":\"expired\"") >= 0)
         SetState(LICENSE_EXPIRED, "License expired. Renew to continue.");
      else
         SetState(LICENSE_NOT_FOUND, "License invalid (unknown reason).");
      return false;
   }
```

Replace with:

```cpp
   if(StringFind(resp, "\"valid\":false") >= 0)
   {
      if(StringFind(resp, "\"reason\":\"not_found\"") >= 0)
         SetState(LICENSE_NOT_FOUND, "License key not found. Check the key matches the email you received.");
      else if(StringFind(resp, "\"reason\":\"revoked\"") >= 0)
         SetState(LICENSE_REVOKED, "License revoked. Contact support.");
      else if(StringFind(resp, "\"reason\":\"expired\"") >= 0)
         SetState(LICENSE_EXPIRED, "License expired. Renew to continue.");
      else if(StringFind(resp, "\"reason\":\"not_configured\"") >= 0)
         SetState(LICENSE_NOT_FOUND, "License missing tier configuration. Contact support.");
      else
         SetState(LICENSE_NOT_FOUND, "License invalid (unknown reason).");
      return false;
   }
```

NOTE: we reuse `LICENSE_NOT_FOUND` rather than inventing a new state because the existing state enum/string-table is in `Defines.mqh` and changing it expands scope. The user-facing message is what the customer sees; the state is internal.

- [ ] **Step 2: Compile-check (optional — requires MetaEditor)**

The MQL5 compiler isn't part of CI. If MetaEditor is available, open the EA project and verify it builds. Otherwise skip — this is a single-line addition, low risk.

- [ ] **Step 3: Commit (EA repo)**

```bash
cd ~/Documents/development/EA/JSONFX-IMPULSE
git add Include/CopyTraderX-Impulse/LicenseManager.mqh
git commit -m "feat(ea): handle not_configured license reason"
```

---

### Task 6: Update `License` and `LicenseTier` types in admin repo

**Files:**
- Modify: `lib/types.ts`

- [ ] **Step 1: Replace the file contents**

```ts
export type LicenseStatus = "active" | "revoked" | "expired";
export type LicenseTier = "monthly" | "quarterly" | "yearly";

export interface License {
  id: number;
  license_key: string;
  mt5_account: number;
  status: LicenseStatus;
  tier: LicenseTier | null;
  expires_at: string | null;            // ISO 8601 or null (null = not yet activated)
  activated_at: string | null;          // ISO 8601 or null (null = never activated)
  customer_email: string | null;
  purchase_date: string | null;
  last_validated_at: string | null;
  broker_name: string | null;
  notes: string | null;
  created_at: string;
}

/** Derived "display" status: revoked > expired (date-based) > active. */
export type DisplayStatus = "active" | "revoked" | "expired";

/** Liveness state — derived from activated_at + last_validated_at + status. */
export type LivenessState =
  | "revoked"
  | "expired"
  | "not_activated"
  | "online"
  | "stale"
  | "offline";
```

- [ ] **Step 2: Verify types compile**

```bash
cd ~/Documents/development/copytraderx-license
pnpm exec tsc --noEmit
```

Expected: errors will appear in files that still reference `"lifetime"` (`lib/expiry.ts`, `lib/schemas.ts`, `components/tier-badge.tsx`, `components/license-form.tsx`). These are fixed in the next tasks. Don't commit yet — fix together.

NOTE: do NOT commit at this step. We'll commit after Tasks 7–9 land together.

---

### Task 7: Drop lifetime from `lib/expiry.ts`

**Files:**
- Modify: `lib/expiry.ts`
- Modify: `lib/expiry.test.ts`

- [ ] **Step 1: Update the lifetime test cases first (TDD red)**

In `lib/expiry.test.ts`:

Delete the test:

```ts
  it("lifetime: returns null", () => {
    expect(calculateExpiresAt("lifetime", from)).toBeNull();
  });
```

Update the optional-chain assertions on `calculateExpiresAt` (the `?.` ones) to direct calls since the function will no longer be nullable:

```ts
  it("monthly: adds 1 calendar month", () => {
    const result = calculateExpiresAt("monthly", from);
    expect(result.toISOString()).toBe("2026-05-25T10:00:00.000Z");
  });

  it("quarterly: adds 3 calendar months", () => {
    const result = calculateExpiresAt("quarterly", from);
    expect(result.toISOString()).toBe("2026-07-25T10:00:00.000Z");
  });

  it("yearly: adds 1 calendar year", () => {
    const result = calculateExpiresAt("yearly", from);
    expect(result.toISOString()).toBe("2027-04-25T10:00:00.000Z");
  });

  it("monthly handles end-of-month rollover (Jan 31 → Feb 28)", () => {
    const jan31 = new Date("2026-01-31T00:00:00Z");
    const result = calculateExpiresAt("monthly", jan31);
    expect(result.toISOString().slice(0, 10)).toBe("2026-02-28");
  });
```

In the `formatExpiry` test block, replace the lifetime test:

```ts
describe("formatExpiry", () => {
  it("null → 'Not activated'", () => {
    expect(formatExpiry(null)).toBe("Not activated");
  });

  it("ISO string → YYYY-MM-DD", () => {
    expect(formatExpiry("2027-04-25T00:00:00Z")).toBe("2027-04-25");
  });
});
```

- [ ] **Step 2: Run tests — should fail compile**

```bash
cd ~/Documents/development/copytraderx-license
pnpm test --testPathPatterns lib/expiry.test
```

Expected: type errors / test failures because `calculateExpiresAt` still has the lifetime case.

- [ ] **Step 3: Update `lib/expiry.ts`**

Replace the file contents with:

```ts
import { addMonths, addYears } from "date-fns";
import type { LicenseTier, LicenseStatus, DisplayStatus } from "./types";

export function calculateExpiresAt(tier: LicenseTier, from: Date): Date {
  switch (tier) {
    case "monthly":
      return addMonths(from, 1);
    case "quarterly":
      return addMonths(from, 3);
    case "yearly":
      return addYears(from, 1);
  }
}

export function isExpired(expiresAt: string | null): boolean {
  if (expiresAt === null) return false;
  return new Date(expiresAt).getTime() <= Date.now();
}

export function computeDisplayStatus(
  status: LicenseStatus,
  expiresAt: string | null,
): DisplayStatus {
  if (status === "revoked") return "revoked";
  if (status === "expired") return "expired";
  if (isExpired(expiresAt)) return "expired";
  return "active";
}

export function formatExpiry(expiresAt: string | null): string {
  if (expiresAt === null) return "Not activated";
  // Use UTC components to avoid timezone-dependent off-by-one.
  const d = new Date(expiresAt);
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}
```

- [ ] **Step 4: Run tests — should pass**

```bash
pnpm test --testPathPatterns lib/expiry.test
```

Expected: all green.

NOTE: don't commit yet — `schemas.ts`, badges, and form still need updates. Commit after Task 9.

---

### Task 8: Drop lifetime from schemas

**Files:**
- Modify: `lib/schemas.ts:5`
- Modify: `lib/schemas.test.ts`

- [ ] **Step 1: Update `lib/schemas.test.ts`**

Find the existing test:

```ts
  it("rejects renew with invalid tier", () => {
    const result = renewActionSchema.safeParse({
      action: "renew",
      tier: "lifetime",
    });
    expect(result.success).toBe(false);
  });
```

Leave it as-is (it stays correct — `renewableTierEnum` rejects lifetime).

Add a new test in the `createLicenseSchema` describe block (after the "rejects unknown tier" test):

```ts
  it("rejects lifetime tier (no longer supported)", () => {
    const result = createLicenseSchema.safeParse({
      license_key: "IMPX-AAAA-BBBB-CCCC-DDDD",
      mt5_account: 12345678,
      tier: "lifetime",
    });
    expect(result.success).toBe(false);
  });
```

- [ ] **Step 2: Run test — should fail (lifetime currently accepted)**

```bash
pnpm test --testPathPatterns lib/schemas.test
```

Expected: `rejects lifetime tier` fails.

- [ ] **Step 3: Edit `lib/schemas.ts`**

Replace line 5:

```ts
const tierEnum = z.enum(["monthly", "quarterly", "yearly", "lifetime"]);
```

with:

```ts
const tierEnum = z.enum(["monthly", "quarterly", "yearly"]);
```

- [ ] **Step 4: Run tests — should pass**

```bash
pnpm test --testPathPatterns lib/schemas.test
```

Expected: all green.

---

### Task 9: Drop lifetime from badges + form

**Files:**
- Modify: `components/tier-badge.tsx`
- Modify: `components/license-form.tsx`
- Modify: `README.md` (one-line tier list update)

- [ ] **Step 1: Update `components/tier-badge.tsx`**

Replace the `LABELS` constant:

```ts
const LABELS: Record<LicenseTier, string> = {
  monthly: "Monthly",
  quarterly: "Quarterly",
  yearly: "Yearly",
};
```

- [ ] **Step 2: Update `components/license-form.tsx`**

In the form schema (line 41), replace:

```ts
  tier: z.enum(["monthly", "quarterly", "yearly", "lifetime"]),
```

with:

```ts
  tier: z.enum(["monthly", "quarterly", "yearly"]),
```

In the Select content (around line 274), delete the line:

```tsx
            <SelectItem value="lifetime">Lifetime</SelectItem>
```

In the `previewExpiry` block (around lines 168-172), replace:

```tsx
  const previewExpiry = (() => {
    if (tier === "lifetime") return "Never expires";
    const date = calculateExpiresAt(tier as LicenseTier, new Date());
    return `Expires ${formatExpiry(date?.toISOString() ?? null)}`;
  })();
```

with:

```tsx
  const previewExpiry = (() => {
    if (mode === "create") {
      return "Expiry will be set when the customer first activates the EA";
    }
    const date = calculateExpiresAt(tier as LicenseTier, new Date());
    return `If renewed today, expires ${formatExpiry(date.toISOString())}`;
  })();
```

- [ ] **Step 3: Update README.md tier list**

In the "Adding a license (UI flow)" section, replace step 3:

```markdown
3. Type customer's MT5 account, pick tier (Monthly/Quarterly/Yearly/Lifetime), optional email + notes
```

with:

```markdown
3. Type customer's MT5 account, pick tier (Monthly/Quarterly/Yearly), optional email + notes
```

- [ ] **Step 4: Run full test suite + typecheck**

```bash
pnpm test
pnpm exec tsc --noEmit
```

Expected: all green, no type errors.

- [ ] **Step 5: Commit (admin repo, bundles tasks 6-9)**

```bash
cd ~/Documents/development/copytraderx-license
git add lib/types.ts lib/expiry.ts lib/expiry.test.ts lib/schemas.ts lib/schemas.test.ts components/tier-badge.tsx components/license-form.tsx README.md
git commit -m "refactor: remove lifetime tier; add activated_at to License type"
```

---

### Task 10: Liveness derivation — types and pure function

**Files:**
- Create: `lib/liveness.ts`
- Create: `lib/liveness.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `lib/liveness.test.ts`:

```ts
import { deriveLiveness, ONLINE_WINDOW_MS, STALE_WINDOW_MS } from "./liveness";
import type { License } from "./types";

function makeLicense(overrides: Partial<License>): License {
  return {
    id: 1,
    license_key: "IMPX-AAAA-BBBB-CCCC-DDDD",
    mt5_account: 12345,
    status: "active",
    tier: "monthly",
    expires_at: "2099-01-01T00:00:00Z",
    activated_at: "2026-04-25T10:00:00Z",
    customer_email: null,
    purchase_date: null,
    last_validated_at: null,
    broker_name: null,
    notes: null,
    created_at: "2026-04-20T00:00:00Z",
    ...overrides,
  };
}

const NOW = new Date("2026-04-25T12:00:00Z");

describe("deriveLiveness", () => {
  it("revoked beats every other state", () => {
    const l = makeLicense({
      status: "revoked",
      last_validated_at: NOW.toISOString(),
    });
    expect(deriveLiveness(l, NOW)).toBe("revoked");
  });

  it("expired (status=expired) → expired", () => {
    const l = makeLicense({ status: "expired" });
    expect(deriveLiveness(l, NOW)).toBe("expired");
  });

  it("expires_at in the past → expired", () => {
    const l = makeLicense({ expires_at: "2020-01-01T00:00:00Z" });
    expect(deriveLiveness(l, NOW)).toBe("expired");
  });

  it("activated_at null + status=active → not_activated", () => {
    const l = makeLicense({ activated_at: null, expires_at: null });
    expect(deriveLiveness(l, NOW)).toBe("not_activated");
  });

  it("last_validated_at within ONLINE window → online", () => {
    const ms = NOW.getTime() - (ONLINE_WINDOW_MS - 60_000); // 1 min inside
    const l = makeLicense({ last_validated_at: new Date(ms).toISOString() });
    expect(deriveLiveness(l, NOW)).toBe("online");
  });

  it("last_validated_at exactly at ONLINE boundary → stale", () => {
    const ms = NOW.getTime() - ONLINE_WINDOW_MS;
    const l = makeLicense({ last_validated_at: new Date(ms).toISOString() });
    expect(deriveLiveness(l, NOW)).toBe("stale");
  });

  it("last_validated_at within STALE window → stale", () => {
    const ms = NOW.getTime() - (STALE_WINDOW_MS - 60_000);
    const l = makeLicense({ last_validated_at: new Date(ms).toISOString() });
    expect(deriveLiveness(l, NOW)).toBe("stale");
  });

  it("last_validated_at past STALE window → offline", () => {
    const ms = NOW.getTime() - (STALE_WINDOW_MS + 60_000);
    const l = makeLicense({ last_validated_at: new Date(ms).toISOString() });
    expect(deriveLiveness(l, NOW)).toBe("offline");
  });

  it("activated but never validated → offline", () => {
    const l = makeLicense({ last_validated_at: null });
    expect(deriveLiveness(l, NOW)).toBe("offline");
  });

  it("revoked beats not_activated", () => {
    const l = makeLicense({ status: "revoked", activated_at: null });
    expect(deriveLiveness(l, NOW)).toBe("revoked");
  });

  it("expired beats not_activated", () => {
    const l = makeLicense({
      activated_at: null,
      expires_at: "2020-01-01T00:00:00Z",
    });
    expect(deriveLiveness(l, NOW)).toBe("expired");
  });
});
```

- [ ] **Step 2: Run test — should fail**

```bash
cd ~/Documents/development/copytraderx-license
pnpm test --testPathPatterns lib/liveness.test
```

Expected: cannot find module `./liveness`.

- [ ] **Step 3: Implement `lib/liveness.ts`**

```ts
import type { License, LivenessState } from "./types";
import { isExpired } from "./expiry";

// One EA revalidate cycle (12h) plus 1h grace.
export const ONLINE_WINDOW_MS = 13 * 60 * 60 * 1000;

// Matches the EA's offline cache window — past this we know the EA is no
// longer running, since even cached tokens expire.
export const STALE_WINDOW_MS = 72 * 60 * 60 * 1000;

export function deriveLiveness(license: License, now: Date): LivenessState {
  if (license.status === "revoked") return "revoked";
  if (license.status === "expired") return "expired";
  if (isExpired(license.expires_at)) return "expired";
  if (license.activated_at === null) return "not_activated";
  if (license.last_validated_at === null) return "offline";

  const age = now.getTime() - new Date(license.last_validated_at).getTime();
  if (age < ONLINE_WINDOW_MS) return "online";
  if (age < STALE_WINDOW_MS) return "stale";
  return "offline";
}
```

- [ ] **Step 4: Run test — should pass**

```bash
pnpm test --testPathPatterns lib/liveness.test
```

Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add lib/liveness.ts lib/liveness.test.ts
git commit -m "feat(lib): add liveness state derivation"
```

---

### Task 11: Liveness badge component

**Files:**
- Create: `components/liveness-badge.tsx`

- [ ] **Step 1: Write the component**

```tsx
import { Badge } from "@/components/ui/badge";
import type { LivenessState } from "@/lib/types";

const STYLES: Record<LivenessState, string> = {
  online:
    "rounded-full border-green-200 bg-green-50 text-green-700 dark:border-green-900 dark:bg-green-950 dark:text-green-300",
  stale:
    "rounded-full border-yellow-200 bg-yellow-50 text-yellow-700 dark:border-yellow-900 dark:bg-yellow-950 dark:text-yellow-300",
  offline:
    "rounded-full border-gray-200 bg-gray-50 text-gray-700 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-300",
  not_activated:
    "rounded-full border-gray-200 bg-gray-50 text-gray-600 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-400",
  expired:
    "rounded-full border-orange-200 bg-orange-50 text-orange-700 dark:border-orange-900 dark:bg-orange-950 dark:text-orange-300",
  revoked:
    "rounded-full border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300",
};

const LABELS: Record<LivenessState, string> = {
  online: "Online",
  stale: "Stale",
  offline: "Offline",
  not_activated: "Not activated",
  expired: "Expired",
  revoked: "Revoked",
};

export function LivenessBadge({ state }: { state: LivenessState }) {
  return (
    <Badge variant="outline" className={STYLES[state]}>
      {LABELS[state]}
    </Badge>
  );
}
```

- [ ] **Step 2: Type-check**

```bash
cd ~/Documents/development/copytraderx-license
pnpm exec tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add components/liveness-badge.tsx
git commit -m "feat(ui): add LivenessBadge component"
```

---

### Task 12: License list — replace status column with liveness column

**Files:**
- Modify: `components/license-table.tsx`

- [ ] **Step 1: Replace imports at the top of the file**

Replace lines 33-37:

```ts
import { StatusBadge } from "./status-badge";
import { TierBadge } from "./tier-badge";
import { ConfirmDialog } from "./confirm-dialog";
import { computeDisplayStatus, formatExpiry, isExpired } from "@/lib/expiry";
import type { License } from "@/lib/types";
```

with:

```ts
import { LivenessBadge } from "./liveness-badge";
import { TierBadge } from "./tier-badge";
import { ConfirmDialog } from "./confirm-dialog";
import { formatExpiry, isExpired } from "@/lib/expiry";
import { deriveLiveness } from "@/lib/liveness";
import type { License, LivenessState } from "@/lib/types";
```

- [ ] **Step 2: Replace the Filter type and filter logic**

Replace line 39:

```ts
type Filter = "all" | "active" | "revoked" | "expired";
```

with:

```ts
type Filter = "all" | LivenessState;
```

Replace the `rows` useMemo (lines 49-60) with:

```ts
  const now = useMemo(() => new Date(), [licenses]);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return licenses
      .map((l) => ({ license: l, state: deriveLiveness(l, now) }))
      .filter(({ license, state }) => {
        if (filter !== "all" && state !== filter) return false;
        if (q.length === 0) return true;
        return (
          license.license_key.toLowerCase().includes(q) ||
          (license.customer_email ?? "").toLowerCase().includes(q)
        );
      });
  }, [licenses, search, filter, now]);
```

- [ ] **Step 3: Replace the filter Select content**

Replace the Select children (around lines 105-110):

```tsx
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="revoked">Revoked</SelectItem>
            <SelectItem value="expired">Expired</SelectItem>
          </SelectContent>
```

with:

```tsx
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="online">Online</SelectItem>
            <SelectItem value="stale">Stale</SelectItem>
            <SelectItem value="offline">Offline</SelectItem>
            <SelectItem value="not_activated">Not activated</SelectItem>
            <SelectItem value="expired">Expired</SelectItem>
            <SelectItem value="revoked">Revoked</SelectItem>
          </SelectContent>
```

- [ ] **Step 4: Replace the Last Validated table column**

Find the `TableHead` row (lines 124-135). Replace it with:

```tsx
            <TableRow>
              <TableHead className="w-[180px]">Status</TableHead>
              <TableHead>License Key</TableHead>
              <TableHead className="text-right">MT5 Account</TableHead>
              <TableHead>Tier</TableHead>
              <TableHead>Customer Email</TableHead>
              <TableHead>Expires</TableHead>
              {/* Actions column — narrow, no label */}
              <TableHead className="w-[52px]" />
            </TableRow>
```

In the empty-state cell `colSpan={8}` (line 141), change to `colSpan={7}`.

- [ ] **Step 5: Replace the row-rendering body**

Replace the `rows.map` block (lines 155-288) with:

```tsx
              rows.map(({ license: l, state }) => {
                const isPastExpiry = isExpired(l.expires_at);
                const isRevoked = l.status === "revoked";
                const lastValidated = l.last_validated_at
                  ? formatDistanceToNow(new Date(l.last_validated_at), {
                      addSuffix: true,
                    })
                  : null;
                return (
                  <TableRow key={l.id} className="group">
                    {/* Status — liveness badge + relative-time hint */}
                    <TableCell className="py-3">
                      <div className="flex flex-col gap-0.5">
                        <LivenessBadge state={state} />
                        {lastValidated && (
                          <span className="text-xs text-muted-foreground">
                            {lastValidated}
                          </span>
                        )}
                      </div>
                    </TableCell>

                    {/* License key — click-to-copy chip */}
                    <TableCell className="py-3">
                      <button
                        type="button"
                        onClick={() => copyKey(l.license_key)}
                        className="inline-flex items-center gap-1.5 rounded px-1.5 py-0.5 font-mono text-xs transition-colors hover:bg-muted"
                        title="Click to copy"
                      >
                        {l.license_key}
                        <Copy className="h-3 w-3 text-muted-foreground" />
                      </button>
                    </TableCell>

                    {/* MT5 account */}
                    <TableCell className="py-3 text-right tabular-nums text-sm">
                      {l.mt5_account}
                    </TableCell>

                    {/* Tier */}
                    <TableCell className="py-3">
                      <TierBadge tier={l.tier} />
                    </TableCell>

                    {/* Customer email */}
                    <TableCell className="py-3 text-sm">
                      {l.customer_email ?? (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>

                    {/* Expires — tinted cell when past expiry */}
                    <TableCell
                      className={`py-3 text-sm tabular-nums${
                        isPastExpiry
                          ? " bg-red-50 font-medium text-red-600 dark:bg-red-950/20 dark:text-red-400"
                          : ""
                      }`}
                    >
                      {formatExpiry(l.expires_at)}
                    </TableCell>

                    {/* Row actions — appear on hover */}
                    <TableCell className="py-3">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100"
                          >
                            <MoreHorizontal className="h-4 w-4" />
                            <span className="sr-only">Open actions</span>
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem asChild>
                            <Link href={`/licenses/${l.id}`}>Edit</Link>
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            disabled={isRevoked}
                            onClick={() =>
                              patchLicense(
                                l.id,
                                { action: "renew", tier: "monthly" },
                                "Renewed monthly",
                              )
                            }
                          >
                            Renew Monthly
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            disabled={isRevoked}
                            onClick={() =>
                              patchLicense(
                                l.id,
                                { action: "renew", tier: "quarterly" },
                                "Renewed quarterly",
                              )
                            }
                          >
                            Renew Quarterly
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            disabled={isRevoked}
                            onClick={() =>
                              patchLicense(
                                l.id,
                                { action: "renew", tier: "yearly" },
                                "Renewed yearly",
                              )
                            }
                          >
                            Renew Yearly
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            disabled={isRevoked}
                            onClick={() => setRevokeTarget(l)}
                          >
                            Revoke
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="text-red-600 focus:text-red-600 dark:text-red-400 dark:focus:text-red-400"
                            onClick={() => setDeleteTarget(l)}
                          >
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                );
              })
```

- [ ] **Step 6: Type-check + run tests**

```bash
pnpm exec tsc --noEmit
pnpm test
```

Expected: clean. (`StatusBadge` import is dropped; if anything still references it in this file, fix that.)

- [ ] **Step 7: Commit**

```bash
git add components/license-table.tsx
git commit -m "feat(ui): replace status column with liveness on license list"
```

---

### Task 13: Stop computing expires_at on license create (POST /api/licenses)

**Files:**
- Modify: `app/api/licenses/route.ts`

- [ ] **Step 1: Replace the POST handler body**

Replace lines 22-68 (the entire `export async function POST` body) with:

```ts
export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const parsed = createLicenseSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_request", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const input = parsed.data;

  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .from("licenses")
    .insert({
      license_key: input.license_key,
      mt5_account: input.mt5_account,
      tier: input.tier,
      // expires_at + activated_at left null on purpose: the EA stamps both
      // on first successful validation. Admin can override via
      // /api/licenses/:id/activate.
      expires_at: null,
      activated_at: null,
      customer_email: input.customer_email ?? null,
      notes: input.notes ?? null,
      status: "active",
    })
    .select()
    .single();

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json({ error: "key_exists" }, { status: 409 });
    }
    return NextResponse.json(
      { error: "insert_failed", details: error.message },
      { status: 500 },
    );
  }

  return NextResponse.json({ license: data }, { status: 201 });
}
```

- [ ] **Step 2: Remove the now-unused `calculateExpiresAt` import**

Delete line 4:

```ts
import { calculateExpiresAt } from "@/lib/expiry";
```

- [ ] **Step 3: Type-check**

```bash
pnpm exec tsc --noEmit
```

Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add app/api/licenses/route.ts
git commit -m "feat(api): defer expires_at on license create"
```

---

### Task 14: Renew action — stamp activated_at if null

**Files:**
- Modify: `app/api/licenses/[id]/route.ts:60-72`

- [ ] **Step 1: Edit the renew payload expansion**

Replace the renew expansion block (the `if ("action" in parsed.data && parsed.data.action === "renew")` block):

```ts
  // Expand renew action into a real update payload
  let updatePayload: Record<string, unknown>;
  if ("action" in parsed.data && parsed.data.action === "renew") {
    // Look up the row's current activated_at — if null, this renew also
    // counts as the activation event (admin's intent: "start the clock now").
    const sbCheck = getSupabaseAdmin();
    const { data: existing, error: lookupErr } = await sbCheck
      .from("licenses")
      .select("activated_at")
      .eq("id", numericId)
      .maybeSingle();

    if (lookupErr) {
      return NextResponse.json(
        { error: "lookup_failed", details: lookupErr.message },
        { status: 500 },
      );
    }
    if (!existing) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }

    const now = new Date();
    const expiresAt = calculateExpiresAt(parsed.data.tier, now);
    updatePayload = {
      tier: parsed.data.tier,
      expires_at: expiresAt.toISOString(),
    };
    if (existing.activated_at === null) {
      updatePayload.activated_at = now.toISOString();
    }
  } else {
    updatePayload = parsed.data;
  }
```

NOTE: `calculateExpiresAt` no longer returns nullable, so the `expiresAt ? expiresAt.toISOString() : null` ternary becomes a direct call.

- [ ] **Step 2: Type-check**

```bash
pnpm exec tsc --noEmit
```

Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add app/api/licenses/[id]/route.ts
git commit -m "feat(api): renew also stamps activated_at when null"
```

---

### Task 15: Activate-now endpoint

**Files:**
- Create: `app/api/licenses/[id]/activate/route.ts`

- [ ] **Step 1: Create the route**

```ts
import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { calculateExpiresAt } from "@/lib/expiry";
import type { LicenseTier } from "@/lib/types";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(_req: Request, ctx: RouteContext) {
  const { id } = await ctx.params;
  const numericId = Number(id);
  if (!Number.isInteger(numericId) || numericId <= 0) {
    return NextResponse.json({ error: "invalid_id" }, { status: 400 });
  }

  const sb = getSupabaseAdmin();
  const { data: existing, error: lookupErr } = await sb
    .from("licenses")
    .select("id, tier, activated_at")
    .eq("id", numericId)
    .maybeSingle();

  if (lookupErr) {
    return NextResponse.json(
      { error: "lookup_failed", details: lookupErr.message },
      { status: 500 },
    );
  }
  if (!existing) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  if (existing.activated_at !== null) {
    return NextResponse.json({ error: "already_activated" }, { status: 409 });
  }
  if (existing.tier === null) {
    return NextResponse.json({ error: "tier_missing" }, { status: 400 });
  }

  const now = new Date();
  const expiresAt = calculateExpiresAt(existing.tier as LicenseTier, now);

  const { data, error: updErr } = await sb
    .from("licenses")
    .update({
      activated_at: now.toISOString(),
      expires_at: expiresAt.toISOString(),
    })
    .eq("id", numericId)
    .select()
    .single();

  if (updErr) {
    return NextResponse.json(
      { error: "update_failed", details: updErr.message },
      { status: 500 },
    );
  }
  return NextResponse.json({ license: data });
}
```

- [ ] **Step 2: Type-check**

```bash
pnpm exec tsc --noEmit
```

Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add app/api/licenses/[id]/activate/route.ts
git commit -m "feat(api): add activate-now endpoint"
```

---

### Task 16: Activate-now button component

**Files:**
- Create: `components/activate-now-button.tsx`

- [ ] **Step 1: Create the component**

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "./confirm-dialog";
import type { LicenseTier } from "@/lib/types";
import { calculateExpiresAt, formatExpiry } from "@/lib/expiry";

export function ActivateNowButton({
  licenseId,
  tier,
}: {
  licenseId: number;
  tier: LicenseTier;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const previewExpiry = formatExpiry(
    calculateExpiresAt(tier, new Date()).toISOString(),
  );

  async function activate() {
    setSubmitting(true);
    const res = await fetch(`/api/licenses/${licenseId}/activate`, {
      method: "POST",
    });
    setSubmitting(false);

    if (!res.ok) {
      const text = await res.text();
      toast.error(`Activation failed: ${text}`);
      return;
    }
    toast.success("License activated");
    router.refresh();
  }

  return (
    <>
      <Button
        type="button"
        size="sm"
        onClick={() => setOpen(true)}
        disabled={submitting}
      >
        Activate now
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title="Start the subscription clock?"
        description={`This will set activated_at to now and expires_at to ${previewExpiry}. Use this only if the customer has activated the EA elsewhere or you want to start the clock manually.`}
        confirmLabel="Activate"
        onConfirm={activate}
      />
    </>
  );
}
```

- [ ] **Step 2: Type-check**

```bash
pnpm exec tsc --noEmit
```

Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add components/activate-now-button.tsx
git commit -m "feat(ui): add ActivateNowButton component"
```

---

### Task 17: License detail page — activation callout + metadata

**Files:**
- Modify: `app/licenses/[id]/page.tsx`

- [ ] **Step 1: Replace the file contents**

```tsx
import Link from "next/link";
import { notFound } from "next/navigation";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { LicenseForm } from "@/components/license-form";
import { LivenessBadge } from "@/components/liveness-badge";
import { ActivateNowButton } from "@/components/activate-now-button";
import { SiteNav } from "@/components/site-nav";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { isExpired } from "@/lib/expiry";
import { deriveLiveness } from "@/lib/liveness";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertTriangle, Clock } from "lucide-react";
import type { License } from "@/lib/types";

export const dynamic = "force-dynamic";

async function fetchLicense(id: number): Promise<License | null> {
  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .from("licenses")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) return null;
  return data as License | null;
}

function daysSince(iso: string): number {
  const ms = Date.now() - new Date(iso).getTime();
  return Math.max(0, Math.floor(ms / (24 * 60 * 60 * 1000)));
}

export default async function EditLicensePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const numericId = Number(id);
  if (!Number.isInteger(numericId) || numericId <= 0) notFound();

  const license = await fetchLicense(numericId);
  if (!license) notFound();

  const liveness = deriveLiveness(license, new Date());
  const pastExpiry =
    license.status === "active" && isExpired(license.expires_at);
  const notActivated =
    license.status === "active" && license.activated_at === null;

  return (
    <div className="min-h-screen">
      <SiteNav />
      <main className="mx-auto max-w-6xl px-6 py-8">
        <div className="mb-6">
          <Link
            href="/licenses"
            className="text-sm text-muted-foreground hover:underline"
          >
            ← Back to licenses
          </Link>
          <div className="mt-2 flex items-center gap-3">
            <h1 className="text-2xl font-semibold">Edit License</h1>
            <LivenessBadge state={liveness} />
          </div>
        </div>

        {notActivated && license.tier && (
          <Alert className="mb-6 border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
            <Clock className="h-4 w-4" />
            <AlertDescription className="flex items-center justify-between gap-4">
              <span>
                License sold {daysSince(license.created_at)} day(s) ago — customer
                hasn&apos;t activated yet. Subscription clock starts on first EA
                validation, or click below to start it now.
              </span>
              <ActivateNowButton licenseId={license.id} tier={license.tier} />
            </AlertDescription>
          </Alert>
        )}

        {pastExpiry && (
          <Alert className="mb-6">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              License is past expiry — customer&apos;s EA stopped trading on{" "}
              {new Date(license.expires_at!).toLocaleDateString()}. Renew below
              to reactivate.
            </AlertDescription>
          </Alert>
        )}

        <LicenseForm mode="edit" initial={license} />

        <Card className="mt-10 max-w-xl">
          <CardHeader>
            <CardTitle className="text-base">Metadata</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2 text-sm">
            <Row label="ID" value={license.id} />
            <Row label="Created" value={license.created_at} />
            <Row label="Purchase Date" value={license.purchase_date ?? "—"} />
            <Row
              label="Activated"
              value={
                license.activated_at
                  ? `${license.activated_at} (${daysSince(license.created_at) - daysSince(license.activated_at)} day(s) after purchase)`
                  : "Not yet activated"
              }
            />
            <Row
              label="Last Validated"
              value={license.last_validated_at ?? "Never"}
            />
            <Row
              label="Broker (last seen)"
              value={license.broker_name ?? "—"}
            />
          </CardContent>
        </Card>
      </main>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex justify-between gap-4 border-b py-1.5 last:border-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-mono text-xs">{value}</span>
    </div>
  );
}
```

- [ ] **Step 2: Type-check + tests**

```bash
pnpm exec tsc --noEmit
pnpm test
```

Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add app/licenses/[id]/page.tsx
git commit -m "feat(ui): add activation callout, liveness badge, and activated_at metadata to detail page"
```

---

### Task 18: Apply migration + deploy edge function

**Files:** none (deploy step).

- [ ] **Step 1: Apply migration**

```bash
cd ~/Documents/development/EA/JSONFX-IMPULSE
supabase db push
```

Expected: migration applies. If any `tier='lifetime'` rows exist, the migration aborts with the safety check from Task 1 — reconcile manually (`update licenses set tier='yearly' where tier='lifetime';`) and re-run.

- [ ] **Step 2: Deploy edge function**

```bash
cd ~/Documents/development/EA/JSONFX-IMPULSE
supabase functions deploy validate-license
```

Expected: deploy completes.

- [ ] **Step 3: Smoke-test the edge function with a fresh license**

In the admin UI, create a new license. Verify it shows `Not activated` in the list. Then run:

```bash
curl -X POST \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $LICENSE_ANON_KEY" \
  -H "apikey: $LICENSE_ANON_KEY" \
  -d '{"license_key":"<the-key-you-just-created>","mt5_account":<the-account>}' \
  https://mkfabzqlxzeidfblxzhq.supabase.co/functions/v1/validate-license
```

Expected: HTTP 200, `valid:true`, signed payload. Reload the admin UI — license shows `Online`, with `activated_at` and `expires_at` populated.

NOTE: `LICENSE_ANON_KEY` is the public anon key from the EA's `LicenseConfig.mqh`.

- [ ] **Step 4: No commit** — deployment isn't a code change. Move to verification.

---

### Task 19: Manual verification checklist (visual + integration)

**Files:** none.

- [ ] **Step 1: Start dev server**

```bash
cd ~/Documents/development/copytraderx-license
pnpm dev
```

- [ ] **Step 2: Walk through each scenario in the browser**

Visit `http://localhost:3000/licenses` and verify:

1. **Create flow** — `+ New License` works. Form no longer shows "Lifetime" in tier dropdown. After creating, the license appears in the list with badge `Not activated`. Expires column shows `Not activated`.
2. **List filtering** — filter dropdown contains: All / Online / Stale / Offline / Not activated / Expired / Revoked. Selecting `Not activated` shows only the just-created row.
3. **Detail page** — click into the row. See yellow "License sold N days ago" callout with `Activate now` button. Liveness badge in header reads `Not activated`. Metadata shows `Activated: Not yet activated`.
4. **Activate now** — click the button, confirm. Toast shows "License activated." Page refreshes. Callout disappears. Badge reads `Stale` (no `last_validated_at` yet) or `Offline`. Metadata shows `Activated: <iso>` and a real `Expires` value.
5. **Renew an unactivated license** — create a second license. From the list dropdown, click `Renew Monthly`. Refresh — badge changes from `Not activated` to `Stale`/`Offline` (depending on `last_validated_at`), expires_at and activated_at both populated.
6. **Run the edge function smoke test from Task 18** against the unactivated original to confirm EA-stamping works end-to-end.

- [ ] **Step 3: If anything fails — debug and add follow-up commits.** Otherwise proceed.

---

### Task 20: Final test sweep + push

**Files:** none.

- [ ] **Step 1: Run full unit-test suite**

```bash
cd ~/Documents/development/copytraderx-license
pnpm test
pnpm exec tsc --noEmit
```

Expected: green.

```bash
cd ~/Documents/development/EA/JSONFX-IMPULSE/supabase/functions/validate-license
deno test --allow-net test.ts
```

Expected: green.

- [ ] **Step 2: Confirm both repos have clean status**

```bash
cd ~/Documents/development/copytraderx-license && git status
cd ~/Documents/development/EA/JSONFX-IMPULSE && git status
```

Expected: clean working trees in both.

- [ ] **Step 3: Push both branches (only when user confirms)**

```bash
cd ~/Documents/development/copytraderx-license && git push
cd ~/Documents/development/EA/JSONFX-IMPULSE && git push
```

NOTE: Don't push without user authorization per project conventions.

---

## Self-review notes

- **Spec coverage:** every section of the spec maps to a task — schema (1), edge function activation (2-4), `not_configured` (3, 5), liveness derivation (10), badge (11), list page (12), create-flow defer (13), renew-stamp (14), activate-now endpoint (15), activate-now button (16), detail page (17), lifetime cleanup (6-9), migration order (18), tests (in each task plus 20).
- **No placeholders.** Every code block is complete; every test has assertions; every command has expected output.
- **Type consistency:** `LivenessState` and `LicenseTier` are defined in Task 6 and reused in Tasks 10-17 with matching names. `addTierDuration` in the edge function and `calculateExpiresAt` in admin UI both use UTC-stable end-of-month clamping (Tasks 2 and 7).
- **Renew + activated_at precedence:** Task 14 looks up `activated_at` before stamping. Edge function (Task 4) checks `data.activated_at` already. So if the renew already set `activated_at`, the next EA validation will see it set and skip the stamping branch — no double-write race.
