# Account-Type Gate & OnTimer Bug Fix — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the OnTimer cache-grace bug that ignores server rejections, then add an account-type gate so licenses created for "demo" only work on demo accounts and "live" only on live accounts.

**Architecture:** Server-authoritative gate — the edge function compares the admin-set `intended_account_type` against the EA-reported `account_type` and rejects mismatches. The signed HMAC token payload includes `intended_account_type` so the EA can enforce from cache too. Token validity drops from 72h to 12h.

**Tech Stack:** MQL5 (EA), TypeScript/Deno (Supabase edge function), Next.js/React (dashboard), PostgreSQL (Supabase)

**Spec:** `docs/superpowers/specs/2026-04-28-account-type-gate-design.md`

---

## File Map

### EA repo (`/Users/jsonse/Documents/development/EA/JSONFX-IMPULSE`)

| File | Action | Purpose |
|------|--------|---------|
| `Include/CopyTraderX-Impulse/Defines.mqh` | Modify | Add `LICENSE_WRONG_ACCOUNT_TYPE` enum + string |
| `Include/CopyTraderX-Impulse/LicenseManager.mqh` | Modify | OnTimer fix, new member, parse + enforce intended_account_type |
| `supabase/migrations/20260428000001_add_intended_account_type.sql` | Create | DB migration |
| `supabase/functions/validate-license/index.ts` | Modify | Account-type mismatch check, payload field, 12h cache |
| `supabase/functions/validate-license/types.ts` | Modify | Add `account_type_mismatch` failure reason |

### Dashboard repo (`/Users/jsonse/Documents/development/copytraderx-license`)

| File | Action | Purpose |
|------|--------|---------|
| `lib/types.ts` | Modify | Add `intended_account_type` to License interface |
| `lib/schemas.ts` | Modify | Add to create + update schemas |
| `components/license-form.tsx` | Modify | Account Type dropdown (Demo/Live) |
| `app/api/licenses/route.ts` | Modify | Pass `intended_account_type` on create |
| `app/api/licenses/[id]/route.ts` | Modify | Allow `intended_account_type` in PATCH |

---

## Task 1: Fix OnTimer cache-grace bug

**Files:**
- Modify: `/Users/jsonse/Documents/development/EA/JSONFX-IMPULSE/Include/CopyTraderX-Impulse/LicenseManager.mqh:545`

- [ ] **Step 1: Fix the cache-grace condition**

In `LicenseManager.mqh`, find the `OnTimer()` method (line ~530). Change the cache-grace condition from:

```cpp
   if(!ok && state_before == LICENSE_VALID && TimeCurrent() < valid_before)
   {
      m_state             = LICENSE_VALID;
      m_token_valid_until = valid_before;
      Print("[LicenseManager] revalidation failed; cache still valid, continuing");
   }
```

To:

```cpp
   // Grace only for network errors — server rejections (revoked, expired, etc.)
   // must take immediate effect, never be papered over by a stale cache.
   if(!ok && m_state == LICENSE_NETWORK_ERROR
         && state_before == LICENSE_VALID && TimeCurrent() < valid_before)
   {
      m_state             = LICENSE_VALID;
      m_token_valid_until = valid_before;
      Print("[LicenseManager] revalidation network error; cache still valid, continuing");
   }
```

- [ ] **Step 2: Commit**

```bash
cd /Users/jsonse/Documents/development/EA/JSONFX-IMPULSE
git add Include/CopyTraderX-Impulse/LicenseManager.mqh
git commit -m "fix(license): only apply cache-grace for network errors, not server rejections"
```

---

## Task 2: Add LICENSE_WRONG_ACCOUNT_TYPE to EA Defines

**Files:**
- Modify: `/Users/jsonse/Documents/development/EA/JSONFX-IMPULSE/Include/CopyTraderX-Impulse/Defines.mqh:67-100`

- [ ] **Step 1: Add enum value**

