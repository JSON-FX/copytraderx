# User-Owned Propfirm Rules Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move `propfirm_rules` from a global admin-managed table to a per-user resource: each user creates, edits, and assigns their own rules; admin's role on this surface narrows to read-only oversight.

**Architecture:** One DB migration in the EA repo adds `user_id` + RLS policies + the FK `ON DELETE SET NULL`. The TS-side adapts by adding `userId` arguments to query helpers, gating API routes with the SSR session, scoping `/admin/users/[id]` rule lookups to the target user, and adding a new `/dashboard/propfirm-rules` page set that reuses the existing `RuleForm` / `RulesTable` components (parameterized by `basePath`). A new inline `RuleAssignPicker` component renders inside the Prop Passer empty Challenge Progress card. The old `/admin/propfirm-rules/*` URLs become one-line redirect stubs to `/dashboard/propfirm-rules`.

**Tech Stack:** Next.js 16 App Router, React 19, Supabase (Postgres + RLS + auth.users), TypeScript, Jest 29, Zod, shadcn/ui Select.

**Spec:** `docs/superpowers/specs/2026-05-20-user-owned-propfirm-rules-design.md`

---

## File Structure

**Create (EA repo, separate Supabase migrations dir):**
- `~/Documents/development/EA/JSONFX-IMPULSE/supabase/migrations/20260520000001_propfirm_rules_per_user.sql`

**Create (this repo):**
- `app/dashboard/propfirm-rules/page.tsx` — list of the user's rules
- `app/dashboard/propfirm-rules/new/page.tsx` — create form
- `app/dashboard/propfirm-rules/[id]/page.tsx` — edit form
- `components/journal/rule-assign-picker.tsx` — Select control for assigning a rule from the empty Challenge Progress card
- `components/journal/rule-assign-picker.test.tsx`
- `app/api/propfirm-rules/route.test.ts` — auth + ownership tests for GET/POST
- `app/api/propfirm-rules/[id]/route.test.ts` — auth + ownership tests for GET/PATCH/DELETE
- `app/api/subscriptions/[id]/route.test.ts` (extend; create if absent) — PATCH owner-allowed + rule-owner-mismatch

**Modify:**
- `lib/types.ts` — `PropfirmRule.user_id: string` added
- `lib/journal/queries.ts` — `listPropfirmRules(userId)` / `getPropfirmRule(id)` signatures
- `app/api/propfirm-rules/route.ts` — SSR auth + ownership
- `app/api/propfirm-rules/[id]/route.ts` — SSR auth + ownership (404 leak-safe)
- `app/api/subscriptions/[id]/route.ts` — PATCH allows subscription owner; rule-owner-mismatch check
- `app/dashboard/licenses/[id]/page.tsx` — fetch `ownerRules` for Prop Passer; pass through
- `components/journal/journal-shell.tsx` — thread `ownerRules` through
- `components/journal/live-account-panel.tsx` — thread `ownerRules` + `subscriptionId`
- `components/journal/passer-headline-cards.tsx` — render `RuleAssignPicker` in empty Challenge Progress card
- `components/propfirm-rules/rules-table.tsx` — `basePath` prop
- `components/propfirm-rules/rule-form.tsx` — `basePath` + optional `returnTo` props
- `app/admin/users/[id]/page.tsx` — call `listPropfirmRules(targetUserId)`
- `components/admin/subscription-policy-form.tsx` — "no rules" hint when list is empty
- `components/site-nav.tsx` — move "Propfirm Rules" link from admin section to always-visible

**Delete (replace each with a thin redirect stub):**
- `app/admin/propfirm-rules/page.tsx` → `redirect("/dashboard/propfirm-rules")`
- `app/admin/propfirm-rules/new/page.tsx` → `redirect("/dashboard/propfirm-rules/new")`
- `app/admin/propfirm-rules/[id]/page.tsx` → `redirect("/dashboard/propfirm-rules/<id>")`

---

## Task 1: Database migration

**Files:**
- Create: `~/Documents/development/EA/JSONFX-IMPULSE/supabase/migrations/20260520000001_propfirm_rules_per_user.sql`

- [ ] **Step 1: Create the migration file**

Path: `~/Documents/development/EA/JSONFX-IMPULSE/supabase/migrations/20260520000001_propfirm_rules_per_user.sql`

Content (verbatim):

```sql
-- 20260520000001_propfirm_rules_per_user.sql
-- Move propfirm_rules from a global admin-managed list to per-user ownership.

do $$
declare
  admin_id uuid;
begin
  select id into admin_id from auth.users where email = 'jayson@voltcontent.com';
  if admin_id is null then
    raise exception 'Migration aborted: admin user jayson@voltcontent.com not found in auth.users';
  end if;

  alter table propfirm_rules
    add column if not exists user_id uuid references auth.users(id) on delete cascade;

  update propfirm_rules set user_id = admin_id where user_id is null;

  alter table propfirm_rules alter column user_id set not null;
end$$;

alter table propfirm_rules
  add constraint propfirm_rules_user_name_uniq unique (user_id, name);

create index if not exists propfirm_rules_user_id_idx on propfirm_rules(user_id);

alter table subscriptions
  drop constraint if exists subscriptions_propfirm_rule_id_fkey,
  add constraint subscriptions_propfirm_rule_id_fkey
    foreign key (propfirm_rule_id) references propfirm_rules(id) on delete set null;

comment on table propfirm_rules is
  'Per-user propfirm rule presets. Owned by the user_id who created them. '
  'Assignable to that user''s subscriptions via subscriptions.propfirm_rule_id. '
  'Drives the journal Objectives tab evaluation.';

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
```

- [ ] **Step 2: Run the migration against the dev Supabase project**

From the EA repo:

```bash
cd ~/Documents/development/EA/JSONFX-IMPULSE
supabase db push
```

Expected: migration applies cleanly. If the admin email isn't found, the `do $$` block raises and the entire migration rolls back — no partial schema. Re-running after fix is safe (`if not exists` clauses).

- [ ] **Step 3: Verify the schema in the Supabase dashboard or via psql**

Confirm:
- `propfirm_rules.user_id` is `NOT NULL`, type `uuid`, FK to `auth.users.id` `ON DELETE CASCADE`.
- `propfirm_rules_user_name_uniq` exists.
- `propfirm_rules_user_id_idx` exists.
- `subscriptions_propfirm_rule_id_fkey` has `ON DELETE SET NULL`.
- Four `propfirm_rules_*` policies exist.

- [ ] **Step 4: Commit the migration**

```bash
cd ~/Documents/development/EA/JSONFX-IMPULSE
git add supabase/migrations/20260520000001_propfirm_rules_per_user.sql
git commit -m "feat(db): per-user ownership for propfirm_rules

Add user_id column with cascade FK to auth.users, per-user (user_id,name)
uniqueness, RLS policies, and ON DELETE SET NULL on the subscriptions FK."
```

---

## Task 2: TypeScript types + query helpers

