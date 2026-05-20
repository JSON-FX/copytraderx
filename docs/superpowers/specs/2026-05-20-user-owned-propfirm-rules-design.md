# User-Owned Propfirm Rules — Design

**Date:** 2026-05-20
**Status:** Draft (pending user review)
**Owner:** Jayson
**Affects:** `propfirm_rules` table (schema + RLS), `/api/propfirm-rules/*`, `/api/subscriptions/[id]` (PATCH), `/admin/propfirm-rules/*` (deleted), new `/dashboard/propfirm-rules/*`, `components/journal/passer-headline-cards.tsx`, `components/admin/subscription-policy-form.tsx`, `app/admin/users/[id]/page.tsx`, `components/site-nav.tsx`.

## Goal

Move `propfirm_rules` from a global admin-managed list to a per-user resource:
each user creates their own rules and assigns them to their own subscriptions.
The "Single-admin" framing in `CLAUDE.md` becomes the legacy state — admin
remains the operator of the licensing/subscription side, but users own the
challenge-rule side of their journey.

Why: today a non-admin user staring at the "Challenge Progress · —" empty
state on their own journal has no way to act. They must email the admin and
wait. After this change, the user creates a rule and assigns it themselves;
the admin's role narrows to license/subscription provisioning.

## Non-goals

- Sharing rules between users (no "template library", no "publish my rule").
- Versioning history of rule edits.
- Per-account rules. The relationship stays one rule per subscription;
  the live + demo licenses inside a subscription share the rule.
- A pre-subscription rule wizard. Onboarding stays "create subscription →
  create rule → assign", in that order. Can revisit later.
- Soft-delete with restore. Delete is permanent (rows are gone, FK sets to null).
- Migrating existing rules to anyone other than the admin user
  (`jayson@voltcontent.com`). They become the admin's personal rules.

## Locked design decisions

| Area | Decision |
|---|---|
| Ownership model | Pure per-user. Every row has `user_id NOT NULL`. No "global template" tier. |
| Migration of existing rules | Looked up by email — `(select id from auth.users where email = 'jayson@voltcontent.com')`. The migration `RAISE EXCEPTION` if the lookup returns NULL so we don't silently lose data. |
| Admin's own rules | Live in `/dashboard/propfirm-rules` just like any other user's. |
| `/admin/propfirm-rules` admin pages | Deleted. Returning 404 is fine — site nav update means no internal links remain. |
| Admin operating on another user's subscription | The admin assigning from `/admin/users/[id]` picks from the **target user's** rules only. If empty, the dropdown is empty with a hint. |
| Rule-creation on a user's behalf (admin-impersonation) | **Out of scope.** If admin wants to seed a user, they coach the user through `/dashboard/propfirm-rules/new`. Defer until support pain materializes. |
| Delete semantics | `ON DELETE SET NULL` on `subscriptions.propfirm_rule_id`. Deleting a rule that's in use detaches it; affected journals flip to the empty Challenge Progress card. |
| Name uniqueness | `UNIQUE (user_id, name)`. Two users may both have "FTMO 100k Phase 1"; one user cannot have two. |
| Subscription↔rule cardinality | Unchanged. `subscriptions.propfirm_rule_id` (nullable, single FK). Multiple subscriptions may share one rule. |
| API auth posture | Fixed in the same PR. All `/api/propfirm-rules*` routes require an authenticated user; ownership enforced at the API and reinforced by RLS. |
| RLS role check | Uses Postgres `auth.jwt() -> 'app_metadata' ->> 'role'` (matches the existing `extractRole` JS helper which reads `app_metadata.role`). |
| Service-role usage | Stops being a "skip auth" shortcut for these routes. Service role is still used inside `lib/journal/queries.ts` so RLS doesn't need to cover server-internal callers, but the helpers now require a `userId` argument — there is no "give me all rules" anymore. |

## Background — current state

- `propfirm_rules` is a single global table with no `user_id` column.
  RLS is enabled but no policies exist; all reads/writes go through the
  service role from `getSupabaseAdmin()`.
- API routes (`app/api/propfirm-rules/route.ts`,
  `app/api/propfirm-rules/[id]/route.ts`) have **no auth check at all**.
  Any logged-in user who calls them directly can CRUD any rule.
  Hidden by admin-only nav, but a latent vuln.
- Assignment goes through `PATCH /api/subscriptions/[id]` which IS gated
  to admin role (`extractRole({ user }) !== "admin"` → 403).