In `Defines.mqh`, add `LICENSE_WRONG_ACCOUNT_TYPE` after `LICENSE_KEY_FORMAT` in `ENUM_LICENSE_STATE`:

```cpp
enum ENUM_LICENSE_STATE
{
   LICENSE_UNKNOWN = 0,         // pre-init
   LICENSE_VALID,               // token verified, within validity window
   LICENSE_EXPIRED,             // license itself expired (server said so)
   LICENSE_REVOKED,             // manually revoked
   LICENSE_NOT_FOUND,           // key/account combo not in DB
   LICENSE_NETWORK_ERROR,       // can't reach server, no valid cache
   LICENSE_TAMPERED,            // HMAC verification failed
   LICENSE_WRONG_ACCOUNT,       // token's mt5_account != current account
   LICENSE_KEY_MISSING,         // InpLicenseKey input is empty
   LICENSE_KEY_FORMAT,          // InpLicenseKey doesn't match IMPX-XXXX-... pattern
   LICENSE_WRONG_ACCOUNT_TYPE   // demo/live mismatch between license and account
};
```

- [ ] **Step 2: Add string mapping**

In the `LicenseStateToString()` function, add the new case before `default`:

```cpp
      case LICENSE_KEY_FORMAT:           return "KEY_FORMAT";
      case LICENSE_WRONG_ACCOUNT_TYPE:   return "WRONG_ACCOUNT_TYPE";
      default:                           return "UNHANDLED";
```

- [ ] **Step 3: Commit**

```bash
cd /Users/jsonse/Documents/development/EA/JSONFX-IMPULSE
git add Include/CopyTraderX-Impulse/Defines.mqh
git commit -m "feat(license): add LICENSE_WRONG_ACCOUNT_TYPE enum state"
```

---

## Task 3: Update LicenseManager to parse and enforce intended_account_type

**Files:**
- Modify: `/Users/jsonse/Documents/development/EA/JSONFX-IMPULSE/Include/CopyTraderX-Impulse/LicenseManager.mqh`

- [ ] **Step 1: Add member variable**

In the `private` section of `CLicenseManager`, after `m_token_valid_until`, add:

```cpp
   string             m_token_intended_account_type;  // from signed payload ("demo"/"live" or "")
```

- [ ] **Step 2: Initialize in constructor**

In `CLicenseManager::CLicenseManager()`, add to the initializer list after `m_token_valid_until(0)`:

```cpp
     m_token_intended_account_type(""),
```

- [ ] **Step 3: Parse intended_account_type in ParsePayload**

In `ParsePayload()`, after the `valid_until` parsing block (around line 269), add:

```cpp
   // intended_account_type (string or absent/null — optional field)
   m_token_intended_account_type = "";
   p = StringFind(payload, "\"intended_account_type\":");
   if(p >= 0)
   {
      p += StringLen("\"intended_account_type\":");
      if(StringSubstr(payload, p, 4) != "null")
      {
         int q1 = StringFind(payload, "\"", p);
         int q2 = StringFind(payload, "\"", q1 + 1);
         if(q1 >= 0 && q2 > q1)
            m_token_intended_account_type = StringSubstr(payload, q1 + 1, q2 - q1 - 1);
      }
   }
```

- [ ] **Step 4: Add account-type enforcement helper**

After the `ParsePayload()` method, add a new private helper. First add the declaration in the private section of the class (after `ParseIsoDatetime`):

```cpp
   bool               CheckAccountType();
```

Then add the implementation after `ParsePayload()`:

```cpp
//+------------------------------------------------------------------+
//| CheckAccountType — compare token's intended type vs actual         |
//+------------------------------------------------------------------+
bool CLicenseManager::CheckAccountType()
{
   if(m_token_intended_account_type == "") return true;  // no gate set
   if(m_account_type == "contest")
   {
      SetState(LICENSE_WRONG_ACCOUNT_TYPE, "Invalid Account");
      return false;
   }
   if(m_token_intended_account_type != m_account_type)
   {
      SetState(LICENSE_WRONG_ACCOUNT_TYPE, "Invalid Account");
      return false;
   }
   return true;
}
```

