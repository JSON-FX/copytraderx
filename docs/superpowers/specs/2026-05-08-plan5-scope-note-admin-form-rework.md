# Plan 5 Scope Note — Modernize Admin License Create Form

- **Date:** 2026-05-08
- **Status:** Note (not a full spec — a scope addendum for Plan 5 to fold in)
- **Related:** `2026-05-06-admin-client-roles-design.md` §6 (admin user flows), §10 (migration plan), §11 (file layout). Folded into Plan 5 per session decision 2026-05-08.

## Context

When we wrote the roles spec (2026-05-06), the only writer to the `licenses` table was the admin's "Create License" form at `/admin/licenses/new`. Plans 1 + 2 moved that page under `/admin/*` and added the multi-product amendment but otherwise left the form's shape alone. Plan 4 then built the user-side request/claim flow, which became the **canonical** way licenses are issued: admin approves a subscription, user claims live + demo slots by typing MT5 numbers themselves.

The admin form survived because Plan 4 explicitly carved it out as Plan 5's problem ("admin-direct license create path's synthetic-subscription branch — Plan 5 replaces it"). Plan 4 also kept the synthetic-subscription fallback alive in `app/api/licenses/route.ts` for the same reason.

During Plan 4 close-out the user reviewed the form (`/admin/licenses/new`) and flagged three real conflicts with the post-Plan-4 model:

1. **`Account Type` (demo/live) is redundant.** The user-side request model issues a subscription that entitles the user to both a live and a demo slot. So an admin who creates a license via this form is implicitly making the demo/live decision *for* the user, which contradicts how every other path works.
2. **`MT5 Account Number` at the admin level is questionable.** The admin shouldn't need to know the MT5 number; that's user-supplied at slot-claim time.
3. **`License Key` display at the form level is premature.** Keys are minted at slot-claim time in the user flow. Showing the key on the admin form predates that decision.

Plan 5 was already going to replace this path. This note formalizes what "replace" means so the design isn't re-litigated in the next session.

## Scope (Plan 5 should cover)

The admin-direct license create flow is replaced with an **admin-direct subscription create flow**, and the old form is retired.

### What admin actually needs

The real admin use cases for direct creation are:

- **Provision a paid customer who hasn't gone through the request flow** (e.g. they paid out-of-band; admin spins them up directly).
- **Comp / VIP / internal accounts** (no charge, just grant access).
- **Migration / backfill of legacy users** (the synthetic-legacy-admin pattern from Plan 2 is the kludge for this; a real "Reattach to user" admin UI replaces it — already in Plan 5's scope as the "Reattach legacy license" task).

None of these need MT5 numbers or account-type pickers at the admin level. They need: pick a user, pick a product, pick a tier, write a `subscriptions{status='active', approved_at=now(), expires_at=now()+tier_duration}` row, and let the user claim MT5 slots themselves.

### Concrete changes Plan 5 should ship

1. **New page: `/admin/subscriptions/new`.** Form fields:
   - **User** (required): autocomplete from `public.users`. Or a "Create user inline" link that opens `/admin/users/new` in a new tab.
   - **Product** (required): the existing 5-product dropdown.
   - **Tier** (required): monthly / quarterly / yearly.
   - **Notes** (optional): free-text passed to `subscriptions.notes`.
   - **Push interval** (optional, with default 10): per-subscription policy. Lives at `subscriptions` level, not licenses level (Plan 5 schema migration territory — see §"Schema follow-ups" below).
   - **Propfirm rule** (optional): same — per-subscription policy.
2. **API: `POST /api/subscriptions/admin-create`** (admin-only). Validates with a new `adminCreateSubscriptionSchema`, inserts `subscriptions{status='active', approved_at=now(), approved_by=admin, expires_at=calculateExpiresAt(tier, now())}`. Returns 201 with the row.
3. **Old `/admin/licenses/new` retired.** Redirect to `/admin/subscriptions/new` for a release or two so any bookmarked links land somewhere sensible. Then remove. The route file at `app/admin/licenses/new/page.tsx` deletes.
4. **Old `POST /app/api/licenses/route.ts`** — admin-direct insert path goes away. The route file's POST handler either deletes or returns 410 Gone with a pointer to the new endpoint. The `legacy@copytraderx.local` synthetic-admin user can stay in the DB (it still owns the legacy backfill rows from Plan 2) but no new code writes to it.
5. **Drop `Account Type` from any admin path** that feeds new licenses. It still lives on the `licenses` table per row (`intended_account_type`) and is set automatically at slot-claim time based on which slot the user clicked (live → `intended_account_type='live'`, demo → `'demo'`). The admin doesn't pick it.
6. **License key display moves to slot-claim time.** Plan 4's `/api/licenses/claim` already mints the key server-side; the admin no longer needs the regenerate button. The shared `lib/license-key.ts` module stays as-is.

### Schema follow-ups (Plan 5)

The current `licenses` table carries `push_interval_seconds` and `propfirm_rule_id` per row. After this rework, those settings are admin-set per **subscription**, not per license. Two options:

- **Option A (recommended):** Move `push_interval_seconds` and `propfirm_rule_id` columns to `subscriptions`. The `licenses` table no longer carries them. Slot claims copy nothing — the EA reads via the licenses → subscriptions join. Cleaner model, one schema migration, one EA-side query change.
- **Option B:** Keep them on `licenses`. Slot-claim copies from `subscriptions` to `licenses` at insert time. More duplication; matches existing convention.

Plan 5 should pick A or B during its own brainstorm. A is simpler going forward; B is less invasive to ship.

### What stays the same

- `/admin/licenses` (the **list** page, not the new page) keeps working. It already reads from `public.licenses` and renders the post-Plan-2 schema correctly.
- `/admin/licenses/[id]` (the edit page) keeps working for **post-issue** edits — admin still needs to set `expires_at`, override `intended_account_type` (rare but possible per spec §5.3), or revoke individual licenses.
- The "Reattach to user" admin UI (already in Plan 5 scope) is unaffected by this note. It operates on existing license rows, not the create flow.

### Out of scope (still)

- Bulk admin create / CSV import (spec §3 non-goal).
- Self-service tier upgrades (replaced by Plan 6's extension flow for users).
- Payment integration (still out-of-band).

## Why this lives in Plan 5, not Plan 6

Plan 6 scope is **user-initiated extension of active subscriptions**. The admin form rework is **admin-initiated subscription creation**. They share zero data flow and zero state machine. Folding them into Plan 6 would dilute its focus and force the implementation order to wait on admin-form work that isn't blocking extensions.

Plan 5 already owned the synthetic-subscription replacement — this note formalizes the user-experience shape of that replacement so the next session doesn't re-derive it.

## Open questions (resolve during Plan 5 brainstorm)

- Whether to make the "User" picker a typeahead vs. a `<select>` of all users. Probably typeahead once user count exceeds ~50.
- Whether admin-direct creation should also generate a welcome email to the user ("you've been granted a new subscription"). The roles spec §6.4 emails the *admin* on user request; the inverse direction isn't defined. Likely yes, with a new `sendSubscriptionGrantedEmail` sender.
- Whether the deprecated `/admin/licenses/new` route should redirect immediately or stay alive with a banner ("This page is deprecated — use /admin/subscriptions/new") for one release. Probably redirect — there's only one admin and they'll learn fast.
- Whether `push_interval_seconds` / `propfirm_rule_id` move to `subscriptions` (Option A above) or stay on `licenses` (Option B). The brainstorm should pick.