- Two consumers of rules: `lib/journal/queries.ts` (server-side list/get
  for journal evaluation) and the admin pages at `/admin/propfirm-rules`.

## Architecture overview

```
┌─ Authenticated user ──────────────────────────────────────────────────┐
│                                                                       │
│  ┌─ /dashboard/propfirm-rules ────────────────────────────────────┐  │
│  │  list / new / [id] edit — RLS scopes to auth.uid()             │  │
│  │  reuses components/propfirm-rules/{rules-table,rule-form}.tsx  │  │
│  └────────────────────────────────────────────────────────────────┘  │
│                                                                       │
│  ┌─ /dashboard/licenses/[id] (journal) ───────────────────────────┐  │
│  │  PasserHeadlineCards · Challenge Progress card                 │  │
│  │  ├─ rule assigned   → existing progress UI                     │  │
│  │  └─ rule = null     → INLINE SELECT picker (this design)       │  │
│  └────────────────────────────────────────────────────────────────┘  │
└───────────────────────────────────────────────────────────────────────┘

┌─ Admin (also a regular user; admin role lifts row visibility) ────────┐
│  /admin/users/[id]                                                    │
│  └─ UserSubscriptionsPanel · SubscriptionPolicyForm                  │
│     dropdown is now scoped to the target user's rules                 │
└───────────────────────────────────────────────────────────────────────┘
```

## Schema migration

Single migration in the EA repo:
`~/Documents/development/EA/JSONFX-IMPULSE/supabase/migrations/20260520000001_propfirm_rules_per_user.sql`.

```sql
-- 20260520000001_propfirm_rules_per_user.sql
-- Move propfirm_rules from a global admin-managed list to per-user ownership.

-- 1. Look up the admin user by email (fail loud if missing).
do $$
declare
  admin_id uuid;
begin
  select id into admin_id from auth.users where email = 'jayson@voltcontent.com';
  if admin_id is null then
    raise exception 'Migration aborted: admin user jayson@voltcontent.com not found in auth.users';
  end if;

  -- 2. Add owner column, NULLable initially so we can backfill.
  alter table propfirm_rules
    add column if not exists user_id uuid references auth.users(id) on delete cascade;

  -- 3. Backfill all existing rules to the admin user.
  update propfirm_rules set user_id = admin_id where user_id is null;

  -- 4. Enforce NOT NULL going forward.
  alter table propfirm_rules alter column user_id set not null;
end$$;

-- 5. Per-user name uniqueness.
alter table propfirm_rules
  add constraint propfirm_rules_user_name_uniq unique (user_id, name);

-- 6. Index for the common (user_id) access pattern.
create index if not exists propfirm_rules_user_id_idx on propfirm_rules(user_id);

-- 7. Subscription FK: switch to ON DELETE SET NULL.
alter table subscriptions
  drop constraint if exists subscriptions_propfirm_rule_id_fkey,
  add constraint subscriptions_propfirm_rule_id_fkey
    foreign key (propfirm_rule_id) references propfirm_rules(id) on delete set null;

-- 8. Update table comment to reflect the new ownership model.
comment on table propfirm_rules is
  'Per-user propfirm rule presets. Owned by the user_id who created them. '
  'Assignable to that user''s subscriptions via subscriptions.propfirm_rule_id. '
  'Drives the journal Objectives tab evaluation.';

-- 9. RLS — table already has RLS enabled, just no policies. Add four.
--    The role check matches lib/role.ts extractRole which reads app_metadata.role.

create policy propfirm_rules_select_own
  on propfirm_rules for select
  using (
    auth.uid() = user_id
    or (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
  );

create policy propfirm_rules_insert_own
  on propfirm_rules for insert
  with check (auth.uid() = user_id);

create policy propfirm_rules_update_own
  on propfirm_rules for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy propfirm_rules_delete_own
  on propfirm_rules for delete
  using (auth.uid() = user_id);

-- Admins can SELECT all (for /admin/users/[id]). Admins do NOT need write
-- policies — they don't create/update/delete on behalf of other users in
-- this iteration. If support workflow demands it later, add them.
```

Notes on the migration:

- The `do $$ ... end$$` block keeps the admin lookup, backfill, and NOT NULL
  promotion atomic. If the email lookup fails, nothing is changed.
- `add column if not exists` / `create index if not exists` / `drop constraint
  if exists` make the migration re-runnable in dev. Postgres prod migrations
  are still single-shot.
