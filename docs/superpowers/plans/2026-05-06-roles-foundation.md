# Roles Foundation — Implementation Plan (Plan 1 of 5)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Supabase-Auth-backed login, two-role middleware/guards, a forced-password-change flow, and a seed-admin script. Move existing admin pages under `/admin/*`. The existing licenses tool keeps working but now requires login as the seed admin.

**Architecture:** Real path-segment route trees (`/admin/*` for admin, `/dashboard/*` for user, `/login` + `/auth/*` public). Middleware reads `app_metadata.role` from the JWT for the fast role check; server-side `requireAdmin` / `requireUser` re-read the session as defense in depth. A new `public.users` table mirrors `auth.users` and stores `role` + `must_change_password`.

**Tech Stack:** Next.js 16 (App Router) + React 19 + Supabase Auth (`@supabase/supabase-js` + `@supabase/ssr` for cookies) + Jest (existing) + Zod (existing).

**Spec:** `docs/superpowers/specs/2026-05-06-admin-client-roles-design.md` (sections relevant to this plan: §4, §5.1, §5.4 partial, §6.1, §6.2, §7, §8 auth-related, §11 partial).

**Branch:** `feat/admin-client-roles` (already created, do not switch).

---

## Resuming this plan in a new session

This plan is designed to be picked up across multiple sessions. To resume:

1. Confirm you are on branch `feat/admin-client-roles`:
   ```bash
   git branch --show-current
   ```
   If not, ask the user — do **not** switch branches automatically.

2. Open this file and find the **first unchecked `- [ ]` step**. That is your starting point.

3. Verify the previous task's commit landed:
   ```bash
   git log --oneline -10
   ```
   The previous task's commit message should be visible. If not, the previous task may not have been committed — read its steps and confirm before proceeding.

4. Read the **Status** block immediately below. The executing session must keep it updated.

5. The plan file itself is the source of truth. Each completed step flips its `- [ ]` to `- [x]` **in the same commit** as the code change for that step. So `git log -- docs/superpowers/plans/2026-05-06-roles-foundation.md` shows the precise progression.

6. **Never** delete checked-off steps. If a step needs to change after being checked, append a **Correction** sub-section at the bottom of that task and explain.

---

## Status

> **Updated by the executor after each completed task. Single source of truth for "what's done."**

- **Last completed:** Task 4 (SSR cookie-bound Supabase client)
- **Last completed commit:** Task 1 = `08aeda4` (this repo); Task 2 = `8e14619` (EA repo); Task 3 = `e2934db` (this repo); Task 4 = `c2e2743` (this repo)
- **Next task to execute:** Task 5
- **Plan version:** 1.0
- **Note:** Spec amended on 2026-05-06 to add multi-product support. Plan 1 unchanged by the amendment (Plan 1 only adds users + auth, no license-row changes). Multi-product schema lands in Plan 2.

---

## File Structure

Files created or modified by this plan:

| Path | Action | Responsibility |
|---|---|---|
| `~/Documents/development/EA/JSONFX-IMPULSE/supabase/migrations/20260506000001_create_users_table.sql` | Create | `public.users` table + auth.users mirror trigger + role-to-app_metadata sync trigger |
| `package.json` | Modify | Add `@supabase/ssr`, `tsx`; add scripts `seed:admin`, `e2e` (placeholder) |
| `.env.example` | Modify | Document `INITIAL_ADMIN_PASSWORD`, `SUPABASE_ANON_KEY` |
| `lib/supabase/server.ts` | Modify | Keep service-role client; tighten exports |
| `lib/supabase/ssr.ts` | Create | SSR Supabase client bound to Next cookies |
| `lib/supabase/admin.ts` | Create | Helper wrapping admin auth API (createUser, updateUser, signOutUser) |
| `lib/role.ts` | Create | `requireAdmin(session)`, `requireUser(session)`, `getSessionRole()` |
| `lib/role.test.ts` | Create | Unit tests for `requireAdmin` / `requireUser` |
| `middleware.ts` | Create | Route-level role enforcement + auth redirects |
| `app/login/page.tsx` | Create | Email + password login form (Server Action) |
| `app/login/actions.ts` | Create | Login Server Action |
| `app/auth/change-password/page.tsx` | Create | Force-change form |
| `app/auth/change-password/actions.ts` | Create | Change-password Server Action |
| `app/auth/logout/route.ts` | Create | POST logout endpoint |
| `app/admin/layout.tsx` | Create | Admin route guard wrapper |
| `app/admin/licenses/page.tsx` etc. | Move | From `app/licenses/*` to `app/admin/licenses/*` |
| `app/admin/propfirm-rules/...` | Move | From `app/propfirm-rules/*` |
| `app/admin/settings/page.tsx` | Move | From `app/settings/page.tsx` |
| `app/page.tsx` | Modify | Redirect by role |
| `components/site-nav.tsx` | Modify | Update internal links to `/admin/...`; show logout button |
| `scripts/seed-admin.ts` | Create | Idempotent seed of `help.copytraderx@gmail.com` |
| `docs/superpowers/plans/2026-05-06-roles-foundation.md` | Modify (each task) | Flip `- [ ]` → `- [x]` and update Status block |

We are **not** touching the `subscriptions` table, RLS policies for `subscriptions`/`licenses`, the `/dashboard` tree, the email module, or Playwright in this plan. Those land in plans 2–5.

---

## Conventions for this plan

- **Each step is its own commit** unless explicitly grouped. The skill convention is "small, frequent commits."
- **Commit message format**: conventional commits as already used in this repo (`feat(...)`, `fix(...)`, `refactor(...)`, `chore(...)`, `docs(...)`).
- **Trailer**: every commit ends with `Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>` (matches existing repo style).
- **Updating this plan**: when a step is done, edit it from `- [ ]` to `- [x]` and update the Status block, in the **same commit** as the code change. The executor must include both file changes in `git add`.
- **Tests first**: pure-logic modules (`lib/role.ts`) follow Red → Green → Refactor.
- **No-test code**: pages, layouts, middleware, route handlers — verify manually per the Verification block in each task. We don't have component test infra; that's intentional per spec §9.

---

## Task 1: Add `@supabase/ssr` and `tsx` dependencies

`@supabase/ssr` is the Supabase-blessed package for Next.js cookie-based SSR auth (it replaces the older `auth-helpers-nextjs`). `tsx` lets us run `scripts/seed-admin.ts` without a build step.

**Files:**
- Modify: `package.json`
- Modify: `pnpm-lock.yaml` (auto)

- [x] **Step 1.1: Install runtime + dev dependencies**

Run:
```bash
pnpm add @supabase/ssr@latest
pnpm add -D tsx@latest
```