- [ ] **Step 5: Enforce in FetchAndStoreToken after ParsePayload**

In `FetchAndStoreToken()`, after the `m_token_mt5_account != m_mt5_account` check (around line 459-465), add the account-type check:

```cpp
   if(!CheckAccountType())
      return false;
```

This goes right before `SaveCachedToken(payload, signature)`.

- [ ] **Step 6: Add account_type_mismatch to server response parsing**

In `FetchAndStoreToken()`, in the `valid:false` response parsing block (around line 393-406), add a new case after `"not_configured"`:

```cpp
      else if(StringFind(resp, "\"reason\":\"account_type_mismatch\"") >= 0)
         SetState(LICENSE_WRONG_ACCOUNT_TYPE, "Invalid Account");
```

- [ ] **Step 7: Enforce in LoadCachedToken after existing checks**

In `LoadCachedToken()`, after the `m_token_valid_until` time check (around line 309-313) and before the final `return true`, add:

```cpp
   if(!CheckAccountType())
   {
      Print("[LicenseManager] cache account type mismatch; ignoring file");
      return false;
   }
```

- [ ] **Step 8: Commit**

```bash
cd /Users/jsonse/Documents/development/EA/JSONFX-IMPULSE
git add Include/CopyTraderX-Impulse/LicenseManager.mqh
git commit -m "feat(license): parse intended_account_type from token, enforce demo/live gate"
```

---

## Task 4: DB migration for intended_account_type

**Files:**
- Create: `/Users/jsonse/Documents/development/EA/JSONFX-IMPULSE/supabase/migrations/20260428000001_add_intended_account_type.sql`

- [ ] **Step 1: Create the migration file**

```sql
-- Add intended_account_type column for the demo/live gate.
-- Admin sets this when creating a license. The edge function compares
-- it against the EA-reported account_type and rejects mismatches.
ALTER TABLE licenses
  ADD COLUMN intended_account_type text
  CONSTRAINT licenses_intended_account_type_chk CHECK (intended_account_type IN ('demo', 'live'));
```

- [ ] **Step 2: Commit**

```bash
cd /Users/jsonse/Documents/development/EA/JSONFX-IMPULSE
git add supabase/migrations/20260428000001_add_intended_account_type.sql
git commit -m "feat(db): add intended_account_type column to licenses table"
```

---

## Task 5: Update edge function — account-type gate + 12h cache

**Files:**
- Modify: `/Users/jsonse/Documents/development/EA/JSONFX-IMPULSE/supabase/functions/validate-license/types.ts`
- Modify: `/Users/jsonse/Documents/development/EA/JSONFX-IMPULSE/supabase/functions/validate-license/index.ts`

- [ ] **Step 1: Add account_type_mismatch to failure reasons**

In `types.ts`, update the `ValidateLicenseFailure` interface:

```typescript
export interface ValidateLicenseFailure {
  valid: false;
  reason: "not_found" | "revoked" | "expired" | "not_configured" | "account_type_mismatch";
}
```

- [ ] **Step 2: Change TOKEN_VALIDITY_MS from 72h to 12h**

In `index.ts`, change:

```typescript
const TOKEN_VALIDITY_MS = 12 * 60 * 60 * 1000;  // 12 hours
```

- [ ] **Step 3: Add intended_account_type to the DB select**

In `index.ts`, update the `.select()` call to include the new column:

```typescript
  const { data, error } = await sb
    .from("licenses")
    .select("license_key, mt5_account, status, expires_at, activated_at, tier, intended_account_type")
    .eq("license_key", license_key)
    .eq("mt5_account", mt5_account)
    .limit(1)
    .maybeSingle();
```

