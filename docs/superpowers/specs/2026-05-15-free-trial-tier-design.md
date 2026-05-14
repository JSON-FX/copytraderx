# Free Trial Tier — Design

**Date:** 2026-05-15
**Status:** Draft (pending user review)
**Owner:** Jayson

## Goal

Let the admin issue short-lived, throwaway trial licenses to leads (people
DMing on Telegram or Discord asking to try the EA) without granting them any
of the infrastructure built for paying subscribers — no auth account, no
journal, no dashboard, no renewals, no extensions. Primary objective is
audience-gathering and trust-building ahead of converting leads into paying
subscribers.

## Non-goals

- Public self-serve trial signup form. (Future work; out of scope here.)
- Email delivery of trial keys. The admin copies the key from the success
  screen and pastes it into the lead's TG/Discord DM manually.
- Automatic conversion / migration of lead data into `app_users`. Conversion
  is a manual two-step performed by the admin.
- Account-type restrictions (demo-only, etc). Trial licenses validate on any
  account type, same as paid licenses.
- Any anti-abuse measures beyond DB-level uniqueness (no IP tracking,
  fingerprinting, CAPTCHA, rate limiting, or fuzzy email matching). The admin
  is the human gate.

## Architectural choice: full isolation (Approach B)

Trials live in two new tables that have **no foreign keys** into
`app_users`, `subscriptions`, or `licenses`. The only soft link is a
nullable `converted_user_id` on `trial_leads` that points at `app_users` for
post-conversion funnel analytics — `ON DELETE SET NULL`, never joined in any
hot path.

Two alternatives were considered and rejected:

- **Approach A (add `"trial"` to `LicenseTier`, nullable FKs on `licenses`):**
  forces the main licenses table to relax its `subscription_id NOT NULL`
  invariant, which ripples through DashboardSubscription, extensions, and
  reattach flows. High blast radius for a feature that may not last.
- **Approach C (reuse `app_users` with a new `"lead"` role):** every existing
  admin query, RLS rule, journal page, and dashboard would need a defensive
  `role != 'lead'` filter. One missed filter leaks trials into subscriber
  views. Also requires creating auth users for leads, which the admin
  explicitly does not want.

Approach B is the only option that *structurally* guarantees the isolation
requirement. The duplication cost (one extra validate branch, one parallel
admin CRUD surface) is small and contained.

## Data model

Two new tables, both fully isolated from the existing schema.

### `trial_leads`

| Column                | Type                                                                       | Notes                                                  |
| --------------------- | -------------------------------------------------------------------------- | ------------------------------------------------------ |
| `id`                  | `bigserial PRIMARY KEY`                                                    |                                                        |
| `email`               | `citext NOT NULL`                                                          | unique (case-insensitive)                              |
| `telegram_handle`     | `text NULL`                                                                | unique when present (partial index)                    |
| `discord_handle`      | `text NULL`                                                                | unique when present (partial index)                    |
| `notes`               | `text NULL`                                                                | admin-only freeform                                    |
| `status`              | enum `trial_lead_status` (`active` \| `converted` \| `abandoned`)          | default `active`; admin-flipped                        |
| `converted_user_id`   | `uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL`                   | soft reference, set on "Mark converted"                |
| `created_at`          | `timestamptz NOT NULL DEFAULT now()`                                       |                                                        |
| `created_by`          | `uuid NULL REFERENCES auth.users(id)`                                      | the admin who issued the trial                         |

### `trial_licenses`

| Column                | Type                                                                       | Notes                                                  |
| --------------------- | -------------------------------------------------------------------------- | ------------------------------------------------------ |
| `id`                  | `bigserial PRIMARY KEY`                                                    |                                                        |
| `trial_lead_id`       | `bigint NOT NULL REFERENCES trial_leads(id) ON DELETE CASCADE`             |                                                        |
| `product`             | `text NOT NULL`                                                            | matches `lib/products.ts` PRODUCT_CODES                |
| `license_key`         | `text NOT NULL UNIQUE`                                                     | generated via existing `lib/license-key.ts`            |
| `mt5_account`         | `bigint NOT NULL`                                                          | **unique across `trial_licenses`** (hard-block dedupe) |
| `expires_at`          | `timestamptz NOT NULL`                                                     | set to `created_at + interval '7 days'` at insert      |
| `activated_at`        | `timestamptz NULL`                                                         | first successful EA validate                           |
| `last_validated_at`   | `timestamptz NULL`                                                         | every successful EA validate                           |
| `status`              | enum `trial_license_status` (`active` \| `revoked`)                        | `expired` is derived in queries via `expires_at < now()`, mirroring the existing `licenses` pattern |
| `broker_name`         | `text NULL`                                                                | reported by EA                                         |
| `account_type`        | enum `account_type` (`demo` \| `live` \| `contest`) NULL                   | reported by EA (no restriction enforced)               |
| `created_at`          | `timestamptz NOT NULL DEFAULT now()`                                       |                                                        |