Expected: `package.json` and `pnpm-lock.yaml` update; `node_modules/@supabase/ssr` exists.

- [x] **Step 1.2: Add npm scripts**

Edit `package.json` `"scripts"` to add (preserve existing scripts):

```json
"seed:admin": "tsx scripts/seed-admin.ts"
```

(Do **not** add an `e2e` script yet — that's Plan 5.)

- [x] **Step 1.3: Verify install**

Run:
```bash
pnpm install
pnpm test
```

Expected: install succeeds; existing Jest suite still passes (we haven't changed any code yet).

- [x] **Step 1.4: Update plan + commit**

Edit this file: flip Task 1 steps to `[x]`. Update **Status**:
- Last completed: Task 1
- Last completed commit: (filled in by the commit hash after `git commit`)
- Next task to execute: Task 2

```bash
git add package.json pnpm-lock.yaml docs/superpowers/plans/2026-05-06-roles-foundation.md
git commit -m "$(cat <<'EOF'
chore(deps): add @supabase/ssr and tsx for auth + seed script

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

After committing, update the **Status** block again with the actual short SHA from `git rev-parse --short HEAD` and amend:

```bash
git commit --amend --no-edit  # re-includes the plan file with the SHA filled in
```

Or simpler: leave the SHA blank and fill it in on the next task's plan-update commit. Either is fine — the goal is that Status reflects truth.

---

## Task 2: Create `users` table migration

Adds `public.users`, the mirror trigger from `auth.users`, and the role→`app_metadata.role` sync trigger.

Migrations live in the **EA repo** per existing convention (see README §"Schema migrations"). The path is `~/Documents/development/EA/JSONFX-IMPULSE/supabase/migrations/`.

**Files:**
- Create: `~/Documents/development/EA/JSONFX-IMPULSE/supabase/migrations/20260506000001_create_users_table.sql`

- [x] **Step 2.1: Write the migration SQL**

Create the file with exactly this content:

```sql
-- public.users: application-level projection of auth.users.
-- Stores role + must_change_password flag. Credentials remain in auth.users.

create table public.users (
  id                    uuid primary key references auth.users(id) on delete cascade,
  email                 text not null unique,
  role                  text not null default 'user' check (role in ('admin', 'user')),
  full_name             text,
  must_change_password  boolean not null default true,
  created_at            timestamptz not null default now(),
  created_by            uuid references public.users(id)
);

create index idx_users_role on public.users(role);

-- Mirror trigger: when an auth.users row is inserted, create the matching public.users row.
-- Email is copied directly. Role defaults to 'user' but can be overridden via
-- raw_user_meta_data ({"role": "admin"}) at create time.
create or replace function public.handle_auth_user_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  resolved_role text;
  resolved_full_name text;
begin
  resolved_role := coalesce(new.raw_user_meta_data ->> 'role', 'user');
  if resolved_role not in ('admin', 'user') then
    resolved_role := 'user';
  end if;
  resolved_full_name := new.raw_user_meta_data ->> 'full_name';

  insert into public.users (id, email, role, full_name)
  values (new.id, new.email, resolved_role, resolved_full_name)
  on conflict (id) do nothing;

  -- Stamp the role into app_metadata so it's part of the JWT.
  update auth.users
     set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb)
                             || jsonb_build_object('role', resolved_role)
   where id = new.id;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_auth_user_insert();

-- Sync trigger: when public.users.role changes, mirror it to auth.users.app_metadata.
create or replace function public.handle_users_role_sync()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.role is distinct from old.role then
    update auth.users
       set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb)
                               || jsonb_build_object('role', new.role)
     where id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists on_users_role_change on public.users;
create trigger on_users_role_change
  after update of role on public.users
  for each row execute function public.handle_users_role_sync();

-- RLS: lock the table from anon/authenticated roles. Service role bypasses RLS.
-- Subsequent plans (Plan 2) will add user-readable policies; for now the table
-- is server-side only.
alter table public.users enable row level security;

comment on table public.users is
  'Application-level user records. Mirrored from auth.users via trigger. Role + must_change_password live here.';
```

- [x] **Step 2.2: Apply the migration**

Run:
```bash
cd ~/Documents/development/EA/JSONFX-IMPULSE
supabase db push
```

Expected: Supabase CLI reports the migration applied. If it asks for confirmation, type `y`.

- [x] **Step 2.3: Verify the table exists**

Run from any directory:
```bash
supabase projects api-keys --project-ref mkfabzqlxzeidfblxzhq
```

Then in a SQL session (Supabase Studio → SQL editor on `mkfabzqlxzeidfblxzhq`):
```sql
select column_name, data_type, is_nullable
  from information_schema.columns
 where table_schema = 'public' and table_name = 'users';
```

Expected: 7 rows: `id`, `email`, `role`, `full_name`, `must_change_password`, `created_at`, `created_by`.

Also verify both triggers exist:
```sql
select trigger_name from information_schema.triggers
 where trigger_name in ('on_auth_user_created', 'on_users_role_change');
```

Expected: 2 rows.

- [x] **Step 2.4: Commit (in EA repo) + update plan**

In the EA repo:
```bash
cd ~/Documents/development/EA/JSONFX-IMPULSE
git add supabase/migrations/20260506000001_create_users_table.sql
git commit -m "$(cat <<'EOF'
feat(db): add public.users table with auth mirror + role-sync triggers

For copytraderx-license admin/client roles work. Mirrors auth.users into
public.users on insert; keeps auth.users.app_metadata.role in sync with
public.users.role for JWT-based middleware checks.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

Back in the copytraderx-license repo, update this plan file: flip Task 2 steps to `[x]` and update Status. Commit:

```bash
cd /Users/jsonse/Documents/development/copytraderx-license
git add docs/superpowers/plans/2026-05-06-roles-foundation.md
git commit -m "$(cat <<'EOF'
docs(plan): mark Task 2 (users table migration) complete

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Document new environment variables

The seed admin needs `INITIAL_ADMIN_PASSWORD`. SSR auth needs the anon key (it's used client-side for cookie reads; safe to expose unlike the service role key).

**Files:**
- Modify: `.env.example`
- Modify: `.env` (your local copy — manually edit; we won't commit it)

- [x] **Step 3.1: Update `.env.example`**

Replace `.env.example` with this content:

```dotenv
# Cloud Supabase project
SUPABASE_URL=https://mkfabzqlxzeidfblxzhq.supabase.co

# Service role key — get from: supabase projects api-keys --project-ref mkfabzqlxzeidfblxzhq
# NEVER commit. NEVER expose to the browser.
SUPABASE_SERVICE_ROLE_KEY=