**Files:**
- Modify: `lib/types.ts`
- Modify: `lib/journal/queries.ts`

- [ ] **Step 1: Add `user_id` to the `PropfirmRule` type**

In `lib/types.ts`, replace the `PropfirmRule` interface (currently at line ~180):

```ts
export interface PropfirmRule {
  id: number;
  user_id: string;
  name: string;
  account_size: number;
  max_daily_loss: number;
  daily_loss_type: DailyLossType;
  daily_loss_calc: DailyLossCalc;
  max_total_loss: number;
  total_loss_type: DailyLossType;
  profit_target: number;
  target_type: DailyLossType;
  min_trading_days: number;
  max_trading_days: number | null;
  created_at: string;
}
```

- [ ] **Step 2: Require `userId` in `listPropfirmRules` and keep `getPropfirmRule(id)`**

In `lib/journal/queries.ts`, replace the two existing functions:

```ts
export async function listPropfirmRules(userId: string): Promise<PropfirmRule[]> {
  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .from("propfirm_rules")
    .select("*")
    .eq("user_id", userId)
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

- [ ] **Step 3: Type-check and run jest**

Run: `npx tsc --noEmit && npx jest lib --silent`

Expected: tsc will surface errors in every caller of `listPropfirmRules()` and on every place that constructs a `PropfirmRule` fixture missing `user_id`. Those callers are fixed in later tasks. **Do not** add `as any` to silence these now.

Acceptable failing files (will be fixed by later tasks):
- `app/admin/propfirm-rules/page.tsx` — deleted in Task 9
- `app/admin/users/[id]/page.tsx` — updated in Task 11
- `app/api/propfirm-rules/route.ts` — updated in Task 3
- `lib/journal/passer-progress.test.ts` — fixtures need `user_id` (Task 13)
- `components/journal/passer-headline-cards.test.tsx` — fixtures need `user_id` (Task 13)

- [ ] **Step 4: Fix the immediate fixture compile errors in the existing tests**

In `lib/journal/passer-progress.test.ts` and `components/journal/passer-headline-cards.test.tsx`, the `RULE` fixture needs a `user_id`. Add `user_id: "00000000-0000-0000-0000-000000000001"` to each fixture object (anywhere inside the `PropfirmRule` literal).

Run: `npx jest lib components/journal/passer-headline-cards --silent`
Expected: PASS (377 tests + however many).

- [ ] **Step 5: Commit**

```bash
git add lib/types.ts lib/journal/queries.ts lib/journal/passer-progress.test.ts components/journal/passer-headline-cards.test.tsx
git commit -m "refactor(types): add user_id to PropfirmRule, scope query helpers

listPropfirmRules now requires a user_id argument; existing fixtures
updated with a placeholder uuid."
```

Errors in API routes / admin pages remain expected until Tasks 3, 9, 11.

---

## Task 3: `/api/propfirm-rules` route — auth + ownership

**Files:**
- Create: `app/api/propfirm-rules/route.test.ts`
- Modify: `app/api/propfirm-rules/route.ts`

- [ ] **Step 1: Author the failing test**

Create `app/api/propfirm-rules/route.test.ts`. Use the same mocking pattern as `lib/admin-subscriptions.test.ts` (look there for how the Supabase clients are mocked in this codebase). The minimum coverage:

```ts
import { GET, POST } from "./route";

// Use the project's existing Supabase mocking helpers (see other route tests
// in this repo for the pattern — getSupabaseSSR and getSupabaseAdmin are
// mocked at module level).
jest.mock("@/lib/supabase/ssr");
jest.mock("@/lib/supabase/server");

function makeRequest(url: string, init?: RequestInit) {
  return new Request(url, init);
}

describe("/api/propfirm-rules GET", () => {
  it("401 when unauthenticated", async () => {
    // mock getSupabaseSSR().auth.getUser() -> { data: { user: null } }
    const res = await GET(makeRequest("http://test/api/propfirm-rules"));
    expect(res.status).toBe(401);
  });

  it("returns caller's own rules when no ?user_id is given", async () => {
    // mock getUser -> { id: "user-a" }, role: user
    // mock listPropfirmRules("user-a") -> [{ id: 1, user_id: "user-a", ... }]
    const res = await GET(makeRequest("http://test/api/propfirm-rules"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(1);
    expect(body[0].user_id).toBe("user-a");
  });

  it("admin with ?user_id returns that user's rules", async () => {
    // mock getUser -> { id: "admin-id", app_metadata: { role: "admin" } }
    // mock listPropfirmRules("user-b") -> [{ id: 2, user_id: "user-b" }]
    const res = await GET(makeRequest("http://test/api/propfirm-rules?user_id=user-b"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body[0].user_id).toBe("user-b");
  });

  it("403 when non-admin asks for another user's rules", async () => {
    // mock getUser -> { id: "user-a", role: "user" }
    const res = await GET(makeRequest("http://test/api/propfirm-rules?user_id=user-b"));
    expect(res.status).toBe(403);
  });
});

describe("/api/propfirm-rules POST", () => {
  it("401 when unauthenticated", async () => {
    const res = await POST(makeRequest("http://test/api/propfirm-rules", {
      method: "POST",
      body: JSON.stringify({ name: "X" }),
    }));
    expect(res.status).toBe(401);
  });

  it("forces user_id to caller.id, ignoring any user_id in body", async () => {
    // mock getUser -> { id: "user-a" }
    // mock supabase admin .from("propfirm_rules").insert(...).select().single() to capture insert payload
    let captured: unknown;
    // wire your mock to write into `captured`
    const validBody = {
      user_id: "MALICIOUS-spoofed-id",      // should be IGNORED
      name: "FTMO 100k",
      account_size: 100000, max_daily_loss: 5, daily_loss_type: "percent", daily_loss_calc: "balance",
      max_total_loss: 10, total_loss_type: "percent",
      profit_target: 8, target_type: "percent",
      min_trading_days: 4, max_trading_days: 30,
    };
    const res = await POST(makeRequest("http://test/api/propfirm-rules", {
      method: "POST",
      body: JSON.stringify(validBody),
    }));
    expect(res.status).toBe(201);
    expect((captured as { user_id: string }).user_id).toBe("user-a"); // NOT "MALICIOUS-spoofed-id"
  });

  it("400 on invalid body (missing required fields)", async () => {
    const res = await POST(makeRequest("http://test/api/propfirm-rules", {
      method: "POST", body: JSON.stringify({}),
    }));
    expect(res.status).toBe(400);
  });
});
```

When wiring the Supabase mocks, follow the pattern in `lib/admin-subscriptions.test.ts` — that test file mocks `@/lib/supabase/server` and `@/lib/supabase/ssr` and is the source of truth for this project's mocking idioms. **If the existing test mocking helpers are insufficient, stop and ask** rather than building parallel mock infra.

- [ ] **Step 2: Run and watch tests fail**

Run: `npx jest app/api/propfirm-rules/route.test.ts -v`
Expected: FAIL — the route currently has no auth; most assertions will be wrong.

- [ ] **Step 3: Rewrite the route**

Replace `app/api/propfirm-rules/route.ts` contents with:

```ts
import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { getSupabaseSSR } from "@/lib/supabase/ssr";
import { listPropfirmRules } from "@/lib/journal/queries";
import { propfirmRuleSchema } from "@/lib/schemas";
import { extractRole } from "@/lib/role";

export const dynamic = "force-dynamic";

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

  try {
    return NextResponse.json(await listPropfirmRules(targetUserId));
  } catch (err) {
    return NextResponse.json({ error: "server_error", detail: String(err) }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const ssr = await getSupabaseSSR();
  const { data: { user } } = await ssr.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  let body: unknown;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "bad_json" }, { status: 400 }); }

  const parsed = propfirmRuleSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid", issues: parsed.error.issues }, { status: 400 });
  }

  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .from("propfirm_rules")
    .insert({ ...parsed.data, user_id: user.id })
    .select()
    .single();
  if (error) return NextResponse.json({ error: "server_error", detail: error.message }, { status: 500 });

  return NextResponse.json(data, { status: 201 });
}
```

- [ ] **Step 4: Run tests until green**

Run: `npx jest app/api/propfirm-rules/route.test.ts -v`
Expected: all four tests PASS.

- [ ] **Step 5: Commit**

```bash
git add app/api/propfirm-rules/route.ts app/api/propfirm-rules/route.test.ts
git commit -m "feat(api): authenticate /api/propfirm-rules GET and POST