### Invariants

- A trial license has no `tier`, no `subscription_id`, no `user_id`. It is
  bound to one `trial_lead` and one `mt5_account`. Nothing else.
- `expires_at` is set on insert and never extended. No renewal endpoint, no
  extension endpoint, no admin "extend trial" action.
- Hard-block dedupe is enforced at the DB level (see below), not just at the
  app level, so race conditions cannot slip a second trial through.
- `trial_leads.status = 'converted'` is purely informational; the system
  never auto-flips it.

### DB-level dedupe constraints

```sql
-- trial_leads
CREATE UNIQUE INDEX trial_leads_email_key
  ON trial_leads (lower(email));
CREATE UNIQUE INDEX trial_leads_telegram_key
  ON trial_leads (lower(telegram_handle))
  WHERE telegram_handle IS NOT NULL;
CREATE UNIQUE INDEX trial_leads_discord_key
  ON trial_leads (lower(discord_handle))
  WHERE discord_handle IS NOT NULL;

-- trial_licenses
CREATE UNIQUE INDEX trial_licenses_mt5_account_key
  ON trial_licenses (mt5_account);
CREATE UNIQUE INDEX trial_licenses_license_key_key
  ON trial_licenses (license_key);
```

All text comparisons are case-insensitive via `lower()`. TG and Discord use
partial unique indexes so multiple `NULL`s are allowed (leads who did not
share a handle).

## Admin UX

New top-level admin section `/admin/trials`, mirroring the shape of
`/admin/licenses` but fully isolated.

### Routes

- **`/admin/trials`** — list page. Table of trial licenses with their lead's
  contact info inlined. Columns: license key, product, MT5#, email, TG,
  Discord, account type (reported), liveness (derived from
  `last_validated_at`), expires-in (countdown), status. Filterable by
  status, product, expired/not. Default sort: `created_at DESC`.
- **`/admin/trials/new`** — single form to create both rows in one
  transaction. Fields: product (dropdown), MT5 account, email, telegram
  handle (optional), discord handle (optional), notes (optional).
- **`/admin/trials/[id]`** — detail page. Read-only license + lead info,
  plus actions: **Revoke**, **Mark converted**, **Mark abandoned**, **Copy
  license key**. No "extend" button. No "renew" button. Mistyped fields
  cannot be edited — revoke and re-issue instead.

### Nav placement

New sidebar entry **"Trials"** between **"Licenses"** and **"Requests"** in
`components/site-nav.tsx`.

### Hard separation

Trial licenses **never** appear on `/admin/licenses`. They **never** appear
on `/admin/subscriptions`. They **never** appear on any per-user page. The
Trials section is a parallel universe.

## API surface

All routes require admin role. RLS on the new tables denies access to
non-admins.

### `POST /api/admin/trials`

Create a trial lead + trial license in one transaction.

**Request body** (validated by `createTrialSchema`):

```ts
{
  product: Product,
  mt5_account: number,
  email: string,
  telegram_handle?: string | null,
  discord_handle?: string | null,
  notes?: string | null,
}
```

**Pre-insert dedupe check** runs first. The handler calls
`checkTrialDedupe(input)` which returns a per-field collision map. If any
match is found, the handler returns `409 Conflict` with:

```json
{
  "error": "duplicate_trial",
  "fields": {
    "mt5_account": { "trial_id": 12, "created_at": "2026-04-02T...", "status": "expired" },
    "email":       { "trial_id": 12, "created_at": "2026-04-02T...", "status": "expired" }
  }
}
```