- The existing `licenses.propfirm_rule_id` column does NOT exist — the FK
  lives on `subscriptions`. The migration only touches that one FK.
- We do not touch the existing column comments / check constraints on
  `propfirm_rules`. They stay.

## API changes

### `app/api/propfirm-rules/route.ts`

**Before:** No auth. `GET` returns every rule. `POST` writes any payload.

**After:**

```ts
// GET /api/propfirm-rules
// Returns the caller's own rules. If caller is admin and ?user_id=<uuid>
// is provided, returns that user's rules instead. No ?user_id and admin
// still gets their own rules (admin is also a user).
export async function GET(req: Request) {
  const ssr = await getSupabaseSSR();
  const { data: { user } } = await ssr.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const url = new URL(req.url);
  const queryUserId = url.searchParams.get("user_id");
  let targetUserId = user.id;
  if (queryUserId && queryUserId !== user.id) {
    if (extractRole({ user }) !== "admin") {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
    targetUserId = queryUserId;
  }

  return NextResponse.json(await listPropfirmRules(targetUserId));
}

// POST /api/propfirm-rules
// Forces user_id = caller.id. No admin-impersonation in this PR.
export async function POST(req: Request) {
  const ssr = await getSupabaseSSR();
  const { data: { user } } = await ssr.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const body = /* parse + zod */;
  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .from("propfirm_rules")
    .insert({ ...body, user_id: user.id })
    .select().single();
  // ... error handling
}
```

### `app/api/propfirm-rules/[id]/route.ts`

`GET`, `PATCH`, `DELETE` — each fetches the row first to check ownership.
Returns 404 (not 403) when the row belongs to someone else, to avoid leaking
the existence of other users' rule IDs to non-admins.

```ts
async function loadOwnedRule(id: number, callerId: string, callerRole: Role | null) {
  const sb = getSupabaseAdmin();
  const { data, error } = await sb.from("propfirm_rules").select("*").eq("id", id).maybeSingle();
  if (error || !data) return null;
  if (data.user_id !== callerId && callerRole !== "admin") return null;
  return data;
}
```

The admin path lets ops users `GET`/`PATCH`/`DELETE` any rule (e.g., for
data-cleanup support). The intent is "admin can see and fix"; *creation* on
a user's behalf is still out of scope.

### `app/api/subscriptions/[id]/route.ts` (PATCH)

Currently admin-only. Relaxed to:

- Allow PATCH when caller is admin **OR** caller is the subscription owner.
- When setting `propfirm_rule_id` to a non-null value, verify the target rule's `user_id`
  matches the subscription's `user_id`. Otherwise → 400 `rule_owner_mismatch`.