Caller must be authenticated. GET returns the caller's own rules unless
?user_id is provided by an admin. POST forces user_id = caller.id."
```

---

## Task 4: `/api/propfirm-rules/[id]` route — ownership

**Files:**
- Create: `app/api/propfirm-rules/[id]/route.test.ts`
- Modify: `app/api/propfirm-rules/[id]/route.ts`

- [ ] **Step 1: Author the failing test**

Create `app/api/propfirm-rules/[id]/route.test.ts`:

```ts
import { GET, PATCH, DELETE } from "./route";

jest.mock("@/lib/supabase/ssr");
jest.mock("@/lib/supabase/server");

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

function makeRequest(method: string, body?: unknown) {
  return new Request("http://test/api/propfirm-rules/1", {
    method,
    body: body ? JSON.stringify(body) : undefined,
    headers: { "content-type": "application/json" },
  });
}

describe("/api/propfirm-rules/[id] GET", () => {
  it("401 when unauthenticated", async () => {
    const res = await GET(makeRequest("GET"), ctx("1"));
    expect(res.status).toBe(401);
  });

  it("returns the rule when caller owns it", async () => {
    // mock getUser -> { id: "user-a" }
    // mock getPropfirmRule(1) -> { id: 1, user_id: "user-a", ... }
    const res = await GET(makeRequest("GET"), ctx("1"));
    expect(res.status).toBe(200);
  });

  it("404 (not 403) when rule belongs to another user and caller is non-admin", async () => {
    // mock getUser -> { id: "user-a" }, role: user
    // mock getPropfirmRule(1) -> { id: 1, user_id: "user-b", ... }
    const res = await GET(makeRequest("GET"), ctx("1"));
    expect(res.status).toBe(404);
  });

  it("admin can fetch any rule", async () => {
    // mock getUser -> { id: "admin", role: "admin" }
    // mock getPropfirmRule(1) -> { id: 1, user_id: "user-b" }
    const res = await GET(makeRequest("GET"), ctx("1"));
    expect(res.status).toBe(200);
  });

  it("404 on bad id", async () => {
    const res = await GET(makeRequest("GET"), ctx("abc"));
    expect(res.status).toBe(400);
  });
});

describe("/api/propfirm-rules/[id] PATCH", () => {
  it("404 when caller does not own the rule (non-admin)", async () => {
    const res = await PATCH(makeRequest("PATCH", { name: "new" }), ctx("1"));
    expect(res.status).toBe(404);
  });

  it("owner can update", async () => {
    // mock getUser -> { id: "user-a" }
    // mock getPropfirmRule(1) -> { user_id: "user-a", ... }
    const res = await PATCH(makeRequest("PATCH", { name: "renamed" }), ctx("1"));
    expect(res.status).toBe(200);
  });

  it("400 on invalid body", async () => {
    // mock owner check passes
    const res = await PATCH(makeRequest("PATCH", { account_size: -5 }), ctx("1"));
    expect(res.status).toBe(400);
  });
});

describe("/api/propfirm-rules/[id] DELETE", () => {
  it("404 when caller does not own the rule (non-admin)", async () => {
    const res = await DELETE(makeRequest("DELETE"), ctx("1"));
    expect(res.status).toBe(404);
  });

  it("owner can delete", async () => {
    const res = await DELETE(makeRequest("DELETE"), ctx("1"));
    expect(res.status).toBe(200);
  });
});
```

- [ ] **Step 2: Run and watch fail**

Run: `npx jest app/api/propfirm-rules/[id]/route.test.ts -v`
Expected: FAIL — no auth/ownership checks present.

- [ ] **Step 3: Rewrite the route**

Replace `app/api/propfirm-rules/[id]/route.ts` contents with:

```ts
import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { getSupabaseSSR } from "@/lib/supabase/ssr";
import { propfirmRuleSchema } from "@/lib/schemas";
import { getPropfirmRule } from "@/lib/journal/queries";
import { extractRole, type Role } from "@/lib/role";
import type { PropfirmRule } from "@/lib/types";

export const dynamic = "force-dynamic";