# Anon key — used by SSR client for reading cookies + verifying JWTs.
# Safe to expose to the browser; lives in NEXT_PUBLIC_ vars.
NEXT_PUBLIC_SUPABASE_URL=https://mkfabzqlxzeidfblxzhq.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=

# Default admin seed (used by `pnpm seed:admin`).
# Set this BEFORE running the seed script. Never commit the actual value.
INITIAL_ADMIN_EMAIL=help.copytraderx@gmail.com
INITIAL_ADMIN_PASSWORD=

NODE_ENV=development
```

- [x] **Step 3.2: Update your local `.env`**

Manually edit your local `.env` (do **not** commit). Add:

```
NEXT_PUBLIC_SUPABASE_URL=https://mkfabzqlxzeidfblxzhq.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<get from: supabase projects api-keys --project-ref mkfabzqlxzeidfblxzhq>
INITIAL_ADMIN_EMAIL=help.copytraderx@gmail.com
INITIAL_ADMIN_PASSWORD=Nd5rh51950d!!!
```

(The user previously stated this is the desired initial password.)

Verify `.env` is gitignored:
```bash
git check-ignore .env
```
Expected output: `.env`. If it's not ignored, abort and ask the user — never commit secrets.

- [x] **Step 3.3: Commit + update plan**

```bash
git add .env.example docs/superpowers/plans/2026-05-06-roles-foundation.md
# Flip Task 3 steps to [x] and update Status before this commit.
git commit -m "$(cat <<'EOF'
chore(env): document anon key and initial admin seed vars

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Build the SSR Supabase client

The existing `lib/supabase/server.ts` uses the **service role** and bypasses RLS — that's correct for admin server operations. For session-bearing requests (login, logout, change-password, role guards) we need a **cookie-bound anon-key client**. Add it as a sibling.

**Files:**
- Create: `lib/supabase/ssr.ts`

- [x] **Step 4.1: Write the SSR client**

Create `lib/supabase/ssr.ts`:

```typescript
import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function getSupabaseSSR() {
  const cookieStore = await cookies();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY must be set",
    );
  }

  return createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Server Component context — cookies are read-only here. The middleware
          // is responsible for refreshing the session cookie.
        }
      },
    },
  });
}
```

- [x] **Step 4.2: Verify it type-checks**

Run:
```bash
pnpm exec tsc --noEmit
```

Expected: no errors.

- [x] **Step 4.3: Commit + update plan**

```bash
git add lib/supabase/ssr.ts docs/superpowers/plans/2026-05-06-roles-foundation.md
# Flip Task 4 steps to [x] and update Status.
git commit -m "$(cat <<'EOF'
feat(supabase): add SSR cookie-bound client

Server-side client that reads/writes Supabase auth cookies via Next.js
cookie store. Used for session-bearing requests; service-role client in
lib/supabase/server.ts continues to handle admin operations.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Build the admin auth helpers

The seed-admin script and (later) the admin "create user" route need to call Supabase's auth admin API (create user with metadata, force-set password, sign user out). Wrap these in a small helper.

**Files:**
- Create: `lib/supabase/admin.ts`

- [ ] **Step 5.1: Write the admin helper**

Create `lib/supabase/admin.ts`:

```typescript
import "server-only";
import { getSupabaseAdmin } from "./server";

export type CreateAuthUserInput = {
  email: string;
  password: string;
  role: "admin" | "user";
  full_name?: string;
  email_confirm?: boolean;
};

export async function createAuthUser(input: CreateAuthUserInput) {
  const sb = getSupabaseAdmin();
  const { data, error } = await sb.auth.admin.createUser({
    email: input.email,
    password: input.password,
    email_confirm: input.email_confirm ?? true,
    user_metadata: {
      role: input.role,
      full_name: input.full_name,
    },
  });
  if (error) throw error;
  if (!data.user) throw new Error("createUser returned no user");
  return data.user;
}

export async function findAuthUserByEmail(email: string) {
  const sb = getSupabaseAdmin();
  const { data, error } = await sb.auth.admin.listUsers({ perPage: 1000 });
  if (error) throw error;
  return data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase()) ?? null;
}

export async function invalidateAuthSession(userId: string) {
  const sb = getSupabaseAdmin();
  const { error } = await sb.auth.admin.signOut(userId);
  if (error) throw error;
}
```

- [ ] **Step 5.2: Verify it type-checks**

Run:
```bash
pnpm exec tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5.3: Commit + update plan**

```bash
git add lib/supabase/admin.ts docs/superpowers/plans/2026-05-06-roles-foundation.md
# Flip Task 5 steps to [x] and update Status.
git commit -m "$(cat <<'EOF'
feat(supabase): add auth admin helpers (create, find, sign-out)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Build the seed-admin script

Idempotent: if `help.copytraderx@gmail.com` already exists in `auth.users`, no-op. Otherwise create with the env-supplied password and `must_change_password = true`.

**Files:**
- Create: `scripts/seed-admin.ts`

- [ ] **Step 6.1: Write the seed script**

Create `scripts/seed-admin.ts`:

```typescript
/* eslint-disable no-console */
import "dotenv/config";
import { createAuthUser, findAuthUserByEmail } from "@/lib/supabase/admin";
import { getSupabaseAdmin } from "@/lib/supabase/server";