- [ ] **Step 4: Add account-type mismatch check**

In `index.ts`, after the expiry recheck (after the `if (expiresAt !== null && new Date(expiresAt) <= new Date())` block, around line 74), add:

```typescript
  // Account-type gate: reject if intended type is set and doesn't match.
  // Contest accounts are always rejected.
  if (data.intended_account_type && account_type) {
    if (account_type === "contest" || account_type !== data.intended_account_type) {
      return jsonResponse(200, fail("account_type_mismatch"));
    }
  }
```

- [ ] **Step 5: Add intended_account_type to the signed payload**

In `index.ts`, update the `payloadObj` to include `intended_account_type`:

```typescript
  const payloadObj = {
    mt5_account: data.mt5_account,
    expires_at: expiresAt,
    issued_at: issuedAt.toISOString(),
    valid_until: validUntil.toISOString(),
    intended_account_type: data.intended_account_type ?? null,
  };
```

- [ ] **Step 6: Commit**

```bash
cd /Users/jsonse/Documents/development/EA/JSONFX-IMPULSE
git add supabase/functions/validate-license/types.ts supabase/functions/validate-license/index.ts
git commit -m "feat(edge): add account-type gate, include intended_account_type in token, 12h cache"
```

---

## Task 6: Update dashboard types and schemas

**Files:**
- Modify: `/Users/jsonse/Documents/development/copytraderx-license/lib/types.ts`
- Modify: `/Users/jsonse/Documents/development/copytraderx-license/lib/schemas.ts`
- Modify: `/Users/jsonse/Documents/development/copytraderx-license/lib/liveness.test.ts`

- [ ] **Step 1: Add intended_account_type to License interface**

In `lib/types.ts`, add `intended_account_type` to the `License` interface after `account_type`:

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
}
```

Note: `AccountType` is already defined as `"demo" | "live" | "contest"`. The `intended_account_type` column only allows `"demo" | "live"` at the DB level, but reusing the same TS type is fine — the constraint lives in the DB and Zod schema.

- [ ] **Step 2: Add intended_account_type to schemas**

In `lib/schemas.ts`, add an `accountTypeEnum` and include it in both schemas:

```typescript
const accountTypeEnum = z.enum(["demo", "live"]);
```

Add to `createLicenseSchema` (inside the `.object({})`, after `tier`):

```typescript
    intended_account_type: accountTypeEnum,
```

Add to `updateLicenseSchema` (inside the `.object({})`, after `tier`):

```typescript
    intended_account_type: accountTypeEnum.nullable().optional(),
```

- [ ] **Step 3: Add field to test helper**

In `lib/liveness.test.ts`, in the `makeLicense()` function, add after `account_type: null`:

```typescript
    intended_account_type: null,
```

- [ ] **Step 4: Run type check and tests**

```bash
cd /Users/jsonse/Documents/development/copytraderx-license
npx tsc --noEmit && npx jest --no-coverage
```

Expected: Clean type check, all tests pass.

- [ ] **Step 5: Commit**

```bash
cd /Users/jsonse/Documents/development/copytraderx-license
git add lib/types.ts lib/schemas.ts lib/liveness.test.ts
git commit -m "feat(types): add intended_account_type to License interface and schemas"
```

---

## Task 7: Update dashboard API routes

**Files:**
- Modify: `/Users/jsonse/Documents/development/copytraderx-license/app/api/licenses/route.ts`
- Modify: `/Users/jsonse/Documents/development/copytraderx-license/app/api/licenses/[id]/route.ts`

- [ ] **Step 1: Pass intended_account_type on create**

In `app/api/licenses/route.ts`, in the `POST` handler, add `intended_account_type` to the insert object (after `status: "active"`):

```typescript
      intended_account_type: input.intended_account_type,