- When setting `propfirm_rule_id` to `null`, no check.
- When changing `push_interval_seconds`, keep the existing admin-only gate
  (that's a system-level dial, not a user preference).

### `lib/journal/queries.ts`

- `listPropfirmRules()` → `listPropfirmRules(userId: string)`. Caller must
  pass an owner. Admin contexts that need "all rules across users" should
  build that query inline — no helper for it, since the only real consumer
  is the admin-impersonation use case in `/admin/users/[id]` (which already
  has the target user_id in scope).
- `getPropfirmRule(id)` keeps the same signature; the access-control check
  lives in the API route, not the query helper.

## Pages and components

### New: `/dashboard/propfirm-rules`

Three thin server pages that load data and pass it to existing client components:

```
app/dashboard/propfirm-rules/
├── page.tsx           # list + "+ New rule" CTA
├── new/page.tsx       # create form
└── [id]/page.tsx      # edit form
```

Each authenticates the user (`getSupabaseSSR().auth.getUser()`), redirects
to `/login` if missing, and fetches via `listPropfirmRules(user.id)` /
`getPropfirmRule(id)` (with an ownership check after fetch).

UI reuse:

- `components/propfirm-rules/rules-table.tsx` — already a generic
  presentational table. Inspect for hard-coded admin links during
  implementation; if any, parameterize the row link prefix.
- `components/propfirm-rules/rule-form.tsx` — already a generic form.
  Posts to `/api/propfirm-rules` (create) or `/api/propfirm-rules/[id]`
  (edit). No changes expected.

If either component carries admin-specific assumptions (e.g., POSTing then
redirecting to `/admin/propfirm-rules`), introduce a `basePath` prop and
the dashboard pages pass `/dashboard/propfirm-rules`.

### Updated: `components/journal/passer-headline-cards.tsx`

The empty-state Challenge Progress card is no longer a dashed-empty
read-only card with a text hint — it becomes the **assignment surface**.

Behavior matrix:

| Viewer | Rule? | Card shows |
|---|---|---|
| Subscription owner | null | Inline `<RuleAssignPicker subscriptionId={…} userRules={…} />` — Select + "Create new rule…" footer option |
| Subscription owner | set  | Normal Challenge Progress card + small "Change rule" icon button that re-opens the picker |
| Admin (not the owner) | null | Same picker, but rules list = the subscription owner's rules, not admin's |
| Admin (not the owner) | set  | Normal card + "Change rule" |
| Non-owner non-admin (impossible today) | any | Plain "No challenge rule assigned" text, no controls |

New component: `components/journal/rule-assign-picker.tsx`. Inputs:
`subscriptionId`, `userRules: PropfirmRule[]`, optional `currentRuleId`,
optional `ownerUserId` (when admin acts on behalf — drives the "Create new
rule…" link's `?user_id=…` query param so a fresh rule lands under the
right user). On submit: PATCH `/api/subscriptions/[id]` with the chosen
`propfirm_rule_id`; on success, `router.refresh()`.

The picker is **client-side** and lives inside the existing client tree.
The user's rules list is fetched server-side and passed down through
`JournalShell` so we don't introduce a new client fetch.

### Server data flow update

`app/dashboard/licenses/[id]/page.tsx` already fetches `rule` and license.
Add one parallel fetch:

```ts
// Only fetch the owner's rules if this is a Prop Passer license — small win
// for other products that don't render the picker.
const ownerRules = license.product === "ctx-prop-passer"
  ? await listPropfirmRules(license.user_id)
  : [];
```

Pass `ownerRules` through `JournalShell` → `LiveAccountPanel` →
`PasserHeadlineCards` → `RuleAssignPicker`.

### Updated: `/admin/users/[id]/page.tsx`

Currently calls `await listPropfirmRules()` (now requires an arg). Change to:

```ts
const rules = await listPropfirmRules(targetUser.id);
```

`SubscriptionPolicyForm` receives the same `rules` prop shape; no
client-side change. UI when `rules.length === 0`: a one-line hint above
the Select reading "User has no rules yet — ask them to create one in
their dashboard."

### Removed: `/admin/propfirm-rules`

- `app/admin/propfirm-rules/page.tsx` — delete.
- `app/admin/propfirm-rules/new/page.tsx` — delete.
- `app/admin/propfirm-rules/[id]/page.tsx` — delete.

Replace each deleted route with a one-line `redirect()` stub so bookmarks /
open tabs land on `/dashboard/propfirm-rules`. The stubs are deleted in a
follow-up cleanup PR after a sensible grace period.

### Updated: `components/site-nav.tsx`

- Remove "Propfirm Rules" from the admin-only section.
- Add "Propfirm Rules" to the always-visible (logged-in) section,
  pointing at `/dashboard/propfirm-rules`.

## Data flow (the end-to-end "user creates and assigns" path)

```
1. User navigates to /dashboard/propfirm-rules (nav link).
2. Empty state → clicks "+ New rule" → /dashboard/propfirm-rules/new.
3. Fills form → POST /api/propfirm-rules
   → auth.uid() = user.id, RLS allows insert, returns new row.
4. Redirects back to /dashboard/propfirm-rules — table now has one row.
5. User navigates to /dashboard/licenses/<id>.
   getServerSideProps fetches:
     - license + subscription
     - propfirm rule (null today)
     - listPropfirmRules(license.user_id) — returns [the rule from step 3]
6. JournalShell renders. Product = ctx-prop-passer.
   PasserHeadlineCards sees rule=null + ownerRules=[1 rule].
   Empty Challenge Progress card renders <RuleAssignPicker>.
7. User picks the rule from the dropdown → PATCH /api/subscriptions/<id>
   with { propfirm_rule_id: <id> }.
   Endpoint verifies caller.id === subscription.user_id (or admin),
   AND rule.user_id === subscription.user_id. Saves.
8. router.refresh() → page re-fetches with the assigned rule.
   PasserHeadlineCards now sees rule set → renders the full Challenge Progress card.
```

## Edge cases (covered by tests)

- **Migration with no matching admin email** → migration raises and rolls back.
  Caught manually before pushing to prod (we'd see the error in `supabase db push`).
- **User deletes a rule with N subscriptions pointing to it** → FK SET NULL
  detaches; affected journals flip to empty Challenge Progress card with picker.
  No 500.
- **User creates two rules with the same name** → DB rejects with the
  unique-constraint name; UI surfaces "A rule with that name already exists".
- **Admin assigns a rule that belongs to user A to user B's subscription** →
  PATCH endpoint returns 400 `rule_owner_mismatch`. Surfaces in
  `SubscriptionPolicyForm` toast as "Rule belongs to a different user."
- **Non-admin tries `/api/propfirm-rules?user_id=<someone-else>`** → 403.
- **Non-admin tries `GET /api/propfirm-rules/<id>` for a rule they don't own**
  → 404 (deliberately, not 403 — don't confirm the row exists).
- **Admin viewing a target user with zero rules** → `SubscriptionPolicyForm`
  dropdown shows only "(none)" + a one-line hint above it: "User has no
  rules yet — ask them to create one in their dashboard."
- **Race: two browser tabs both pick a different rule for the same
  subscription** → last write wins. No locking. Acceptable.
- **Rule deleted after the SSR fetch but before the PATCH** → PATCH endpoint
  re-fetches the rule, gets 404, returns 400. UI shows a toast and
  router.refresh()es the now-stale page.
- **Existing `propfirm_rules.id = 1` is still globally unique** — no per-user
  ID renumbering. Acceptable since RLS hides rows from non-owners.

## Testing

Unit tests (Jest):

- `lib/journal/queries.test.ts` — `listPropfirmRules(userId)` now requires
  the arg; existing tests get updated.
- New schema-level tests are skipped; we lean on the migration being
  reviewable as SQL.

API integration tests (the project uses `lib/*.test.ts` for these — same
pattern as `lib/admin-subscriptions.test.ts`):

- `app/api/propfirm-rules/route.test.ts` (new) — GET as user / GET as admin
  with `?user_id` / POST forces user_id / unauthenticated 401.
- `app/api/propfirm-rules/[id]/route.test.ts` (new) — GET/PATCH/DELETE
  ownership matrix: own rule ok, other user's rule → 404 for user / ok
  for admin; PATCH validates payload; DELETE detaches subscriptions.
- `app/api/subscriptions/[id]/route.test.ts` — extend existing PATCH test:
  owner can now set propfirm_rule_id; rule-owner-mismatch returns 400;
  push_interval_seconds still admin-only.

Component tests:

- `components/journal/rule-assign-picker.test.tsx` — renders with empty
  rules list (shows "Create your first rule"); renders with rules
  (picker is functional); PATCH on submit; surfaces errors as toasts.
- `components/journal/passer-headline-cards.test.tsx` — extend with the
  picker variant: rule=null + ownerRules.length>0 renders `<Select>` not
  plain text.

Manual smoke (after deploy):

- Create a rule as a non-admin user → assign to a Prop Passer subscription
  → see Challenge Progress card populate.
- Delete a rule that's currently assigned → journal card flips back to
  picker (with detached state).
- Admin opens `/admin/users/<some-user>` → sees the user's rules in the
  policy form dropdown (empty if they haven't created any).

## Rollout

- Single PR. Migration in the EA repo lands first (`supabase db push`).
  Then this repo's PR merges. There is a brief window where the migrated
  DB is running with the old code — `propfirm_rules.user_id` is now
  populated and required by NOT NULL, but the old code never sets it.
  → Mitigation: deploy the migration during a quiet period; the existing
  code path doesn't INSERT into `propfirm_rules` outside admin flow,
  and you (the admin) won't be creating rules during the deploy window.
- README's "Pending app migrations" section updated to point at the new
  file in the EA repo.
- `update-kb` after shipping captures: per-user ownership, RLS policies,
  the deletion of `/admin/propfirm-rules`.

## Open follow-ups (out of scope)

- Admin "Create rule on behalf of <user>" — add when support workflow
  needs it. Schema already supports it (we'd just allow `user_id` in the
  POST payload when caller is admin).
- Rule cloning ("Use this as a template") — add when users start asking.
- Rules page filters/search — defer until a user has > ~10 rules.
- Pre-subscription rule picker in the Request License dialog — defer.
- Permissive RLS for service-role-bypassing helpers — current model
  (service role + caller passes user_id) is fine; revisit if we ever
  expose direct PostgREST.
