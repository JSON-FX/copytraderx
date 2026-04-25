# License Activation & Liveness — Design

**Date:** 2026-04-25
**Status:** Draft, awaiting user review
**Repos touched:** `copytraderx-license` (admin UI), `JSONFX-IMPULSE` (EA + edge function + migrations)

## Problem

Today the subscription clock starts at row creation. If a customer buys a Monthly today and installs the EA two weeks later, they lose two weeks. The admin UI also has no way to tell whether a license is currently in use — `last_validated_at` exists but isn't surfaced as a status, and there's no "first seen" signal at all.

This design adds:

1. **Deferred activation.** `expires_at` is null at creation and stamped to `activated_at + tier_duration` on the EA's first successful validation.
2. **Liveness status.** A derived badge — Not activated / Online / Stale / Offline — based on `activated_at` and `last_validated_at`.
3. **Manual activation override.** An admin button to start the clock when needed.

## Out of scope (but bundled)

Lifetime tier removal. The codebase has dead `lifetime` paths (tier enum, badge variant, form option, EA token payload `expires_at: 0`). We're already in the tier/expiry code, so we delete it in the same change. Listed under §7 below.

## Schema

One new column on `public.licenses`:

```sql
alter table public.licenses
  add column activated_at timestamptz;

create index idx_licenses_activated
  on public.licenses (activated_at);
```

Migration filename: `20260426000002_add_activated_at.sql` in the EA repo.

`expires_at` semantics change: previously non-null at insert (admin UI computed it from tier). After this change, `expires_at` is null until the first successful validation OR until the admin clicks "Activate now."

`tier` stays required at row creation — it drives the eventual expiry computation.

## Edge function (validate-license)

In `supabase/functions/validate-license/index.ts`, after the existing revoked/expired checks pass:

1. Read `activated_at` and `tier` from the row (extend the `select`).
2. If `activated_at IS NULL`:
   - If `tier IS NULL` → return `valid:false, reason:"not_configured"` (new reason code).
   - Otherwise compute `activatedAt = now()`, `expiresAt = activatedAt + tierDuration(tier)`.
3. Fold `activated_at` and `expires_at` into the same UPDATE that already writes `last_validated_at` and `broker_name`. Single round-trip.
4. Sign the token with the *stamped* `expires_at` so the EA cache matches the DB from minute one.

A small `tierDuration(tier: string): number` helper lives next to the function (Deno) — duplicated from `lib/expiry.ts` rather than shared. It's a 6-line switch; not worth a package boundary.

EA-side change: `LicenseManager.mqh` already handles `reason:"expired"` and `reason:"not_found"`. Add a branch for `reason:"not_configured"` showing message "License is missing tier info — contact support." No other EA logic changes; the existing token cache flow is unaffected because the signed payload still has the same shape.

## Liveness derivation

Pure function `deriveLiveness(license, now)` in `lib/liveness.ts`:

```
revoked       — status = 'revoked'
expired       — expires_at < now
not_activated — activated_at IS NULL
online        — last_validated_at within last 13h
stale         — last_validated_at within last 72h but >13h
offline       — last_validated_at older than 72h, or never
```

Priority is top-down: revoked beats expired beats activation state.

Constants:
- `ONLINE_WINDOW_MS = 13 * 60 * 60 * 1000` (one EA revalidate cycle + ~1h grace)
- `STALE_WINDOW_MS = 72 * 60 * 60 * 1000` (matches EA cache window)

Badge colors:

| State | Color | Meaning |
|---|---|---|
| Online | green | EA pinged within last 13h |
| Stale | yellow | EA may still be running on cache; no recent ping |
| Offline | gray | EA hasn't validated in 72h+ |
| Not activated | gray | Sold but never used |
| Expired | orange | Past `expires_at` |
| Revoked | red | `status = 'revoked'` |

## Admin UI

**License list (`app/licenses/page.tsx` + `components/license-table.tsx`):**

- Replace today's separate status/last-validated columns with a single **Status** column showing the liveness badge plus a relative-time hint ("Online · 5m ago", "Stale · yesterday", "Not activated").
- Filter dropdown above the table: All / Online / Stale / Offline / Not activated / Expired / Revoked. Filter is client-side (the dataset is small enough).
- Sort by liveness state (priority order above) is the new default.

**License detail (`app/licenses/[id]/page.tsx`):**

- Add liveness badge to the header.
- When `activated_at IS NULL`, show a yellow callout: "Sold {N} days ago — customer hasn't activated yet." with an **Activate now** button. Click → confirm modal → server action sets `activated_at = now()` and `expires_at = now() + tierDuration(tier)`. Re-fetch the row after success.
- When `activated_at` is set, surface it in the read-only metadata section as "Activated: {date} ({N} days after purchase)."
- No "deactivate." If a wrong activation needs undoing, that's a manual SQL fix.