```

- [ ] **Step 2: Verify PATCH already handles it**

The PATCH handler in `app/api/licenses/[id]/route.ts` uses `updatePayload = parsed.data` for non-renew updates (line 93). Since `intended_account_type` is now in `updateLicenseSchema`, it will be passed through automatically. No code change needed.

- [ ] **Step 3: Run type check**

```bash
cd /Users/jsonse/Documents/development/copytraderx-license
npx tsc --noEmit
```

Expected: Clean.

- [ ] **Step 4: Commit**

```bash
cd /Users/jsonse/Documents/development/copytraderx-license
git add app/api/licenses/route.ts
git commit -m "feat(api): pass intended_account_type on license create"
```

---

## Task 8: Add Account Type dropdown to license form

**Files:**
- Modify: `/Users/jsonse/Documents/development/copytraderx-license/components/license-form.tsx`

- [ ] **Step 1: Add intended_account_type to the form schema**

In `license-form.tsx`, update the local `formSchema` to include:

```typescript
  intended_account_type: z.enum(["demo", "live"]),
```

Update the `FormValues` type will be inferred automatically.

- [ ] **Step 2: Add default value**

In the `defaultValues` object, add:

```typescript
    intended_account_type: (initial?.intended_account_type as "demo" | "live" | undefined) ?? "demo",
```

- [ ] **Step 3: Include in submit body**

In the `onSubmit` function, add `intended_account_type` to both the create and edit body objects:

For create body:

```typescript
        ? {
            license_key: values.license_key,
            mt5_account: values.mt5_account,
            tier: values.tier,
            intended_account_type: values.intended_account_type,
            customer_email: values.customer_email || null,
            notes: values.notes || null,
          }
```

For edit body:

```typescript
        : {
            mt5_account: values.mt5_account,
            tier: values.tier,
            status: values.status,
            intended_account_type: values.intended_account_type,
            customer_email: values.customer_email || null,
            notes: values.notes || null,
          };
```

- [ ] **Step 4: Add the Account Type dropdown to the form JSX**

Add this block after the Tier section and before the Status section:

```tsx
      {/* Account Type */}
      <div className="space-y-1.5">
        <Label htmlFor="intended_account_type" className="text-sm font-semibold">
          Account Type
        </Label>
        <Select
          value={form.watch("intended_account_type")}
          onValueChange={(v) =>
            form.setValue("intended_account_type", v as "demo" | "live", { shouldDirty: true })
          }
        >
          <SelectTrigger id="intended_account_type">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="demo">Demo</SelectItem>
            <SelectItem value="live">Live</SelectItem>
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          The EA will only trade if the MT5 account type matches this setting.
        </p>
      </div>
```

- [ ] **Step 5: Run type check and tests**

```bash
cd /Users/jsonse/Documents/development/copytraderx-license
npx tsc --noEmit && npx jest --no-coverage
```

Expected: Clean type check, all tests pass.

- [ ] **Step 6: Commit**

```bash
cd /Users/jsonse/Documents/development/copytraderx-license
git add components/license-form.tsx
git commit -m "feat(ui): add Account Type dropdown to license form"
```

---

## Task 9: Deploy — migration, edge function, dashboard container

- [ ] **Step 1: Push DB migration**

```bash
cd /Users/jsonse/Documents/development/EA/JSONFX-IMPULSE
supabase db push
```

Expected: Migration `20260428000001_add_intended_account_type.sql` applied.

- [ ] **Step 2: Deploy edge function**

```bash
cd /Users/jsonse/Documents/development/EA/JSONFX-IMPULSE
supabase functions deploy validate-license
```

Expected: Function deployed successfully.

- [ ] **Step 3: Rebuild dashboard container**

```bash
cd /Users/jsonse/Documents/development/copytraderx-license
docker compose up -d --build
```

Expected: Container rebuilt and running with new UI.

- [ ] **Step 4: Verify at copytraderx.local**

Open `http://copytraderx.local/licenses/new` and confirm the Account Type dropdown (Demo/Live) is visible in the form.
