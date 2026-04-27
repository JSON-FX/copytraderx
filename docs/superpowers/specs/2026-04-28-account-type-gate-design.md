# Account-Type Gate & OnTimer Bug Fix

## Overview

Two changes: (1) fix a bug where the EA's OnTimer revalidation ignores server-side rejections (revoked/expired) due to overly broad cache-grace logic, and (2) add an account-type gate so licenses created for "demo" only work on demo accounts and licenses created for "live" only work on live accounts. Contest accounts are always rejected.

## Part 1: OnTimer Bug Fix

### Problem

In `LicenseManager.mqh` `OnTimer()`, the cache-grace condition:

```cpp
if(!ok && state_before == LICENSE_VALID && TimeCurrent() < valid_before)
```

...does not distinguish between a network failure and a server-side rejection. When the server actively revokes a license during revalidation, `FetchAndStoreToken()` returns false and sets `m_state` to `LICENSE_REVOKED`, but the grace logic restores `m_state = LICENSE_VALID` because `state_before` was valid and the cache hasn't expired. The EA continues trading until the cache window naturally expires.

### Fix

Add `m_state == LICENSE_NETWORK_ERROR` to the condition:

```cpp
if(!ok && m_state == LICENSE_NETWORK_ERROR && state_before == LICENSE_VALID && TimeCurrent() < valid_before)
```

Network errors get grace (server unreachable, keep cached token). Server rejections (revoked, expired, not_found, wrong_account) take immediate effect.

## Part 2: Account-Type Gate

### Design Decisions

- Only `demo` and `live` are valid intended account types (no "contest", no "any/unrestricted")
- Contest accounts are always rejected regardless of license type
- The dropdown on the license form is required (Demo or Live) — no empty/unset option
- Existing licenses with `null` intended_account_type can be updated via the edit form
- Intended account type is shown on the edit page only, not in the table (table already shows the EA-reported type)
- EA displays "Invalid Account" on mismatch (short message)

### Cache Window Change

Token validity (cache) changes from 72 hours to 12 hours. The revalidation interval stays at 12 hours. This means:
- Cache expires at the same time the next revalidation is due
- If server is unreachable at revalidation time, grace window is effectively zero
- Revocation takes effect within 12 hours maximum

### Database

New column on `licenses` table:

```sql
ALTER TABLE licenses
  ADD COLUMN intended_account_type text
  CONSTRAINT licenses_intended_account_type_chk CHECK (intended_account_type IN ('demo', 'live'));
```

Nullable for backwards compatibility with the 3 existing rows.

### Edge Function (`validate-license`)

After existing checks pass (found, not revoked, not expired), add:

```
if intended_account_type is set AND account_type is sent by EA:
  if account_type == "contest" → reject "account_type_mismatch"
  if account_type != intended_account_type → reject "account_type_mismatch"
```

If `intended_account_type` is null, skip the check (backwards compatible).

The signed HMAC token payload gets a new field:

```json
{
  "mt5_account": 12345,
  "expires_at": "2026-05-28T00:00:00Z",
  "issued_at": "2026-04-28T12:00:00Z",
  "valid_until": "2026-04-29T00:00:00Z",
  "intended_account_type": "live"
}
```

`TOKEN_VALIDITY_MS` changes from `72 * 60 * 60 * 1000` to `12 * 60 * 60 * 1000`.

### EA Changes

**Defines.mqh:** Add `LICENSE_WRONG_ACCOUNT_TYPE` to `ENUM_LICENSE_STATE`.

**LicenseManager.mqh:**

- New member: `string m_token_intended_account_type` (parsed from signed payload)
- `ParsePayload()`: extract `intended_account_type` from token (string or null)
- `FetchAndStoreToken()`: parse `"account_type_mismatch"` rejection reason, set `LICENSE_WRONG_ACCOUNT_TYPE` with message "Invalid Account"
- `FetchAndStoreToken()` after ParsePayload: compare `m_token_intended_account_type` against `m_account_type` — reject if mismatch or contest
- `LoadCachedToken()`: same comparison after parsing cached payload — enforces gate from cache, no server call needed
- `OnTimer()`: bug fix (one-line change described above)

### Dashboard Changes

**`lib/types.ts`:** Add `intended_account_type: AccountType | null` to License interface.

**`lib/schemas.ts`:** Add `intended_account_type` to `createLicenseSchema` (required: `"demo"` | `"live"`) and `updateLicenseSchema` (optional).

**`components/license-form.tsx`:** Add Account Type dropdown (Demo, Live). Required on create. Shown on edit.

**`app/api/licenses/route.ts`:** Include `intended_account_type` in POST insert.

**`app/api/licenses/[id]/route.ts`:** Include `intended_account_type` in PATCH update.

## Files Changed

### EA repo (`JSONFX-IMPULSE`)

| File | Change |
|------|--------|
| `Include/CopyTraderX-Impulse/Defines.mqh` | Add `LICENSE_WRONG_ACCOUNT_TYPE` enum value + string mapping |
| `Include/CopyTraderX-Impulse/LicenseManager.mqh` | OnTimer fix, parse intended_account_type, enforce gate in cache + fresh paths |
| `supabase/migrations/20260428000001_add_intended_account_type.sql` | New column |
| `supabase/functions/validate-license/index.ts` | Account-type mismatch check, add to payload, 12h cache |
| `supabase/functions/validate-license/types.ts` | Add `account_type_mismatch` to failure reasons |

### Dashboard repo (`copytraderx-license`)

| File | Change |
|------|--------|
| `lib/types.ts` | Add `intended_account_type` to License |
| `lib/schemas.ts` | Add to create + update schemas |
| `components/license-form.tsx` | Account Type dropdown |
| `app/api/licenses/route.ts` | Pass on create |
| `app/api/licenses/[id]/route.ts` | Pass on update |