**License create form (`components/license-form.tsx`):**

- Stop computing `expires_at` on submit. The insert sends `expires_at: null`.
- Tier field stays required.
- Success toast: "License created. Expiry will be set when the customer first activates."

**Renew flow:**

- Unchanged math — bumps `expires_at` by tier duration.
- If `expires_at IS NULL` (license renewed before activation, weird but possible), use `now()` as the base. Do **not** stamp `activated_at`; that signal stays "first heard from EA."

## Server actions / API

New server action in `app/licenses/[id]/actions.ts` (or wherever existing actions live):

```ts
async function activateNow(id: number): Promise<void>
```

Reads `tier` from the row, computes `activated_at = now()` and `expires_at = activated_at + tierDuration(tier)`, updates both. Errors if `tier IS NULL` or row already activated. Revalidates the detail page.

The create-license action drops the `expires_at` computation. The renew action gains the null-`expires_at` fallback above.

## Tests

- `lib/liveness.test.ts` (new) — boundary cases at 13h and 72h, revoked-overrides-online, not-activated path, never-validated row.
- `lib/expiry.test.ts` — remove the `lifetime` case, keep monthly/quarterly/yearly.
- `lib/schemas.test.ts` — drop the `lifetime` tier assertions.
- Edge function `test.ts` — add cases: first-activation stamps `activated_at` + `expires_at` and signs with the stamped value; second activation leaves `activated_at` unchanged; null-tier returns `not_configured`.
- UI: no Jest coverage per project convention; verify visually.

## Lifetime removal (bundled cleanup)

Files touched:
- `lib/types.ts` — drop `"lifetime"` from `LicenseTier`.
- `lib/expiry.ts` — remove the `lifetime` case in `calculateExpiresAt`; tighten return type to `Date` (no longer nullable).
- `lib/schemas.ts` — drop `lifetime` from the tier enum.
- `components/tier-badge.tsx` — drop the lifetime variant.
- `components/license-form.tsx` — drop the lifetime option.
- `lib/expiry.test.ts`, `lib/schemas.test.ts` — drop lifetime assertions.
- README — drop "Lifetime" from the tier list in §"Adding a license."
- EA-side: `LicenseManager.mqh` comment "0 = lifetime" stays (it's still valid for legacy rows that might exist with `expires_at = null` outside the activation flow, e.g. mid-migration). No code change.

DB-side: existing rows with `tier = 'lifetime'` (if any) need a manual decision. Add a check to the migration: `select count(*) from licenses where tier = 'lifetime'` — if zero, proceed; if non-zero, fail loudly and require manual reconciliation. This is the safe default.

## Edge cases

| Case | Handling |
|---|---|
| Row created, customer never activates | Stays `Not activated` forever; no expiry; admin can revoke or delete normally. |
| Customer activates, EA stops, comes back 80h later | `Stale` → next ping flips to `Online`. No data loss. |
| Admin clicks "Activate now," then customer activates an hour later | Edge function sees `activated_at` already set, leaves it alone, just updates `last_validated_at`. |
| Renew on a not-yet-activated license | `expires_at` set to `now() + tier_duration`. `activated_at` stays null. Customer's clock effectively restarted on first ping (since EA computes a new expiry from its perspective — wait, no: EA only stamps when `activated_at IS NULL`. If renew set `expires_at`, the EA next time sees `activated_at IS NULL` and would re-stamp `expires_at = now() + tier`, overwriting the admin's renew. **Decision: renew also stamps `activated_at = now()` IF currently null,** to lock in the admin's intent. Updating §"Renew flow" accordingly. |
| Tier is null on a legacy row | Edge function returns `not_configured`. Admin must edit the row to add a tier before EA will validate. |

## Renew flow (revised)

- If `activated_at IS NULL`: set `activated_at = now()` AND `expires_at = now() + tierDuration(tier)`. Locks in the admin's "start the clock now" intent.
- If `activated_at` is set: leave it; bump `expires_at` by tier duration from current `expires_at` (or `now()` if somehow null).

## Migration order

1. EA repo: add migration `add_activated_at.sql` + edge function changes. Deploy edge function.
2. Admin UI: liveness derivation + UI changes + lifetime removal. Deploy.
3. Verify in prod: pick a recently-validated license, confirm `activated_at` got stamped on its next 12h cycle.

EA binary doesn't need a rebuild — the new `not_configured` reason is handled by adding a branch to existing string-match logic, but the EA already falls through to a generic "License invalid (unknown reason)" message if it sees an unrecognized reason. So untouched EAs in the field stay functional; we ship a new EA build at our convenience.

## Non-goals

- Real-time push from EA to server (websocket / SSE). Twelve-hour cadence stays.
- Multi-device per license. One MT5 account per row, unchanged.
- Activation analytics / dashboards. Just the list and detail views.
- Reactivation after expiry. Out of scope; renew handles it.