async function authorize(id: number) {
  const ssr = await getSupabaseSSR();
  const { data: { user } } = await ssr.auth.getUser();
  if (!user) return { error: "unauthenticated" as const, status: 401 };

  const role: Role | null = extractRole({ user });
  const rule = await getPropfirmRule(id);
  if (!rule) return { error: "not_found" as const, status: 404 };

  if (rule.user_id !== user.id && role !== "admin") {
    return { error: "not_found" as const, status: 404 }; // 404 not 403 — don't leak existence
  }

  return { user, role, rule };
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const n = Number(id);
  if (!Number.isFinite(n)) return NextResponse.json({ error: "bad_id" }, { status: 400 });

  const result = await authorize(n);
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json(result.rule);
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const n = Number(id);
  if (!Number.isFinite(n)) return NextResponse.json({ error: "bad_id" }, { status: 400 });

  const result = await authorize(n);
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: result.status });

  let body: unknown;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "bad_json" }, { status: 400 }); }

  const parsed = propfirmRuleSchema.partial().safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "invalid", issues: parsed.error.issues }, { status: 400 });

  // user_id is not patchable.
  const { user_id: _ignored, ...patchable } = parsed.data as Partial<PropfirmRule>;

  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .from("propfirm_rules")
    .update(patchable)
    .eq("id", n)
    .select()
    .single();
  if (error) return NextResponse.json({ error: "server_error", detail: error.message }, { status: 500 });

  return NextResponse.json(data);
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const n = Number(id);
  if (!Number.isFinite(n)) return NextResponse.json({ error: "bad_id" }, { status: 400 });

  const result = await authorize(n);
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: result.status });

  const sb = getSupabaseAdmin();
  const { error } = await sb.from("propfirm_rules").delete().eq("id", n);
  if (error) return NextResponse.json({ error: "server_error", detail: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 4: Run tests until green**

Run: `npx jest app/api/propfirm-rules/[id]/route.test.ts -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/api/propfirm-rules/[id]/route.ts app/api/propfirm-rules/[id]/route.test.ts
git commit -m "feat(api): ownership-gated propfirm-rule GET/PATCH/DELETE

Caller must own the rule (or be admin). Returns 404 not 403 for foreign
rules to avoid leaking ID existence."
```

---

## Task 5: `/api/subscriptions/[id]` PATCH — relax to subscription owner

**Files:**
- Create: `app/api/subscriptions/[id]/route.test.ts`
- Modify: `app/api/subscriptions/[id]/route.ts`

- [ ] **Step 1: Author the failing test**

Create `app/api/subscriptions/[id]/route.test.ts`:

```ts
import { PATCH } from "./route";

jest.mock("@/lib/supabase/ssr");
jest.mock("@/lib/supabase/server");

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const makeRequest = (body: unknown) => new Request("http://test/api/subscriptions/1", {
  method: "PATCH",
  body: JSON.stringify(body),
  headers: { "content-type": "application/json" },
});

describe("PATCH /api/subscriptions/[id]", () => {
  it("owner can set propfirm_rule_id on their own subscription", async () => {
    // mock getUser -> { id: "user-a" }
    // mock subscription fetch -> { id: 1, user_id: "user-a" }
    // mock rule fetch -> { id: 5, user_id: "user-a" }
    const res = await PATCH(makeRequest({ propfirm_rule_id: 5 }), ctx("1"));
    expect(res.status).toBe(200);
  });

  it("400 rule_owner_mismatch when rule belongs to a different user", async () => {
    // mock subscription -> user-a, rule -> user-b
    const res = await PATCH(makeRequest({ propfirm_rule_id: 7 }), ctx("1"));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("rule_owner_mismatch");
  });

  it("403 when non-owner non-admin patches a foreign subscription", async () => {
    // mock getUser -> { id: "user-a" }, subscription -> user-b
    const res = await PATCH(makeRequest({ propfirm_rule_id: null }), ctx("1"));
    expect(res.status).toBe(403);
  });

  it("owner can clear the rule (propfirm_rule_id: null)", async () => {
    const res = await PATCH(makeRequest({ propfirm_rule_id: null }), ctx("1"));
    expect(res.status).toBe(200);
  });

  it("403 when non-admin tries to set push_interval_seconds", async () => {
    // mock owner = caller. Owner patching push_interval is admin-only.
    const res = await PATCH(makeRequest({ push_interval_seconds: 5 }), ctx("1"));
    expect(res.status).toBe(403);
  });

  it("admin can set push_interval_seconds", async () => {
    const res = await PATCH(makeRequest({ push_interval_seconds: 5 }), ctx("1"));
    expect(res.status).toBe(200);
  });
});
```

- [ ] **Step 2: Run and watch fail**

Run: `npx jest app/api/subscriptions/[id]/route.test.ts -v`
Expected: FAIL — current PATCH is admin-only across the board.

- [ ] **Step 3: Rewrite the PATCH handler**

In `app/api/subscriptions/[id]/route.ts`, replace ONLY the `PATCH` function (keep `DELETE` untouched):

```ts
export async function PATCH(
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

  let body: unknown;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const parsed = updateSubscriptionPolicySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request", issues: parsed.error.issues }, { status: 400 });
  }

  const sb = getSupabaseAdmin();
  const { data: sub, error: fetchErr } = await sb
    .from("subscriptions")
    .select("id, user_id")
    .eq("id", id)
    .maybeSingle();
  if (fetchErr) return NextResponse.json({ error: "lookup_failed", details: fetchErr.message }, { status: 500 });
  if (!sub) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const isAdmin = extractRole({ user }) === "admin";
  const isOwner = sub.user_id === user.id;
  if (!isAdmin && !isOwner) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  // push_interval_seconds stays admin-only — it's an EA-side dial, not a user preference.
  if (parsed.data.push_interval_seconds !== undefined && !isAdmin) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  // If assigning a rule, check rule ownership matches subscription ownership.
  if (parsed.data.propfirm_rule_id !== undefined && parsed.data.propfirm_rule_id !== null) {
    const { data: rule } = await sb
      .from("propfirm_rules")
      .select("user_id")
      .eq("id", parsed.data.propfirm_rule_id)
      .maybeSingle();
    if (!rule) return NextResponse.json({ error: "rule_not_found" }, { status: 400 });
    if (rule.user_id !== sub.user_id) {
      return NextResponse.json({ error: "rule_owner_mismatch" }, { status: 400 });
    }
  }

  const { data: updated, error } = await sb
    .from("subscriptions")
    .update(parsed.data)
    .eq("id", id)
    .select()
    .single();
  if (error) return NextResponse.json({ error: "update_failed", details: error.message }, { status: 500 });

  return NextResponse.json({ subscription: updated });
}
```

- [ ] **Step 4: Run all subscription + propfirm tests**

Run: `npx jest app/api lib/admin-subscriptions --silent`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/api/subscriptions/[id]/route.ts app/api/subscriptions/[id]/route.test.ts
git commit -m "feat(api): allow subscription owner to assign their own rule

PATCH /api/subscriptions/[id] now accepts the subscription owner (not just
admin) for propfirm_rule_id changes. Rule must belong to the subscription
owner — otherwise 400 rule_owner_mismatch. push_interval_seconds stays
admin-only."
```

---

## Task 6: Parameterize `RuleForm` and `RulesTable`

**Files:**
- Modify: `components/propfirm-rules/rules-table.tsx`
- Modify: `components/propfirm-rules/rule-form.tsx`

- [ ] **Step 1: Add `basePath` to `RulesTable`**

Replace `components/propfirm-rules/rules-table.tsx`:

```tsx
"use client";

import Link from "next/link";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { PropfirmRule } from "@/lib/types";

export function RulesTable({ rules, basePath }: { rules: PropfirmRule[]; basePath: string }) {
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
            <TableCell><Link href={`${basePath}/${r.id}`} className="hover:underline">{r.name}</Link></TableCell>
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

- [ ] **Step 2: Add `basePath` + `returnTo` to `RuleForm`**

In `components/propfirm-rules/rule-form.tsx`, change the signature and the post-save/delete redirects. Show the diff:

Replace the function signature line:
```tsx
export function RuleForm({ initial, basePath, returnTo }: { initial?: PropfirmRule; basePath: string; returnTo?: string }) {
```

In `onSubmit`, replace the final `router.push("/admin/propfirm-rules")` line with:
```tsx
router.push(returnTo ?? basePath); router.refresh();
```

In `onDelete`, replace the `router.push("/admin/propfirm-rules")` line with:
```tsx
router.push(basePath); router.refresh();
```

Everything else in the file is unchanged.

- [ ] **Step 3: Type-check (existing admin pages will now fail — fixed in Task 9)**

Run: `npx tsc --noEmit 2>&1 | grep -E "rule-form|rules-table"`
Expected: errors only in `app/admin/propfirm-rules/*.tsx` (those are deleted in Task 9). No errors in `rule-form.tsx` itself.

- [ ] **Step 4: Commit**

```bash
git add components/propfirm-rules/rules-table.tsx components/propfirm-rules/rule-form.tsx
git commit -m "refactor(propfirm-rules): parameterize RuleForm + RulesTable basePath

Prep for the new /dashboard/propfirm-rules pages. Replaces hard-coded
/admin/propfirm-rules with a required basePath prop and optional returnTo."
```

---

## Task 7: New `/dashboard/propfirm-rules` pages

**Files:**
- Create: `app/dashboard/propfirm-rules/page.tsx`
- Create: `app/dashboard/propfirm-rules/new/page.tsx`
- Create: `app/dashboard/propfirm-rules/[id]/page.tsx`

- [ ] **Step 1: Author the list page**

Create `app/dashboard/propfirm-rules/page.tsx`:

```tsx
import Link from "next/link";
import { redirect } from "next/navigation";
import { getSupabaseSSR } from "@/lib/supabase/ssr";
import { listPropfirmRules } from "@/lib/journal/queries";
import { RulesTable } from "@/components/propfirm-rules/rules-table";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";

export default async function UserPropfirmRulesPage() {
  const ssr = await getSupabaseSSR();
  const { data: { user } } = await ssr.auth.getUser();
  if (!user) redirect("/login");

  const rules = await listPropfirmRules(user.id);

  return (
    <div className="mx-auto max-w-6xl px-6 py-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Propfirm Rules</h1>
        <Button asChild><Link href="/dashboard/propfirm-rules/new">New rule</Link></Button>
      </div>
      <RulesTable rules={rules} basePath="/dashboard/propfirm-rules" />
    </div>
  );
}
```

- [ ] **Step 2: Author the new-rule page**

Create `app/dashboard/propfirm-rules/new/page.tsx`:

```tsx
import { redirect } from "next/navigation";
import { getSupabaseSSR } from "@/lib/supabase/ssr";
import { RuleForm } from "@/components/propfirm-rules/rule-form";

interface PageProps {
  searchParams: Promise<{ return_to?: string }>;
}

export default async function NewUserRulePage({ searchParams }: PageProps) {
  const ssr = await getSupabaseSSR();
  const { data: { user } } = await ssr.auth.getUser();
  if (!user) redirect("/login");

  const { return_to } = await searchParams;

  return (
    <div className="mx-auto max-w-6xl px-6 py-6 space-y-4">
      <h1 className="text-xl font-semibold">New propfirm rule</h1>
      <RuleForm basePath="/dashboard/propfirm-rules" returnTo={return_to} />
    </div>
  );
}
```

- [ ] **Step 3: Author the edit-rule page**

Create `app/dashboard/propfirm-rules/[id]/page.tsx`:

```tsx
import { notFound, redirect } from "next/navigation";
import { getSupabaseSSR } from "@/lib/supabase/ssr";
import { RuleForm } from "@/components/propfirm-rules/rule-form";
import { getPropfirmRule } from "@/lib/journal/queries";
import { extractRole } from "@/lib/role";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function EditUserRulePage({ params }: PageProps) {
  const ssr = await getSupabaseSSR();
  const { data: { user } } = await ssr.auth.getUser();
  if (!user) redirect("/login");

  const { id } = await params;
  const n = Number(id);
  if (!Number.isFinite(n)) notFound();

  const rule = await getPropfirmRule(n);
  if (!rule) notFound();

  const isAdmin = extractRole({ user }) === "admin";
  if (rule.user_id !== user.id && !isAdmin) notFound();

  return (
    <div className="mx-auto max-w-6xl px-6 py-6 space-y-4">
      <h1 className="text-xl font-semibold">Edit rule: {rule.name}</h1>
      <RuleForm initial={rule} basePath="/dashboard/propfirm-rules" />
    </div>
  );
}
```

- [ ] **Step 4: Run tsc + tests**

Run: `npx tsc --noEmit && npx jest --silent`
Expected: pre-existing breakage in `/admin/propfirm-rules/*` and `app/admin/users/[id]/page.tsx` still there (fixed in Tasks 9 + 11). No new errors.

- [ ] **Step 5: Commit**

```bash
git add app/dashboard/propfirm-rules/
git commit -m "feat(dashboard): user-owned propfirm-rules pages

list / new / edit at /dashboard/propfirm-rules. Each authenticates the
user and scopes to user.id. Edit page also allows admin to edit any rule."
```

---

## Task 8: Site navigation update

**Files:**
- Modify: `components/site-nav.tsx`

- [ ] **Step 1: Move the Propfirm Rules link**

Open `components/site-nav.tsx`. Find the block at lines 84–90 (the admin-section Propfirm Rules `<Link>`). **Cut** that block out of the admin section.

Then find the always-visible user nav section (search for where the dashboard's main `Link` items live for non-admin users — currently the file has a logged-in-but-non-admin path that just shows logout). Add a Propfirm Rules link there.

For minimum disruption: read the file from top to bottom first. The exact insertion point depends on the file's current structure — it groups admin-only nav and user-visible nav. Add the link in the user-visible group, with `href="/dashboard/propfirm-rules"`. If the file currently has only an admin-section nav and no general logged-in section, add a small logged-in-section above the admin section that renders for any authenticated user. Match the style of the existing admin `<Link>` (uses `linkClass()` and `aria-current`).

The exact diff depends on the file's other contents — read the file before editing.

- [ ] **Step 2: Visually verify**

Run: `npm run dev` (or use the running container). Open the app:
- Logged in as admin → "Propfirm Rules" link visible in the main nav, points to `/dashboard/propfirm-rules`.
- Logged in as a non-admin user → "Propfirm Rules" link visible in the main nav too.

Stop the dev server.

- [ ] **Step 3: Commit**

```bash
git add components/site-nav.tsx
git commit -m "nav: move Propfirm Rules link out of admin-only section

Now visible to all authenticated users, pointing at the new
/dashboard/propfirm-rules pages."
```

---

## Task 9: Replace `/admin/propfirm-rules/*` with redirect stubs

**Files:**
- Modify: `app/admin/propfirm-rules/page.tsx`
- Modify: `app/admin/propfirm-rules/new/page.tsx`
- Modify: `app/admin/propfirm-rules/[id]/page.tsx`

- [ ] **Step 1: Replace each page with a redirect**

`app/admin/propfirm-rules/page.tsx`:

```tsx
import { redirect } from "next/navigation";
export default function AdminPropfirmRulesRedirect() {
  redirect("/dashboard/propfirm-rules");
}
```

`app/admin/propfirm-rules/new/page.tsx`:

```tsx
import { redirect } from "next/navigation";
export default function AdminPropfirmRulesNewRedirect() {
  redirect("/dashboard/propfirm-rules/new");
}
```

`app/admin/propfirm-rules/[id]/page.tsx`:

```tsx
import { redirect } from "next/navigation";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function AdminPropfirmRulesEditRedirect({ params }: PageProps) {
  const { id } = await params;
  redirect(`/dashboard/propfirm-rules/${encodeURIComponent(id)}`);
}
```

- [ ] **Step 2: Type-check and run tests**

Run: `npx tsc --noEmit && npx jest --silent`
Expected: PASS (the deleted imports of `RuleForm`, `RulesTable`, `AdminSiteNav`, `listPropfirmRules` from the old admin pages no longer trigger compile errors).

- [ ] **Step 3: Commit**

```bash
git add app/admin/propfirm-rules/
git commit -m "feat(admin): redirect /admin/propfirm-rules to /dashboard/propfirm-rules

Old admin URLs are stub redirects for bookmark compatibility. Can be
removed in a follow-up cleanup PR after a grace period."
```

---

## Task 10: Scope `/admin/users/[id]` rules to the target user

**Files:**
- Modify: `app/admin/users/[id]/page.tsx`

- [ ] **Step 1: Update the call site**

Open `app/admin/users/[id]/page.tsx`. Find the `listPropfirmRules()` call (currently with no arguments). Replace it with `listPropfirmRules(targetUserId)`, where `targetUserId` is the `id` of the user this admin page is viewing — it's already in scope as the route param. Read the file to find the exact variable name; the most likely shape is:

```ts
const { id: targetUserId } = await params;
// ...
const rules = await listPropfirmRules(targetUserId);
```

If the variable is named differently (e.g., `userId`, `id`), use that.

- [ ] **Step 2: Type-check and run tests**

Run: `npx tsc --noEmit && npx jest --silent`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add app/admin/users/[id]/page.tsx
git commit -m "fix(admin): scope rule dropdown to the target user

/admin/users/[id] now shows only that user's own rules in the
SubscriptionPolicyForm dropdown, not every rule in the database."
```

---

## Task 11: Empty-rules hint in `SubscriptionPolicyForm`

**Files:**
- Modify: `components/admin/subscription-policy-form.tsx`

- [ ] **Step 1: Add the hint**

In `components/admin/subscription-policy-form.tsx`, replace the `<Label className="text-xs">Propfirm rule</Label>` block (around line 68–79) with:

```tsx
      <div className="space-y-1">
        <Label className="text-xs">Propfirm rule</Label>
        <Select value={ruleId} onValueChange={setRuleId}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="none">(none)</SelectItem>
            {rules.map((r) => (
              <SelectItem key={r.id} value={String(r.id)}>{r.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {rules.length === 0 && (
          <p className="text-[11px] text-muted-foreground">
            User has no rules yet — ask them to create one in their dashboard.
          </p>
        )}
      </div>
```

- [ ] **Step 2: Tests + commit**

Run: `npx jest --silent`
Expected: PASS.

```bash
git add components/admin/subscription-policy-form.tsx
git commit -m "ux(admin): hint when target user has no propfirm rules

Avoids the silent-empty-dropdown UX dead-end on /admin/users/[id]."
```

---

## Task 12: Failing test for `RuleAssignPicker`

**Files:**
- Create: `components/journal/rule-assign-picker.test.tsx`

- [ ] **Step 1: Author the test**

Create `components/journal/rule-assign-picker.test.tsx`:

```tsx
import { render, screen, fireEvent } from "@testing-library/react";
import { RuleAssignPicker } from "./rule-assign-picker";
import type { PropfirmRule } from "@/lib/types";

const ruleA: PropfirmRule = {
  id: 1, user_id: "user-a", name: "FTMO 100k",
  account_size: 100000, max_daily_loss: 5, daily_loss_type: "percent",
  daily_loss_calc: "balance", max_total_loss: 10, total_loss_type: "percent",
  profit_target: 8, target_type: "percent", min_trading_days: 4, max_trading_days: 30,
  created_at: "2026-05-01T00:00:00Z",
};

const ruleB: PropfirmRule = { ...ruleA, id: 2, name: "MFF 50k" };

describe("RuleAssignPicker", () => {
  it("renders 'Create your first rule' link when userRules is empty", () => {
    render(<RuleAssignPicker subscriptionId={42} userRules={[]} ownerUserId="user-a" returnTo="/dashboard/licenses/1" />);
    const link = screen.getByRole("link", { name: /create your first rule/i });
    expect(link).toHaveAttribute("href", expect.stringContaining("/dashboard/propfirm-rules/new"));
    expect(link.getAttribute("href")).toContain("return_to=%2Fdashboard%2Flicenses%2F1");
  });

  it("renders a Select with the user's rules when there are any", () => {
    render(<RuleAssignPicker subscriptionId={42} userRules={[ruleA, ruleB]} ownerUserId="user-a" returnTo="/dashboard/licenses/1" />);
    // Trigger Select to expand — radix Select renders options into a portal
    fireEvent.click(screen.getByRole("combobox"));
    expect(screen.getByText("FTMO 100k")).toBeInTheDocument();
    expect(screen.getByText("MFF 50k")).toBeInTheDocument();
  });

  it("PATCHes the subscription on save and refreshes the router", async () => {
    const fetchSpy = jest.spyOn(global, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ subscription: { id: 42, propfirm_rule_id: 1 } }), { status: 200 }),
    );
    render(<RuleAssignPicker subscriptionId={42} userRules={[ruleA]} ownerUserId="user-a" returnTo="/dashboard/licenses/1" />);
    fireEvent.click(screen.getByRole("combobox"));
    fireEvent.click(screen.getByText("FTMO 100k"));
    fireEvent.click(screen.getByRole("button", { name: /assign rule/i }));

    await screen.findByRole("button", { name: /assign rule/i }); // wait for state settle

    expect(fetchSpy).toHaveBeenCalledWith(
      "/api/subscriptions/42",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ propfirm_rule_id: 1 }),
      }),
    );
    fetchSpy.mockRestore();
  });
});
```

- [ ] **Step 2: Run and watch fail**

Run: `npx jest components/journal/rule-assign-picker.test.tsx -v`
Expected: FAIL — module doesn't exist.

---

## Task 13: Implement `RuleAssignPicker`

**Files:**
- Create: `components/journal/rule-assign-picker.tsx`

- [ ] **Step 1: Write the component**

Create `components/journal/rule-assign-picker.tsx`:

```tsx
"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { PropfirmRule } from "@/lib/types";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

interface Props {
  subscriptionId: number;
  userRules: PropfirmRule[];
  ownerUserId: string;
  returnTo: string;
  currentRuleId?: number;
}

export function RuleAssignPicker({
  subscriptionId, userRules, ownerUserId, returnTo, currentRuleId,
}: Props) {
  const router = useRouter();
  const [selected, setSelected] = useState<string>(
    currentRuleId != null ? String(currentRuleId) : "",
  );
  const [isPending, startTransition] = useTransition();

  if (userRules.length === 0) {
    const createHref = `/dashboard/propfirm-rules/new?return_to=${encodeURIComponent(returnTo)}`;
    return (
      <div className="space-y-2">
        <p className="text-xs text-muted-foreground">No challenge rule assigned.</p>
        <Link
          href={createHref}
          className="text-xs font-medium text-foreground underline-offset-2 hover:underline"
        >
          Create your first rule →
        </Link>
      </div>
    );
  }

  function onAssign() {
    if (!selected) return;
    startTransition(async () => {
      const res = await fetch(`/api/subscriptions/${subscriptionId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ propfirm_rule_id: Number(selected) }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        toast.error(body.error === "rule_owner_mismatch"
          ? "That rule belongs to a different user."
          : `Assign failed: ${body.error ?? res.statusText}`);
        return;
      }
      toast.success("Rule assigned");
      router.refresh();
    });
  }

  const createHref = `/dashboard/propfirm-rules/new?return_to=${encodeURIComponent(returnTo)}&owner=${encodeURIComponent(ownerUserId)}`;

  return (
    <div className="space-y-2">
      <Select value={selected} onValueChange={setSelected}>
        <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Pick a rule…" /></SelectTrigger>
        <SelectContent>
          {userRules.map((r) => (
            <SelectItem key={r.id} value={String(r.id)}>{r.name}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      <div className="flex items-center justify-between gap-2">
        <Button size="sm" onClick={onAssign} disabled={!selected || isPending}>
          {isPending ? "Assigning…" : "Assign rule"}
        </Button>
        <Link href={createHref} className="text-xs text-muted-foreground underline-offset-2 hover:underline">
          + new rule
        </Link>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Run tests until green**

Run: `npx jest components/journal/rule-assign-picker.test.tsx -v`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add components/journal/rule-assign-picker.tsx components/journal/rule-assign-picker.test.tsx
git commit -m "feat(journal): inline RuleAssignPicker

Select control rendered on the Prop Passer empty Challenge Progress card.
Empty-rules state shows a 'Create your first rule' link with return_to."
```

---

## Task 14: Wire `ownerRules` through the journal shell

**Files:**
- Modify: `app/dashboard/licenses/[id]/page.tsx`
- Modify: `components/journal/journal-shell.tsx`
- Modify: `components/journal/live-account-panel.tsx`
- Modify: `components/journal/passer-headline-cards.tsx`

- [ ] **Step 1: Fetch `ownerRules` in the server page**

In `app/dashboard/licenses/[id]/page.tsx`, just before the `return <JournalShell ... />` line:

```ts
const ownerRules = license.product === "ctx-prop-passer"
  ? await listPropfirmRules(license.user_id)
  : [];
```

Add the import at the top:
```ts
import { listPropfirmRules } from "@/lib/journal/queries";
```

Then pass `ownerRules` and the subscription id to `<JournalShell>`:

```tsx
<JournalShell
  // existing props ...
  ownerRules={ownerRules}
  subscriptionId={license.subscription_id}
/>
```

- [ ] **Step 2: Thread props through `JournalShell`**

In `components/journal/journal-shell.tsx`:

1. Add to the `Props` interface:
```ts
ownerRules: PropfirmRule[];
subscriptionId: number;
```
2. Import `PropfirmRule` if not already imported.
3. Pass to `<LiveAccountPanel>`:
```tsx
<LiveAccountPanel
  // existing props ...
  ownerRules={props.ownerRules}
  subscriptionId={props.subscriptionId}
/>
```

- [ ] **Step 3: Thread props through `LiveAccountPanel`**

In `components/journal/live-account-panel.tsx`:

1. Add to `Props`:
```ts
ownerRules: PropfirmRule[];
subscriptionId: number;
```
2. Update the function signature destructuring to include the two new props.
3. Forward to `<PasserHeadlineCards>` inside the Prop Passer branch:
```tsx
return (
  <PasserHeadlineCards
    snapshot={snapshot}
    daily={daily}
    deals={deals}
    rule={rule}
    baseline={baseline}
    ownerRules={ownerRules}
    subscriptionId={subscriptionId}
    licenseId={license.id /* if available */ ?? 0}
  />
);
```

If `license` is not in scope inside `LiveAccountPanel` (it isn't currently), accept `licenseId: number` as a new prop too and thread it from `JournalShell` (`license.id`). The picker uses it to build the `return_to` URL.

- [ ] **Step 4: Render the picker in `PasserHeadlineCards`**

In `components/journal/passer-headline-cards.tsx`:

1. Add to `Props`:
```ts
ownerRules: PropfirmRule[];
subscriptionId: number;
licenseId: number;
```
2. Import the picker + types:
```tsx
import { RuleAssignPicker } from "./rule-assign-picker";
```
3. Replace the JSX that renders the Challenge Progress `<KpiCard>` block. The progress card needs to render the picker when `cards.progress.empty === true` (meaning no rule was assigned). Concretely, change just the **first** `<KpiCard>` element to:

```tsx
{cards.progress.empty ? (
  <div className="flex flex-col overflow-hidden rounded-xl border border-dashed bg-muted/20 px-4 py-3">
    <div className="text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">
      Challenge Progress
    </div>
    <div className="mt-2">
      <RuleAssignPicker
        subscriptionId={subscriptionId}
        userRules={ownerRules}
        ownerUserId={snapshot ? "" : ""}        /* set in step 4b below */
        returnTo={`/dashboard/licenses/${licenseId}`}
      />
    </div>
  </div>
) : (
  <KpiCard
    featured
    label={cards.progress.label}
    value={cards.progress.value}
    sub={cards.progress.sub}
    tone={cards.progress.tone}
    subTone={cards.progress.subTone}
    progressBar={cards.progress.progressBar}
    empty={cards.progress.empty}
    series={cumPnlSeries}
    seriesTone={cards.progress.tone === "negative" ? "negative" : "positive"}
  />
)}
```

4b. The `ownerUserId` value needs the subscription owner's user_id. Add it as a new prop on `PasserHeadlineCards` (`ownerUserId: string`), thread it back through `LiveAccountPanel` and `JournalShell` from the server page — at the page layer it's `license.user_id`.

- [ ] **Step 5: Tsc + tests**

Run: `npx tsc --noEmit && npx jest --silent`
Expected: PASS.

The existing `passer-headline-cards.test.tsx` tests pass `rule={null}` and rely on plain-text "Assign challenge rule" output. They will break — update them in the next step.

- [ ] **Step 6: Update the existing PasserHeadlineCards tests**

In `components/journal/passer-headline-cards.test.tsx`:

1. Add the new props to both `render(...)` calls: `ownerRules={[]}`, `subscriptionId={1}`, `licenseId={1}`, `ownerUserId="user-a"`.
2. The "renders empty Progress + Buffer when rule is null" test currently asserts `screen.getByText(/Assign challenge rule/i)`. That text is gone (replaced by the picker's empty state). Update the assertion:

```tsx
expect(screen.getByRole("link", { name: /create your first rule/i })).toBeInTheDocument();
```

Run: `npx jest components/journal/passer-headline-cards.test.tsx -v`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add app/dashboard/licenses/[id]/page.tsx components/journal/journal-shell.tsx components/journal/live-account-panel.tsx components/journal/passer-headline-cards.tsx components/journal/passer-headline-cards.test.tsx
git commit -m "feat(journal): wire RuleAssignPicker into the Prop Passer empty state

JournalShell now fetches and forwards the subscription owner's rules; the
empty Challenge Progress card renders an inline picker with a create-rule
link instead of plain text."
```

---

## Task 15: Visual smoke test

**Files:**
- None modified.

- [ ] **Step 1: Rebuild + restart the container**

Run from the project root:
```bash
docker compose up -d --build
docker compose logs --tail=20 copytraderx-license
```
Expect "Ready" in the logs.

- [ ] **Step 2: As a non-admin user**

Open `http://copytraderx.local` in a private window. Log in as a non-admin user with a Prop Passer license.

Verify:
1. Main nav now has "Propfirm Rules" link.
2. `/dashboard/propfirm-rules` shows an empty state.
3. Click "New rule" → fill the form → save → returns to list with 1 row.
4. On the license journal: the Challenge Progress card now has a Select with that one rule. Pick it, "Assign rule" → card flips into normal progress view.
5. Delete the rule from `/dashboard/propfirm-rules/<id>` → journal flips back to picker.

- [ ] **Step 3: As admin**

In a normal window (logged in as admin):
1. Main nav still shows "Propfirm Rules". Click it → see only admin's own rules (existing migrated rules).
2. Go to `/admin/users/<the non-admin from step 2>` → policy form shows that user's rules in the dropdown (the one they created + deleted earlier; if they don't have any, see the hint).
3. Try the legacy URLs — `/admin/propfirm-rules`, `/admin/propfirm-rules/new`, `/admin/propfirm-rules/<id>` — each should 302 to its `/dashboard/...` equivalent.

- [ ] **Step 4: Negative paths**

In the browser dev console while logged in as user A:
```js
fetch("/api/propfirm-rules?user_id=00000000-0000-0000-0000-000000000000", { method: "GET" }).then(r => r.status);
```
Expected: 403.

```js
fetch("/api/propfirm-rules", { method: "POST", body: JSON.stringify({}) }).then(r => r.status);
```
Expected: 400.

```js
fetch("/api/propfirm-rules/<some-other-user-rule-id>", { method: "DELETE" }).then(r => r.status);
```
Expected: 404.

If any of these are wrong, stop and fix before continuing.

---

## Task 16: Final sweep

**Files:**
- None modified.

- [ ] **Step 1: Full tsc + jest sweep**

Run: `npx tsc --noEmit && npm test -- --silent`
Expected: PASS.

- [ ] **Step 2: Build verification**

Run: `npm run build`
Expected: completes without errors.

- [ ] **Step 3: Verify clean tree + log**

```bash
git status
git log --oneline e231460..HEAD
```

`e231460` is the spec commit; the log should show ~14 commits (one per task that produced changes).

- [ ] **Step 4: Hand back to user**

Surface to user: "User-owned propfirm rules done. EA-repo migration committed; this-repo PR is N commits. Ready to push?" Wait for explicit confirmation before any push.

---

## Self-Review

**Spec coverage check (against `2026-05-20-user-owned-propfirm-rules-design.md`):**

| Spec requirement | Task |
|---|---|
| Migration: add `user_id`, backfill via email lookup, NOT NULL, unique constraint, FK index | Task 1 |
| Migration: subscriptions FK → `ON DELETE SET NULL` | Task 1 |
| Migration: four RLS policies (SELECT with admin bypass; INSERT/UPDATE/DELETE owner-only) | Task 1 |
| `PropfirmRule.user_id` added to TS type | Task 2 |
| `listPropfirmRules(userId)` signature | Task 2 (callers updated in Tasks 3, 7, 10, 14) |
| `/api/propfirm-rules` GET — caller's own / admin can `?user_id=` | Task 3 |
| `/api/propfirm-rules` POST — forces `user_id = caller.id`, 401/400 paths | Task 3 |
| `/api/propfirm-rules/[id]` GET/PATCH/DELETE — ownership; 404 not 403 for foreign rules | Task 4 |
| `PATCH /api/subscriptions/[id]` — owner can change propfirm_rule_id; rule_owner_mismatch; push_interval_seconds admin-only | Task 5 |
| `RuleForm` + `RulesTable` parameterized by `basePath` | Task 6 |
| `RuleForm.returnTo` for journal "create rule, return here" | Task 6 + Task 13 |
| `/dashboard/propfirm-rules` (list/new/edit) | Task 7 |
| Site nav: Propfirm Rules out of admin-only | Task 8 |
| `/admin/propfirm-rules/*` → redirect stubs | Task 9 |
| `/admin/users/[id]` scopes rules to target user | Task 10 |
| `SubscriptionPolicyForm` empty-rules hint | Task 11 |
| `RuleAssignPicker` component | Tasks 12 (test) + 13 (impl) |
| Empty Challenge Progress card swaps in picker | Task 14 |
| Visual smoke test across admin + user + negative paths | Task 15 |

**Placeholder scan:** no `TBD` / `TODO` / "implement later". The one "depends on the file's current structure" instruction in Task 8 is for a file the engineer has to read first; the desired outcome is explicit. Acceptable.

**Type consistency:**
- `PropfirmRule.user_id: string` defined once in Task 2 — used identically in Tasks 3, 4, 5, 7, 10, 12, 13, 14.
- `RuleAssignPicker` props (`subscriptionId`, `userRules`, `ownerUserId`, `returnTo`, optional `currentRuleId`) — test in Task 12 matches implementation in Task 13.
- `PasserHeadlineCards` new props (`ownerRules`, `subscriptionId`, `licenseId`, `ownerUserId`) — defined in Task 14, threaded backward through Task 14's other steps. All four props appear in the same shape everywhere.
- `listPropfirmRules(userId: string)` — same signature in Task 2 (definition), Tasks 3, 7, 10, 14 (callers).
- `extractRole({ user })` — used identically in Tasks 3, 4, 5, 7.
- Migration file name `20260520000001_propfirm_rules_per_user.sql` is consistent between Task 1 and the spec.

Plan ready for execution.