The form renders one targeted error per offending field (e.g., *"MT5 account
12345678 already had a trial on 2026-04-02 (expired)"*).

**On success:**
1. Generate license key via existing `lib/license-key.ts` (unchanged).
2. Collision-check the generated key against both `licenses` and
   `trial_licenses` (one extra SELECT each; effectively-zero collision
   chance, this is a guard).
3. Insert `trial_leads` + `trial_licenses` in a single transaction with
   `expires_at = now() + interval '7 days'`.
4. Return `{ trial_lead, trial_license }` so the admin can copy the key.

**Race-condition fallback:** if two requests slip past the app-level check
simultaneously, the DB unique indexes raise — the handler maps the error
back to the same `duplicate_trial` shape and returns 409.

### `POST /api/admin/trials/[id]/revoke`

Sets `trial_licenses.status = 'revoked'`. Idempotent.

### `POST /api/admin/trials/[id]/convert`

Body: `{ converted_user_id?: uuid }`. In one transaction:

- `trial_leads.status` → `'converted'`
- `trial_leads.converted_user_id` → provided uuid (nullable)
- `trial_licenses.status` → `'revoked'`

### `POST /api/admin/trials/[id]/abandon`

Sets `trial_leads.status = 'abandoned'`. Does not touch the license (it will
expire naturally or has already been revoked).

### `POST /api/license/validate` (modified)

Existing endpoint gets one extra branch:

1. Look up `license_key` in `licenses` (existing path, unchanged). If found
   → existing verdict logic runs unchanged.
2. If not found, look up in `trial_licenses`:
   - Check `status != 'revoked'`.
   - Check `expires_at > now()`.
   - Check `mt5_account` matches.
   - On first success: stamp `activated_at = now()`.
   - On every success: stamp `last_validated_at = now()`, record
     `broker_name`, `account_type`.
   - Return the same response shape the EA expects. The EA cannot tell its
     license is a trial.
3. If found in neither table → invalid key.

**Lookup order rationale:** real licenses are the hot path (99% of validate
calls). Looking them up first also guarantees that during the conversion
overlap window — where a paid license exists alongside a not-yet-revoked
trial — the paid license takes precedence.

**Key format:** trial license keys use the same product-prefix format as
paid keys (e.g., `IMPX-...`). Distinguishing prefixes would force the EA
binary to know about trial status, which it should not.

## Lifecycle

### Day 0 — Trial issued

1. Lead DMs admin on TG/Discord asking to try the EA.
2. Admin collects MT5#, email, optional TG/Discord handle.
3. `/admin/trials/new` → `POST /api/admin/trials` → transaction creates
   `trial_leads` (status=`active`) + `trial_licenses` (expires_at = now +
   7d).
4. Admin copies the key from the success screen and pastes it into the DM.

### Days 1–7 — Trial running

- EA validates against `trial_licenses` (Section: API surface above).
  `activated_at` and `last_validated_at` update normally.
- Trial appears on `/admin/trials` with derived liveness state. Admin can
  see who is active, who never activated, who is about to expire.
- Admin can **Revoke** at any time → `status='revoked'`, EA validate fails
  immediately.

### Day 7 — Trial expires

- No background job needed. `expires_at < now()` causes EA validate to fail.
  The display status `expired` is derived in queries (`revoked` > date-based
  `expired` > `active`), mirroring the existing `licenses` pattern.
- The `trial_leads` row stays. The lead cannot get another trial because of
  the four dedupe rules.

### Conversion (lead → paid subscriber)

1. Lead DMs admin saying they want to subscribe.
2. Admin goes to **`/admin/users/new`** (existing flow, unchanged) and
   creates the real account: email, full name, role=`user`, and
   `initial_subscription` with chosen product + tier. Supabase emails the
   invite link to set a password.
3. Admin goes to **`/admin/trials/[id]`** and clicks **"Mark converted"**.
   Modal asks for the new `user_id` (typeahead of recent app_users). On
   save:
   - `trial_leads.status` → `converted`
   - `trial_leads.converted_user_id` → the new user_id
   - `trial_licenses.status` → `revoked` (so the old trial key cannot be
     used in parallel with the new real one)

### What is explicitly NOT done on conversion

- No automatic data migration from `trial_leads` into `app_users`. Admin
  retypes email/name in `/admin/users/new`. A few seconds of duplication
  preserves true orthogonality between the two systems.
- No "upgrade trial license" action. Trials are throwaway, period.
- No "Promote lead" prefill button on the trial detail page. (Considered;
  rejected to preserve the isolation guarantee.)

## TypeScript types

Added to `lib/types.ts` (new section, no edits to existing types):

```ts
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

## Zod schemas

Added to `lib/schemas.ts` (new section, no edits to existing schemas):

```ts
export const createTrialSchema = z.object({
  product: productEnum,
  mt5_account: z.number().int().positive(),
  email: z.string().trim().toLowerCase().email().max(254),
  telegram_handle: optionalNonEmpty,
  discord_handle: optionalNonEmpty,
  notes: optionalNonEmpty,
}).strict();

export const convertTrialSchema = z.object({
  converted_user_id: z.string().uuid().optional(),
}).strict();
```

## File-level plan (informational; concrete plan comes from writing-plans)

- `db/migrations/<timestamp>_create_trial_tables.sql` — new tables, enums,
  unique indexes, RLS policies (admin-only).
- `lib/types.ts` — append new types.
- `lib/schemas.ts` — append new schemas.
- `lib/trial-state.ts` (new) — pure status derivation helper.
- `lib/trial-dedupe.ts` (new) — pre-insert dedupe check.
- `app/api/admin/trials/route.ts` (new) — POST create.
- `app/api/admin/trials/[id]/revoke/route.ts` (new).
- `app/api/admin/trials/[id]/convert/route.ts` (new).
- `app/api/admin/trials/[id]/abandon/route.ts` (new).
- `app/api/license/validate/route.ts` — add trial branch after real-license
  miss.
- `app/admin/trials/page.tsx` (new) — list.
- `app/admin/trials/new/page.tsx` (new) — create form.
- `app/admin/trials/[id]/page.tsx` (new) — detail + actions.
- `components/site-nav.tsx` — add Trials entry.
- `components/trial-form.tsx` (new) — shared form component.
- `components/trial-table.tsx` (new).

## Testing strategy

Same shape as existing test suite — Vitest unit tests where possible,
server-route tests for API surfaces, one Playwright smoke for the admin
page.

### Unit tests (no DB)

- `lib/trial-schemas.test.ts` — `createTrialSchema` accepts valid payloads,
  rejects bad MT5#, bad email, missing required fields, transforms empty
  TG/Discord to `null`.
- `lib/trial-state.test.ts` — pure status derivation from `(expires_at,
  status)`. Mirrors `lib/subscription-state.test.ts`.
- `lib/trial-dedupe.test.ts` — `checkTrialDedupe` returns correct per-field
  collision map, ignores nulls for TG/Discord.

### Server-route tests (Vitest + Supabase test client)

- `POST /api/admin/trials` — happy path creates both rows in one tx, returns
  key.
- `POST /api/admin/trials` — each of 4 dedupe rules in isolation: MT5,
  email, TG, Discord. Each returns 409 with correct `fields` body.
- `POST /api/admin/trials` — non-admin returns 403.
- `POST /api/admin/trials/[id]/revoke` — sets status, idempotent.
- `POST /api/admin/trials/[id]/convert` — flips lead status, sets
  `converted_user_id`, revokes license, all in one tx.
- `POST /api/admin/trials/[id]/abandon` — flips lead status.
- `POST /api/license/validate` — trial branch returns expected shape for
  valid / expired / revoked / wrong-MT5 cases.
- `POST /api/license/validate` — real license takes precedence if same key
  exists in both tables (guard test for lookup order).
- `POST /api/license/validate` — broker_name and account_type updates write
  to `trial_licenses`.

### E2E smoke (Playwright)

- Log in as admin → `/admin/trials` → click "New trial" → fill form →
  submit → see success → see new trial in the list. Mirrors existing
  `e2e/admin-subscriptions-smoke.spec.ts`.

### Out of scope for tests

- No load test on validate (trial table is tiny; admin is throttle).
- No long-running expiry test (`expires_at` is query-time comparison; no
  scheduled job).

## Open questions

None at design-approval time. All clarifying questions answered before
writing this spec.

## Decisions log

- **2026-05-15:** Approach B (fully isolated tables) chosen over A
  (nullable FKs on licenses) and C (`role='lead'` on app_users).
- **2026-05-15:** Trials issued admin-only after TG/Discord DM; no public
  self-serve form in v1.
- **2026-05-15:** Throwaway leads; no auth account, no renewals, no
  extensions, revocable.
- **2026-05-15:** Hard-block dedupe on MT5#, email, TG, Discord (DB + app
  level).
- **2026-05-15:** No account-type restriction (trials work on demo, live,
  contest).
- **2026-05-15:** No email delivery; admin copies key from success screen.
- **2026-05-15:** Conversion is manual two-step (create user, mark
  converted); no prefill shortcut, preserving isolation.
- **2026-05-15:** Trial license keys use same product prefix as paid keys;
  EA cannot tell the difference.