async function main() {
  const email = process.env.INITIAL_ADMIN_EMAIL;
  const password = process.env.INITIAL_ADMIN_PASSWORD;

  if (!email || !password) {
    console.error(
      "INITIAL_ADMIN_EMAIL and INITIAL_ADMIN_PASSWORD must be set in the environment.",
    );
    process.exit(1);
  }

  const existing = await findAuthUserByEmail(email);
  if (existing) {
    console.log(`Admin ${email} already exists (id=${existing.id}). No-op.`);
    return;
  }

  const created = await createAuthUser({
    email,
    password,
    role: "admin",
    email_confirm: true,
  });
  console.log(`Created auth user ${email} (id=${created.id})`);

  // The mirror trigger from migration 20260506000001 has already created
  // public.users. Verify and ensure must_change_password=true.
  const sb = getSupabaseAdmin();
  const { data: row, error } = await sb
    .from("users")
    .select("id, role, must_change_password")
    .eq("id", created.id)
    .single();
  if (error || !row) {
    console.error("public.users row was not created by trigger:", error);
    process.exit(1);
  }
  if (row.role !== "admin" || row.must_change_password !== true) {
    const { error: updErr } = await sb
      .from("users")
      .update({ role: "admin", must_change_password: true })
      .eq("id", created.id);
    if (updErr) {
      console.error("Failed to enforce admin role / must_change_password:", updErr);
      process.exit(1);
    }
  }
  console.log("Seed admin ready. Force password change on first login.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

- [ ] **Step 6.2: Add `dotenv` for the script**

The script reads `.env` directly via `dotenv/config` (Next.js loads `.env` automatically; standalone scripts don't). Install:

```bash
pnpm add -D dotenv
```

- [ ] **Step 6.3: Run the seed**

Make sure `.env` has `INITIAL_ADMIN_PASSWORD=Nd5rh51950d!!!`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`. Then:

```bash
pnpm seed:admin
```

Expected output (first run):
```
Created auth user help.copytraderx@gmail.com (id=<uuid>)
Seed admin ready. Force password change on first login.
```

Run again:
```bash
pnpm seed:admin
```

Expected output (idempotent):
```
Admin help.copytraderx@gmail.com already exists (id=<uuid>). No-op.
```

- [ ] **Step 6.4: Verify in Supabase Studio**

In the SQL editor:
```sql
select id, email, role, must_change_password from public.users where email = 'help.copytraderx@gmail.com';
```

Expected: 1 row, `role='admin'`, `must_change_password=true`.

```sql
select id, email, raw_app_meta_data from auth.users where email = 'help.copytraderx@gmail.com';
```

Expected: 1 row; `raw_app_meta_data` contains `{"role": "admin"}` (alongside any other Supabase-managed keys).

- [ ] **Step 6.5: Commit + update plan**

```bash
git add scripts/seed-admin.ts package.json pnpm-lock.yaml docs/superpowers/plans/2026-05-06-roles-foundation.md
# Flip Task 6 steps to [x] and update Status.
git commit -m "$(cat <<'EOF'
feat(scripts): idempotent seed-admin script

Provisions help.copytraderx@gmail.com as admin on first run; no-op
afterwards. Reads INITIAL_ADMIN_EMAIL/INITIAL_ADMIN_PASSWORD from .env.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Role helpers (TDD)

Pure-logic module: given a session, return the user's role and throw a typed error if the role doesn't match. Easy to unit-test exhaustively.

**Files:**
- Create: `lib/role.ts`
- Create: `lib/role.test.ts`

- [ ] **Step 7.1: Write the failing test**

Create `lib/role.test.ts`:

```typescript
import { extractRole, requireAdmin, requireUser, RoleError } from "./role";

type FakeSession = { user: { id: string; app_metadata?: Record<string, unknown> } } | null;

function session(role?: "admin" | "user"): FakeSession {
  if (!role) return null;
  return {
    user: {
      id: "00000000-0000-0000-0000-000000000001",
      app_metadata: { role },
    },
  };
}

describe("extractRole", () => {
  it("returns the role when present", () => {
    expect(extractRole(session("admin"))).toBe("admin");
    expect(extractRole(session("user"))).toBe("user");
  });

  it("returns null for null session", () => {
    expect(extractRole(null)).toBeNull();
  });

  it("returns null when app_metadata.role is missing", () => {
    expect(extractRole({ user: { id: "x" } })).toBeNull();
  });

  it("returns null for an unknown role value", () => {
    expect(extractRole({ user: { id: "x", app_metadata: { role: "wizard" } } })).toBeNull();
  });
});

describe("requireAdmin", () => {
  it("returns the admin user when role=admin", () => {
    const s = session("admin")!;
    expect(requireAdmin(s)).toBe(s.user);
  });

  it("throws RoleError('unauthenticated') for null session", () => {
    expect(() => requireAdmin(null)).toThrow(
      expect.objectContaining({ code: "unauthenticated" }) as unknown as Error,
    );
  });

  it("throws RoleError('forbidden') when role=user", () => {
    expect(() => requireAdmin(session("user"))).toThrow(
      expect.objectContaining({ code: "forbidden" }) as unknown as Error,
    );
  });
});

describe("requireUser", () => {
  it("returns the user when role=user", () => {
    const s = session("user")!;
    expect(requireUser(s)).toBe(s.user);
  });

  it("returns the user when role=admin (admin can access user-scoped resources)", () => {
    const s = session("admin")!;
    expect(requireUser(s)).toBe(s.user);
  });

  it("throws unauthenticated for null", () => {
    expect(() => requireUser(null)).toThrow(RoleError);
  });
});
```

- [ ] **Step 7.2: Run the test (expected to fail)**

```bash
pnpm test -- lib/role.test.ts
```

Expected: all tests fail with "Cannot find module './role'".

- [ ] **Step 7.3: Implement `lib/role.ts`**

Create `lib/role.ts`:

```typescript
export type Role = "admin" | "user";

export type SessionUser = {
  id: string;
  app_metadata?: Record<string, unknown>;
};

export type SessionLike = {
  user: SessionUser;
} | null;

export class RoleError extends Error {
  code: "unauthenticated" | "forbidden";
  constructor(code: "unauthenticated" | "forbidden", message?: string) {
    super(message ?? code);
    this.name = "RoleError";
    this.code = code;
  }
}

export function extractRole(session: SessionLike): Role | null {
  if (!session) return null;
  const raw = session.user.app_metadata?.role;
  if (raw === "admin" || raw === "user") return raw;
  return null;
}

export function requireAdmin(session: SessionLike): SessionUser {
  if (!session) throw new RoleError("unauthenticated");
  if (extractRole(session) !== "admin") throw new RoleError("forbidden");
  return session.user;
}

export function requireUser(session: SessionLike): SessionUser {
  if (!session) throw new RoleError("unauthenticated");
  const role = extractRole(session);
  // Admins can access user-scoped resources (e.g. viewing a user's journal as admin).
  // Strictly user-only checks should compare extractRole() === "user" directly.
  if (role !== "admin" && role !== "user") throw new RoleError("forbidden");
  return session.user;
}
```

- [ ] **Step 7.4: Run the test (expected to pass)**

```bash
pnpm test -- lib/role.test.ts
```

Expected: all tests pass.

Also re-run the full suite:
```bash
pnpm test
```

Expected: all green.

- [ ] **Step 7.5: Commit + update plan**

```bash
git add lib/role.ts lib/role.test.ts docs/superpowers/plans/2026-05-06-roles-foundation.md
# Flip Task 7 steps to [x] and update Status.
git commit -m "$(cat <<'EOF'
feat(role): add role helpers with typed errors (TDD)

Pure-logic module covering extractRole, requireAdmin, requireUser, and a
RoleError class with code='unauthenticated'|'forbidden'. Tested
exhaustively in lib/role.test.ts.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: Move existing admin pages under `/admin/*`

A pure mechanical move. Existing `/licenses`, `/propfirm-rules`, `/settings` become `/admin/licenses`, `/admin/propfirm-rules`, `/admin/settings`. The `/admin/layout.tsx` (added in Task 9) will guard them. We do this **before** adding the layout so the move is reviewable on its own.

We are **not** moving the API routes under `/api/*` — those stay at their current paths and are guarded inline in later tasks/plans.

**Files:**
- Move: `app/licenses/` → `app/admin/licenses/`
- Move: `app/propfirm-rules/` → `app/admin/propfirm-rules/`
- Move: `app/settings/` → `app/admin/settings/`
- Modify: `app/page.tsx` (temporarily redirect to `/admin/licenses`)
- Modify: `components/site-nav.tsx` (update internal links)

- [ ] **Step 8.1: Move the directories**

```bash
mkdir -p app/admin
git mv app/licenses app/admin/licenses
git mv app/propfirm-rules app/admin/propfirm-rules
git mv app/settings app/admin/settings
```

Verify:
```bash
ls app/admin/
```

Expected: `licenses propfirm-rules settings`.

- [ ] **Step 8.2: Update `app/page.tsx`**

Edit `app/page.tsx` so the redirect points to the new path (we'll replace this with a role-based redirect in Task 11):

```typescript
import { redirect } from "next/navigation";

export default function HomePage() {
  redirect("/admin/licenses");
}
```

- [ ] **Step 8.3: Update internal links in `components/site-nav.tsx`**

Read `components/site-nav.tsx` first to see current link paths. Replace any link to `/licenses`, `/propfirm-rules`, or `/settings` with the `/admin/...` equivalent. Same for any active-state path comparisons (`pathname === "/licenses"` → `pathname === "/admin/licenses"`, etc.).

Search for all internal links to verify nothing was missed:
```bash
grep -rn 'href="/\(licenses\|propfirm-rules\|settings\)' app components 2>&1 | grep -v node_modules
```

Update every match. Same for `router.push("/licenses...")`, `redirect("/licenses...")`, etc.:
```bash
grep -rn 'router\.push.*"/\(licenses\|propfirm-rules\|settings\)' app components 2>&1
grep -rn 'redirect.*"/\(licenses\|propfirm-rules\|settings\)' app components 2>&1
```

- [ ] **Step 8.4: Manual verification**

Start the dev server:
```bash
pnpm dev
```

Open `http://localhost:3000` — should redirect to `/admin/licenses` and the licenses table should load.

Open `http://localhost:3000/admin/propfirm-rules` and `http://localhost:3000/admin/settings` — both should load.

Click around: navigation links should not 404. The old paths (`/licenses`, etc.) will 404 — that's expected (we'll add explicit redirects only if needed later).

Stop the dev server (`Ctrl+C`).

- [ ] **Step 8.5: Run tests**

```bash
pnpm test
pnpm exec tsc --noEmit
```

Expected: green.

- [ ] **Step 8.6: Commit + update plan**

```bash
git add -A
# Confirm only the expected files changed:
git status
# Flip Task 8 steps to [x] and update Status.
git commit -m "$(cat <<'EOF'
refactor(routes): move admin pages under /admin/*

Mechanical move of /licenses, /propfirm-rules, /settings to /admin/...
Internal links and home redirect updated. API routes unchanged.
Role-guarded layout follows in the next task.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: Login page + Server Action

Email + password form. On success: read `users.must_change_password`; if true, redirect to `/auth/change-password`; if false, redirect by role.

**Files:**
- Create: `app/login/page.tsx`
- Create: `app/login/actions.ts`

- [ ] **Step 9.1: Write the login Server Action**

Create `app/login/actions.ts`:

```typescript
"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { getSupabaseSSR } from "@/lib/supabase/ssr";
import { getSupabaseAdmin } from "@/lib/supabase/server";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export type LoginResult = { ok: true } | { ok: false; error: string };

export async function loginAction(_prev: unknown, formData: FormData): Promise<LoginResult> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { ok: false, error: "Enter a valid email and password." };
  }

  const sb = await getSupabaseSSR();
  const { data, error } = await sb.auth.signInWithPassword(parsed.data);
  if (error || !data.session || !data.user) {
    return { ok: false, error: "Invalid email or password." };
  }

  // Look up must_change_password and role using the service-role client
  // (the just-issued session may not have RLS-readable access yet).
  const admin = getSupabaseAdmin();
  const { data: row, error: rowError } = await admin
    .from("users")
    .select("role, must_change_password")
    .eq("id", data.user.id)
    .single();
  if (rowError || !row) {
    return { ok: false, error: "Account not provisioned. Contact administrator." };
  }

  if (row.must_change_password) {
    redirect("/auth/change-password");
  }

  redirect(row.role === "admin" ? "/admin/licenses" : "/dashboard");
}
```

Note: `redirect()` throws a `NEXT_REDIRECT` error that Next.js catches; do not wrap it in try/catch.

- [ ] **Step 9.2: Write the login page**

Create `app/login/page.tsx`:

```typescript
"use client";

import { useFormState, useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { loginAction, type LoginResult } from "./actions";

const initial: LoginResult = { ok: true };

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} className="w-full">
      {pending ? "Signing in…" : "Sign in"}
    </Button>
  );
}

export default function LoginPage() {
  const [state, formAction] = useFormState(loginAction, initial);
  const errorMessage = state.ok ? null : state.error;

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <form
        action={formAction}
        className="w-full max-w-sm space-y-4 rounded-lg border bg-card p-6 shadow-sm"
      >
        <div className="space-y-1">
          <h1 className="text-xl font-semibold">CopyTraderX</h1>
          <p className="text-sm text-muted-foreground">Sign in to continue.</p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input id="email" name="email" type="email" autoComplete="email" required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
          />
        </div>
        {errorMessage ? (
          <p className="text-sm text-destructive" role="alert">
            {errorMessage}
          </p>
        ) : null}
        <SubmitButton />
      </form>
    </div>
  );
}
```

- [ ] **Step 9.3: Manual verification**

Start dev server:
```bash
pnpm dev
```

Open `http://localhost:3000/login`. Try:

1. Empty form → submit → "Enter a valid email and password."
2. Wrong password → "Invalid email or password."
3. Correct creds (`help.copytraderx@gmail.com` / `Nd5rh51950d!!!`) → redirected to `/auth/change-password` (which 404s since we haven't built it yet — that's fine, we'll fix it in Task 10).

Stop the dev server.

- [ ] **Step 9.4: Type-check + tests**

```bash
pnpm exec tsc --noEmit
pnpm test
```

Expected: green.

- [ ] **Step 9.5: Commit + update plan**

```bash
git add app/login docs/superpowers/plans/2026-05-06-roles-foundation.md
# Flip Task 9 steps to [x] and update Status.
git commit -m "$(cat <<'EOF'
feat(auth): login page with email + password (Server Action)

On success, redirects to /auth/change-password if must_change_password,
otherwise to /admin/licenses or /dashboard by role. Uses @supabase/ssr
for cookie-bound session writes.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 10: Force-change-password page + logout

`/auth/change-password` lets the user pick a new password. On success: flip `users.must_change_password = false`, then redirect by role. Also build `/auth/logout` so the seed admin can sign out.

**Files:**
- Create: `app/auth/change-password/page.tsx`
- Create: `app/auth/change-password/actions.ts`
- Create: `app/auth/logout/route.ts`

- [ ] **Step 10.1: Write the change-password Server Action**

Create `app/auth/change-password/actions.ts`:

```typescript
"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { getSupabaseSSR } from "@/lib/supabase/ssr";
import { getSupabaseAdmin } from "@/lib/supabase/server";

const schema = z
  .object({
    password: z.string().min(8, "Password must be at least 8 characters."),
    confirm: z.string().min(1, "Confirm your new password."),
  })
  .refine((v) => v.password === v.confirm, {
    message: "Passwords do not match.",
    path: ["confirm"],
  });

export type ChangePasswordResult = { ok: true } | { ok: false; error: string };

export async function changePasswordAction(
  _prev: unknown,
  formData: FormData,
): Promise<ChangePasswordResult> {
  const parsed = schema.safeParse({
    password: formData.get("password"),
    confirm: formData.get("confirm"),
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  const sb = await getSupabaseSSR();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) {
    return { ok: false, error: "Not signed in." };
  }

  const { error: updateErr } = await sb.auth.updateUser({ password: parsed.data.password });
  if (updateErr) {
    return { ok: false, error: updateErr.message };
  }

  const admin = getSupabaseAdmin();
  const { data: row, error: flagErr } = await admin
    .from("users")
    .update({ must_change_password: false })
    .eq("id", user.id)
    .select("role")
    .single();
  if (flagErr || !row) {
    return { ok: false, error: "Could not update account flag." };
  }

  redirect(row.role === "admin" ? "/admin/licenses" : "/dashboard");
}
```

- [ ] **Step 10.2: Write the change-password page**

Create `app/auth/change-password/page.tsx`:

```typescript
"use client";

import { useFormState, useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { changePasswordAction, type ChangePasswordResult } from "./actions";

const initial: ChangePasswordResult = { ok: true };

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} className="w-full">
      {pending ? "Saving…" : "Save new password"}
    </Button>
  );
}

export default function ChangePasswordPage() {
  const [state, formAction] = useFormState(changePasswordAction, initial);
  const errorMessage = state.ok ? null : state.error;

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <form
        action={formAction}
        className="w-full max-w-sm space-y-4 rounded-lg border bg-card p-6 shadow-sm"
      >
        <div className="space-y-1">
          <h1 className="text-xl font-semibold">Set a new password</h1>
          <p className="text-sm text-muted-foreground">
            You must change your password before continuing.
          </p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="password">New password</Label>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="new-password"
            minLength={8}
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="confirm">Confirm</Label>
          <Input
            id="confirm"
            name="confirm"
            type="password"
            autoComplete="new-password"
            minLength={8}
            required
          />
        </div>
        {errorMessage ? (
          <p className="text-sm text-destructive" role="alert">
            {errorMessage}
          </p>
        ) : null}
        <SubmitButton />
      </form>
    </div>
  );
}
```

- [ ] **Step 10.3: Write the logout route**

Create `app/auth/logout/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { getSupabaseSSR } from "@/lib/supabase/ssr";

export async function POST() {
  const sb = await getSupabaseSSR();
  await sb.auth.signOut();
  return NextResponse.redirect(new URL("/login", process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"), {
    status: 303,
  });
}
```

Note: `NEXT_PUBLIC_APP_URL` isn't in `.env.example` yet. Add it.

- [ ] **Step 10.4: Add `NEXT_PUBLIC_APP_URL` to `.env.example` and `.env`**

Append to `.env.example`:
```
# Public origin used for absolute redirects (e.g., logout).
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

Add the same to your local `.env`. (For Docker, set to `http://copytraderx.local`.)

- [ ] **Step 10.5: Manual verification**

```bash
pnpm dev
```

1. Visit `/login`, sign in as `help.copytraderx@gmail.com` / `Nd5rh51950d!!!` → land on `/auth/change-password`.
2. Try mismatched passwords → see "Passwords do not match."
3. Try `Newpass99!` in both → redirected to `/admin/licenses`.
4. Verify in Supabase Studio: `select must_change_password from public.users where email='help.copytraderx@gmail.com';` → `false`.
5. POST `/auth/logout` (or click a logout link if you've wired one) → redirected to `/login`.
6. Log back in with the new password → land directly on `/admin/licenses` (no force-change anymore).

> **If you accidentally locked yourself out** — re-run `pnpm seed:admin` and manually reset:
> ```sql
> update public.users set must_change_password = true where email='help.copytraderx@gmail.com';
> ```
> Then in Studio Auth → reset password.

- [ ] **Step 10.6: Type-check + tests**

```bash
pnpm exec tsc --noEmit
pnpm test
```

Expected: green.

- [ ] **Step 10.7: Commit + update plan**

```bash
git add app/auth .env.example docs/superpowers/plans/2026-05-06-roles-foundation.md
# Flip Task 10 steps to [x] and update Status.
git commit -m "$(cat <<'EOF'
feat(auth): force-change-password page + logout route

After saving the new password, flips users.must_change_password=false
and redirects by role. Logout endpoint signs out and bounces to /login.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 11: Middleware — route guards & role-based redirects

The fast outer layer. Reads role from JWT (`app_metadata.role`) — no DB query.

- Anonymous → `/admin/*` or `/dashboard/*` → bounce to `/login`.
- User-role hitting `/admin/*` → bounce to `/dashboard`.
- Admin hitting `/dashboard/*` → bounce to `/admin/licenses`.
- Authenticated user with `must_change_password=true` hitting anything except `/auth/change-password` and `/auth/logout` → bounce to `/auth/change-password`.
  - **Implementation note:** `must_change_password` lives in `public.users`, not the JWT. Reading it in middleware adds a DB hit per request. To keep middleware DB-free, we instead stamp `app_metadata.must_change_password` from the change-password Server Action. Add that stamp now.
- `/login` while authenticated → bounce to role's home.

**Files:**
- Create: `middleware.ts`
- Modify: `app/auth/change-password/actions.ts` (also clear app_metadata flag on success)
- Modify: `lib/supabase/admin.ts` (stamp `app_metadata.must_change_password=true` on createAuthUser)
- Modify: `app/page.tsx` (replace static redirect with role-based)

- [ ] **Step 11.1: Stamp `must_change_password` into `app_metadata`**

We need this flag in the JWT so middleware can read it without a DB query.

**Approach:** when `seed-admin.ts` creates a user it should set `app_metadata.must_change_password = true`. Same for the (future) admin "create user" route in Plan 3. The change-password action clears it.

Edit `lib/supabase/admin.ts`. Replace the `createAuthUser` function with:

```typescript
export async function createAuthUser(input: CreateAuthUserInput) {
  const sb = getSupabaseAdmin();
  const { data, error } = await sb.auth.admin.createUser({
    email: input.email,
    password: input.password,
    email_confirm: input.email_confirm ?? true,
    user_metadata: {
      role: input.role,
      full_name: input.full_name,
    },
    app_metadata: {
      role: input.role,
      must_change_password: true,
    },
  });
  if (error) throw error;
  if (!data.user) throw new Error("createUser returned no user");
  return data.user;
}
```

Now the trigger (which only stamps `role` from `raw_user_meta_data`) and our explicit `app_metadata` block both contribute. The trigger merges, so this is fine.

Edit `app/auth/change-password/actions.ts`. After the `sb.auth.updateUser({ password })` call, add:

```typescript
const adminApi = getSupabaseAdmin();
await adminApi.auth.admin.updateUserById(user.id, {
  app_metadata: { must_change_password: false, role: row?.role ?? "user" },
});
```

(Move the `users` table update earlier so `row` is available, or refactor the function. The exact rewrite — for clarity, replace the entire function body after the `parsed` check with:)

```typescript
const sb = await getSupabaseSSR();
const {
  data: { user },
} = await sb.auth.getUser();
if (!user) return { ok: false, error: "Not signed in." };

const { error: updateErr } = await sb.auth.updateUser({ password: parsed.data.password });
if (updateErr) return { ok: false, error: updateErr.message };

const admin = getSupabaseAdmin();
const { data: row, error: flagErr } = await admin
  .from("users")
  .update({ must_change_password: false })
  .eq("id", user.id)
  .select("role")
  .single();
if (flagErr || !row) return { ok: false, error: "Could not update account flag." };

await admin.auth.admin.updateUserById(user.id, {
  app_metadata: { role: row.role, must_change_password: false },
});

// Force the JWT to refresh so the cleared flag is in the next request.
await sb.auth.refreshSession();

redirect(row.role === "admin" ? "/admin/licenses" : "/dashboard");
```

- [ ] **Step 11.2: Stamp the existing seed admin**

Since the seed admin was created before we added the `app_metadata.must_change_password` stamp, manually patch it once:

In Supabase Studio → SQL editor:
```sql
update auth.users
   set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb)
                           || '{"must_change_password": true, "role": "admin"}'::jsonb
 where email = 'help.copytraderx@gmail.com';
```

Verify:
```sql
select raw_app_meta_data from auth.users where email='help.copytraderx@gmail.com';
```

Expected: contains `"must_change_password": true` and `"role": "admin"`.

(Future seeds will get this automatically from the updated `createAuthUser`.)

- [ ] **Step 11.3: Write the middleware**

Create `middleware.ts` at the repo root:

```typescript
import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

const PUBLIC_PATHS = new Set<string>(["/login"]);
const PUBLIC_PREFIXES = ["/_next/", "/favicon", "/api/auth/"];
const ALWAYS_ALLOWED_AUTH_PATHS = new Set<string>(["/auth/change-password", "/auth/logout"]);

function isPublicPath(pathname: string): boolean {
  if (PUBLIC_PATHS.has(pathname)) return true;
  return PUBLIC_PREFIXES.some((p) => pathname.startsWith(p));
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const res = NextResponse.next({ request: req });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return req.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value, options } of cookiesToSet) {
            res.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  // Refresh the session if it's expired so getUser() returns a fresh JWT.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const role = (user?.app_metadata?.role as "admin" | "user" | undefined) ?? null;
  const mustChange = Boolean(user?.app_metadata?.must_change_password);

  // Public assets and the login page: never block.
  if (isPublicPath(pathname)) {
    // If a logged-in user hits /login, send them to their home.
    if (pathname === "/login" && user && !mustChange) {
      const home = role === "admin" ? "/admin/licenses" : "/dashboard";
      return NextResponse.redirect(new URL(home, req.url));
    }
    return res;
  }

  // Unauthenticated → /login (preserve original target).
  if (!user) {
    const url = new URL("/login", req.url);
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  // must_change_password=true → only /auth/change-password and /auth/logout allowed.
  if (mustChange && !ALWAYS_ALLOWED_AUTH_PATHS.has(pathname)) {
    return NextResponse.redirect(new URL("/auth/change-password", req.url));
  }

  // Role-mismatch redirects.
  if (pathname.startsWith("/admin")) {
    if (role !== "admin") return NextResponse.redirect(new URL("/dashboard", req.url));
  } else if (pathname.startsWith("/dashboard")) {
    if (role !== "user" && role !== "admin") {
      return NextResponse.redirect(new URL("/login", req.url));
    }
    // Admins viewing /dashboard is allowed in v1 (admin can browse user dashboards).
  }

  return res;
}

export const config = {
  matcher: [
    // Run middleware on every path EXCEPT next internals + static files.
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|gif|svg|webp|ico|css|js|map)$).*)",
  ],
};
```

- [ ] **Step 11.4: Update `app/page.tsx` for role-based redirect**

Replace `app/page.tsx`:

```typescript
import { redirect } from "next/navigation";
import { getSupabaseSSR } from "@/lib/supabase/ssr";

export default async function HomePage() {
  const sb = await getSupabaseSSR();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) redirect("/login");
  const role = (user.app_metadata?.role as "admin" | "user" | undefined) ?? "user";
  redirect(role === "admin" ? "/admin/licenses" : "/dashboard");
}
```

- [ ] **Step 11.5: Manual verification**

```bash
pnpm dev
```

Test matrix (open each in a private window if you've cached cookies):

| Cookie state | Path | Expected |
|---|---|---|
| Anonymous | `/admin/licenses` | bounce to `/login?next=/admin/licenses` |
| Anonymous | `/dashboard` | bounce to `/login?next=/dashboard` |
| Anonymous | `/login` | renders |
| Anonymous | `/` | bounces to `/login` |
| Admin (post change-password) | `/login` | bounces to `/admin/licenses` |
| Admin | `/admin/licenses` | renders |
| Admin | `/dashboard` | renders (admin allowed) |
| Admin with `must_change_password=true` (manually flip via Studio + reload) | `/admin/licenses` | bounces to `/auth/change-password` |
| Admin with `must_change_password=true` | `/auth/change-password` | renders |

If middleware breaks login flow, you can comment out the `must_change_password` redirect block while debugging — the form still works.

- [ ] **Step 11.6: Type-check + tests**

```bash
pnpm exec tsc --noEmit
pnpm test
```

Expected: green.

- [ ] **Step 11.7: Commit + update plan**

```bash
git add middleware.ts app/page.tsx app/login/actions.ts app/auth/change-password/actions.ts lib/supabase/admin.ts docs/superpowers/plans/2026-05-06-roles-foundation.md
# Flip Task 11 steps to [x] and update Status.
git commit -m "$(cat <<'EOF'
feat(auth): middleware-based route guards and role-based redirects

JWT-claim driven enforcement. must_change_password lives in app_metadata
so the check stays DB-free. Anonymous users → /login; user-role → /dashboard;
admin → /admin/licenses. /login while signed in bounces home.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 12: `/admin/layout.tsx` server-side guard

Defense in depth: middleware is the fast check, but every Server Component under `/admin/*` should also verify `requireAdmin`. We do this once in a layout that wraps the whole admin tree.

**Files:**
- Create: `app/admin/layout.tsx`

- [ ] **Step 12.1: Write the admin layout**

Create `app/admin/layout.tsx`:

```typescript
import { redirect } from "next/navigation";
import { getSupabaseSSR } from "@/lib/supabase/ssr";
import { extractRole } from "@/lib/role";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const sb = await getSupabaseSSR();
  const {
    data: { session },
  } = await sb.auth.getSession();
  const role = extractRole(session ? { user: session.user as never } : null);
  if (!session) redirect("/login");
  if (role !== "admin") redirect("/dashboard");
  return <>{children}</>;
}
```

- [ ] **Step 12.2: Manual verification**

Even with middleware off, this layout should also block. To test in isolation:

1. `pnpm dev`.
2. Sign in as the seed admin.
3. Open `/admin/licenses` → renders.
4. In Supabase Studio, change role:
   ```sql
   update public.users set role = 'user' where email = 'help.copytraderx@gmail.com';
   ```
   The trigger updates `auth.users.app_metadata.role` to `'user'`.
5. Force a session refresh: log out (`POST /auth/logout`), log back in.
6. Open `/admin/licenses` → bounces to `/dashboard`.
7. Restore admin:
   ```sql
   update public.users set role = 'admin' where email = 'help.copytraderx@gmail.com';
   ```
   Log out + back in.

- [ ] **Step 12.3: Type-check + tests**

```bash
pnpm exec tsc --noEmit
pnpm test
```

Expected: green.

- [ ] **Step 12.4: Commit + update plan**

```bash
git add app/admin/layout.tsx docs/superpowers/plans/2026-05-06-roles-foundation.md
# Flip Task 12 steps to [x] and update Status.
git commit -m "$(cat <<'EOF'
feat(admin): server-side admin layout guard

Defense in depth: every Server Component under /admin/* re-checks role
via the SSR session. Backstop for middleware in case it's bypassed.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 13: Logout button in admin nav

Now that users can be locked out of `/admin/*` by mismatched role, we need a visible way to log out. Add a button to `components/site-nav.tsx`.

**Files:**
- Modify: `components/site-nav.tsx`

- [ ] **Step 13.1: Read current `components/site-nav.tsx`**

```bash
cat components/site-nav.tsx
```

Note its structure (links, current styling) so the new button fits.

- [ ] **Step 13.2: Add a logout form**

In the right side of the nav (before or after the existing items, whichever matches the layout), add:

```tsx
<form action="/auth/logout" method="post" className="ml-auto">
  <button
    type="submit"
    className="text-sm text-muted-foreground hover:text-foreground transition-colors"
  >
    Sign out
  </button>
</form>
```

If the existing nav already has an `ml-auto` element, remove `ml-auto` from this form and place it appropriately.

- [ ] **Step 13.3: Manual verification**

```bash
pnpm dev
```

1. Sign in as admin.
2. Click "Sign out" in the nav.
3. Land on `/login`.
4. Refresh — still on `/login`.

- [ ] **Step 13.4: Type-check + tests**

```bash
pnpm exec tsc --noEmit
pnpm test
```

Expected: green.

- [ ] **Step 13.5: Commit + update plan**

```bash
git add components/site-nav.tsx docs/superpowers/plans/2026-05-06-roles-foundation.md
# Flip Task 13 steps to [x] and update Status.
git commit -m "$(cat <<'EOF'
feat(nav): add sign-out button to admin nav

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 14: Smoke verification + plan close-out

Final manual pass to confirm everything from this plan works together, then close out the plan.

- [ ] **Step 14.1: Full smoke test**

```bash
pnpm dev
```

End-to-end:

1. Open private window → `http://localhost:3000` → bounces to `/login`.
2. Sign in as `help.copytraderx@gmail.com` / current password.
3. Land on `/admin/licenses` (since `must_change_password` is already cleared from Task 10's verification).
4. Click `Sign out`. Land on `/login`.
5. Try `http://localhost:3000/admin/licenses` directly → bounce to `/login?next=/admin/licenses`.
6. Sign in again → land on `/admin/licenses` (the `next` parameter is honored only if you wired that into login; if not, that's fine — covered in Plan 3 polish).

Stop the dev server.

- [ ] **Step 14.2: Confirm full Jest suite + types pass**

```bash
pnpm test
pnpm exec tsc --noEmit
```

Expected: green.

- [ ] **Step 14.3: Update Status + close out**

Update Status block to:
- Last completed: Task 14
- Next task to execute: **Plan complete. See Plan 2 (`2026-05-06-roles-subscriptions-schema.md`) when ready to continue.**

```bash
git add docs/superpowers/plans/2026-05-06-roles-foundation.md
git commit -m "$(cat <<'EOF'
docs(plan): close out roles-foundation plan (Plan 1 of 5)

Auth, /admin/* moves, middleware + layout guards, seed admin, and force
password change all verified locally. Ready for Plan 2 (subscriptions
schema + RLS + legacy backfill).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Plan complete

When all tasks are checked, update the **Status** block one final time:

- **Last completed:** Plan 1 of 5
- **Plan complete:** ✅
- **Next plan:** `docs/superpowers/plans/2026-05-06-roles-subscriptions-schema.md` (write when ready)

**Branch state at end of plan:** `feat/admin-client-roles`. Do **not** merge to `main` until all 5 plans are complete and Plan 5 (E2E) passes.
