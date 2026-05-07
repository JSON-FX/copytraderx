# Obsidian Knowledge Base Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the CopyTraderX Obsidian vault as the canonical knowledge base — folder skeleton, seeded content from existing specs/code, two Bases, the first ADR, a `/update-kb` skill, and a CLAUDE.md pointer.

**Architecture:** Vault is canonical and lives at `/Users/jsonse/Documents/Obsidian/CopyTraderX/` (outside git). Repo only commits two artifacts: a CLAUDE.md edit and a project-level skill at `.claude/skills/update-kb/SKILL.md`. Vault writes are manual via the skill; Claude reads on start, never writes inline.

**Tech Stack:** Markdown with Obsidian frontmatter, Obsidian Bases (`.base` YAML files), kepano/obsidian-skills (`obsidian:obsidian-markdown`, `obsidian:obsidian-bases`) for syntax. No code dependencies in the repo.

**Spec:** `docs/superpowers/specs/2026-05-07-obsidian-knowledge-base-design.md`

---

## File Structure

### Vault (NOT committed to git — outside the repo)

| Path | Responsibility |
|---|---|
| `00-Index/CopyTraderX.md` | Project entry point: 1-paragraph summary + map of folders + links |
| `10-Domain/Glossary.md` | Domain terms (license, tier, account-type, role, IMPX key, etc.) |
| `10-Domain/Roles & Permissions.md` | Admin vs User capabilities |
| `10-Domain/License Lifecycle.md` | States: pending → active → revoked/expired |
| `20-Architecture/Stack.md` | Next 16, React 19, Tailwind v4, Supabase, Docker, nginx |
| `20-Architecture/Data Model.md` | Supabase tables (licenses, subscriptions, users, journal) |
| `20-Architecture/Auth & Middleware.md` | Supabase Auth, middleware.ts, role gating |
| `20-Architecture/EA ↔ License Server.md` | How the EA validates against Supabase |
| `30-Features/_Features Index.base` | Live table of feature notes by status/area |
| `30-Features/Licenses/_Hub.md` | Subsystem hub note |
| `30-Features/Licenses/Admin UI.md` | from spec 2026-04-25-admin-ui-design |
| `30-Features/Licenses/License Activation.md` | from spec 2026-04-25-license-activation-design |
| `30-Features/Licenses/Polling & Inactive Label.md` | from spec 2026-04-25-license-polling… |
| `30-Features/Propfirm Rules/_Hub.md` | Subsystem hub |
| `30-Features/Propfirm Rules/Account Type Gate.md` | from spec 2026-04-28-account-type-gate-design |
| `30-Features/Journal/_Hub.md` | Subsystem hub |
| `30-Features/Journal/Journal Integration.md` | from spec 2026-05-02-journal-integration-design |
| `30-Features/Users/_Hub.md` | Subsystem hub |
| `30-Features/Users/Admin Client Roles.md` | from spec 2026-05-06-admin-client-roles-design |
| `40-Decisions/_ADR Index.base` | Live table of ADRs |
| `40-Decisions/2026-05-07 — Vault is canonical KB.md` | First ADR |
| `90-References/External Links.md` | Supabase dashboard, EA repo, deploy URL |

### Repo (committed)

| Path | Responsibility |
|---|---|
| `.claude/skills/update-kb/SKILL.md` | Project-level skill that updates the vault on demand |
| `CLAUDE.md` (new file) | Top-level instructions; adds Knowledge Base section |

---

## Conventions

**Vault file paths in commands:** referenced as `$VAULT/...` where `VAULT=/Users/jsonse/Documents/Obsidian/CopyTraderX`. Each task that writes vault files exports `VAULT` once.

**Frontmatter schemas (used across feature notes and ADRs):**

Feature note:
```yaml
---
status: shipped            # planned | in-progress | shipped | revoked
area: licenses             # licenses | users | propfirm-rules | journal | auth
shipped: 2026-04-25        # ISO date or null
spec: docs/superpowers/specs/<file>.md
plan: docs/superpowers/plans/<file>.md
pr: null                   # GitHub PR number or null
related: []                # list of "[[Note Name]]"
---
```

ADR:
```yaml
---
status: accepted           # accepted | superseded | rejected
date: 2026-05-07
supersedes: null           # or "[[…]]"
---
```

**Verification rule:** every "create file" task has a matching `test -f` step. Every frontmatter-using task has a `grep` step that confirms the required keys are present. No code tests — this plan creates content, not behavior.

---

## Task 1: Create vault folder skeleton

**Files:**
- Create: vault folders only

- [ ] **Step 1: Verify vault root exists**

```bash
test -d /Users/jsonse/Documents/Obsidian/CopyTraderX && echo OK
```
Expected: `OK`

- [ ] **Step 2: Create folder skeleton**

```bash
VAULT=/Users/jsonse/Documents/Obsidian/CopyTraderX
mkdir -p \
  "$VAULT/00-Index" \
  "$VAULT/10-Domain" \
  "$VAULT/20-Architecture" \
  "$VAULT/30-Features/Licenses" \
  "$VAULT/30-Features/Users" \
  "$VAULT/30-Features/Propfirm Rules" \
  "$VAULT/30-Features/Journal" \
  "$VAULT/40-Decisions" \
  "$VAULT/90-References"
```

- [ ] **Step 3: Verify all folders exist**

```bash
VAULT=/Users/jsonse/Documents/Obsidian/CopyTraderX
for d in 00-Index 10-Domain 20-Architecture \
  "30-Features/Licenses" "30-Features/Users" "30-Features/Propfirm Rules" "30-Features/Journal" \
  40-Decisions 90-References; do
  test -d "$VAULT/$d" || echo "MISSING: $d"
done
echo DONE
```
Expected: only `DONE` (no `MISSING:` lines)

- [ ] **Step 4: No commit** — vault is outside git. Skip.

---

## Task 2: Write the project entry point

**Files:**
- Create: `$VAULT/00-Index/CopyTraderX.md`

- [ ] **Step 1: Write the entry-point note**

Use the Write tool to create `/Users/jsonse/Documents/Obsidian/CopyTraderX/00-Index/CopyTraderX.md` with this content:

```markdown
---
type: index
updated: 2026-05-07
---

# CopyTraderX

Single-admin Next.js tool to manage CopyTraderX-Impulse EA licenses, plus per-user journal views and propfirm-rule gating. Reads/writes the cloud Supabase project the EA validates against.

> Repo: `~/Documents/development/copytraderx-license` · Branch: see `git status`

## Map

- **[[Glossary]]** — domain terms
- **[[Roles & Permissions]]**, **[[License Lifecycle]]** — domain notes
- **[[Stack]]**, **[[Data Model]]**, **[[Auth & Middleware]]**, **[[EA ↔ License Server]]** — architecture
- **Features** — `30-Features/`:
  - [[30-Features/Licenses/_Hub|Licenses]]
  - [[30-Features/Users/_Hub|Users]]
  - [[30-Features/Propfirm Rules/_Hub|Propfirm Rules]]
  - [[30-Features/Journal/_Hub|Journal]]
- **Decisions** — `40-Decisions/` (see `_ADR Index.base`)
- **External links** — [[External Links]]

## How to update

Run `/update-kb` from the repo after a feature ships. The skill reads the latest spec/plan and writes feature notes here. Don't edit by hand unless you're fixing a typo.
```

- [ ] **Step 2: Verify file exists and has frontmatter**

```bash
VAULT=/Users/jsonse/Documents/Obsidian/CopyTraderX
test -f "$VAULT/00-Index/CopyTraderX.md" && head -3 "$VAULT/00-Index/CopyTraderX.md" | grep -q "^type: index" && echo OK
```
Expected: `OK`

---

## Task 3: Seed the domain notes

**Files:**
- Create: `$VAULT/10-Domain/Glossary.md`
- Create: `$VAULT/10-Domain/Roles & Permissions.md`
- Create: `$VAULT/10-Domain/License Lifecycle.md`

- [ ] **Step 1: Write `Glossary.md`**

Create `/Users/jsonse/Documents/Obsidian/CopyTraderX/10-Domain/Glossary.md`:

```markdown
---
type: domain
updated: 2026-05-07
---

# Glossary

Canonical names for domain concepts. Defer to this when naming code, UI labels, and PR titles.

- **License** — Row in `licenses` table. Identified by an `IMPX-XXXX-XXXX-XXXX-XXXX` (or product-prefixed) key. The EA validates against this row.
- **License key** — Format `<PRODUCT>-XXXX-XXXX-XXXX-XXXX`. Per-product prefix; legacy is `IMPX-`. See `lib/license-key.ts`.
- **Tier** — Billing cadence: `monthly` | `quarterly` | `yearly`. Sets `expires_at` on issue/renew.
- **Status** — License state: `pending` | `active` | `revoked` | `expired`. See [[License Lifecycle]].
- **Account type** — MT5 account category: `live` | `demo`. Each subscription bundles one of each. See [[Account Type Gate]].
- **Subscription** — A user's paid entitlement to one product. Bundles a live + demo license slot.
- **Product** — `impulse` | `ctx-core` | `ctx-live` | `ctx-prop-passer` | `ctx-prop-funded`.
- **Role** — `admin` | `user`. See [[Roles & Permissions]].
- **Propfirm rule** — Constraint enforced for prop accounts (e.g. daily DD limit). Stored in `propfirm_rules`.
- **Journal** — Per-account trade log read from a separate journal Supabase project. See [[Journal Integration]].
- **Liveness** — Whether an EA is currently checking in. See `lib/liveness.ts`.
- **Expiry** — Date logic for license validity. See `lib/expiry.ts`.
```

- [ ] **Step 2: Write `Roles & Permissions.md`**

Create `/Users/jsonse/Documents/Obsidian/CopyTraderX/10-Domain/Roles & Permissions.md`:

```markdown
---
type: domain
updated: 2026-05-07
---

# Roles & Permissions

Source: [[Admin Client Roles]] (spec `2026-05-06-admin-client-roles-design`).

## Admin

- Create users (manual provisioning).
- See all licenses, all journals, all subscriptions.
- Approve/reject license claim requests.
- Manage propfirm rules.
- Reset any user's password.

## User

- Log in with email + password (Supabase Auth).
- Claim license slots by entering an MT5 account number.
- View journal for accounts they own — only those.
- See their own subscriptions and licenses.

## Enforcement

- Route gating: `middleware.ts` + per-route role check.
- Data gating: server-side queries scoped by `user_id`. Service-role key never reaches the browser.
```

- [ ] **Step 3: Write `License Lifecycle.md`**

Create `/Users/jsonse/Documents/Obsidian/CopyTraderX/10-Domain/License Lifecycle.md`:

```markdown
---
type: domain
updated: 2026-05-07
---

# License Lifecycle

```
pending → active → expired
            │
            └─ revoked (manual, terminal)
```

- **pending** — issued, no MT5 account yet bound.
- **active** — bound to an MT5 account, within `expires_at`. EA validates OK.
- **expired** — `expires_at` < now. EA refuses on next check.
- **revoked** — admin set `status='revoked'`. Terminal; cannot be re-activated, issue a new key instead.

Renewal (`Renew Monthly/Quarterly/Yearly`) extends `expires_at` and updates `tier`. It does NOT clear `revoked`.

See `lib/expiry.ts`, `lib/license-key.ts`.
```

- [ ] **Step 4: Verify all three files exist**

```bash
VAULT=/Users/jsonse/Documents/Obsidian/CopyTraderX
for f in "Glossary.md" "Roles & Permissions.md" "License Lifecycle.md"; do
  test -f "$VAULT/10-Domain/$f" || echo "MISSING: $f"
done
echo DONE
```
Expected: only `DONE`.

---

## Task 4: Seed the architecture notes

**Files:**
- Create: `$VAULT/20-Architecture/Stack.md`
- Create: `$VAULT/20-Architecture/Data Model.md`
- Create: `$VAULT/20-Architecture/Auth & Middleware.md`
- Create: `$VAULT/20-Architecture/EA ↔ License Server.md`

- [ ] **Step 1: Write `Stack.md`**

Create `/Users/jsonse/Documents/Obsidian/CopyTraderX/20-Architecture/Stack.md`:

```markdown
---
type: architecture
updated: 2026-05-07
---

# Stack

## Frontend
- Next.js 16 (App Router) · React 19
- Tailwind CSS v4 · shadcn/ui (Radix-based)
- react-hook-form + zod
- Phosphor + Lucide icons, Sonner toasts, Recharts

## Backend / data
- Supabase (Postgres + Auth) — cloud project the EA also validates against
- `@supabase/ssr` for server components, `service_role` key on server only

## Infra
- Docker (multi-stage Node 23 alpine, ~120 MB)
- `lgu-nginx` reverse-proxies `copytraderx.local` → `copytraderx-license:3000`
- Local dev: `pnpm dev` on `localhost:3000` bypasses nginx + Docker

## Tooling
- pnpm 10, TypeScript, ESLint
- Jest + ts-jest (lib only; UI verified visually)
- Nodemailer (email module)
```

- [ ] **Step 2: Write `Data Model.md`**

Create `/Users/jsonse/Documents/Obsidian/CopyTraderX/20-Architecture/Data Model.md`:

```markdown
---
type: architecture
updated: 2026-05-07
---

# Data Model

> Migrations live in the **EA repo** (`~/Documents/development/EA/JSONFX-IMPULSE/supabase/migrations/`), not here.

## Tables

- **`auth.users`** — Supabase Auth managed.
- **`public.users`** — app-level mirror; carries `role` (`admin`|`user`).
- **`subscriptions`** — one paid entitlement per row. Carries `product`, `user_id`. Bundles a live + demo license slot.
- **`licenses`** — `key` (string), `mt5_account`, `account_type` (`live`|`demo`), `tier`, `status`, `expires_at`, `subscription_id`, `product`.
- **`propfirm_rules`** — per-product constraints (DD %, lot caps, …).
- **Journal tables** — separate Supabase project; read-only from this app. See [[EA ↔ License Server]] and [[Journal Integration]].

## Conventions

- `service_role` key for all writes — server-only.
- Browser uses anon key with RLS for user-scoped reads.
- Duplicate-email check uses `public.users`, not `auth.users` (admin endpoint).
```

- [ ] **Step 3: Write `Auth & Middleware.md`**

Create `/Users/jsonse/Documents/Obsidian/CopyTraderX/20-Architecture/Auth & Middleware.md`:

```markdown
---
type: architecture
updated: 2026-05-07
---

# Auth & Middleware

## Auth provider

Supabase Auth, email + password. Welcome flow uses Supabase **invite** (not magic link) — see commit `292c744`.

## Login

`app/login/` — server-action sign-in. Redirects to `/admin` (admin) or `/` (user).

## Middleware

`middleware.ts` runs on every request:

1. Refreshes the Supabase session cookie.
2. Gates `/admin/**` to `role='admin'`.
3. Gates user-scoped routes by `user_id`.

## Server-side data access

- All API routes use the `service_role` key via `lib/supabase/`.
- Never expose `service_role` to the browser.
- User-scoped reads still check the caller's session and filter by `user_id` server-side.
```

- [ ] **Step 4: Write `EA ↔ License Server.md`**

Create `/Users/jsonse/Documents/Obsidian/CopyTraderX/20-Architecture/EA ↔ License Server.md`:

```markdown
---
type: architecture
updated: 2026-05-07
---

# EA ↔ License Server

The CopyTraderX-Impulse EA running in MT5 validates against the **same Supabase project** this admin UI writes to. The admin UI does not call the EA; the EA polls Supabase.

## Validation

- EA reads its own `licenses` row by `key`.
- Refuses to trade if `status != 'active'` or `expires_at < now()`.
- Re-checks every ~12h, or sooner on restart. Effective revocation latency: up to 12h.

## Liveness

`lib/liveness.ts` — UI-side: an EA is "live" if it's checked in within a recent window. See [[Polling & Inactive Label]].

## Account binding

When an EA first runs, it writes its MT5 account number to its license row. The admin UI then displays it. See [[License Activation]].

## Schema source of truth

Migrations live in the EA repo. To change schema: edit `~/Documents/development/EA/JSONFX-IMPULSE/supabase/migrations/`, run `supabase db push`, restart this container.
```

- [ ] **Step 5: Verify all four files exist**

```bash
VAULT=/Users/jsonse/Documents/Obsidian/CopyTraderX
for f in "Stack.md" "Data Model.md" "Auth & Middleware.md" "EA ↔ License Server.md"; do
  test -f "$VAULT/20-Architecture/$f" || echo "MISSING: $f"
done
echo DONE
```
Expected: only `DONE`.

---

## Task 5: Create the subsystem hubs

**Files:**
- Create: `$VAULT/30-Features/Licenses/_Hub.md`
- Create: `$VAULT/30-Features/Users/_Hub.md`
- Create: `$VAULT/30-Features/Propfirm Rules/_Hub.md`
- Create: `$VAULT/30-Features/Journal/_Hub.md`

- [ ] **Step 1: Write `Licenses/_Hub.md`**

Create `/Users/jsonse/Documents/Obsidian/CopyTraderX/30-Features/Licenses/_Hub.md`:

```markdown
---
type: hub
area: licenses
updated: 2026-05-07
---

# Licenses

Subsystem hub. License CRUD, key generation, lifecycle, polling/liveness.

Code: `app/admin/licenses/`, `app/api/licenses/`, `lib/license-key.ts`, `lib/expiry.ts`, `lib/liveness.ts`.

Domain: [[License Lifecycle]], [[Glossary]] (license, key, tier, status).

## Features

- [[Admin UI]]
- [[License Activation]]
- [[Polling & Inactive Label]]
```

- [ ] **Step 2: Write `Users/_Hub.md`**

Create `/Users/jsonse/Documents/Obsidian/CopyTraderX/30-Features/Users/_Hub.md`:

```markdown
---
type: hub
area: users
updated: 2026-05-07
---

# Users

Subsystem hub. Auth, roles, user provisioning, password reset.

Code: `app/admin/users/`, `app/api/users/`, `app/auth/`, `app/login/`, `lib/users.ts`, `lib/role.ts`, `middleware.ts`.

Domain: [[Roles & Permissions]].

## Features

- [[Admin Client Roles]]
```

- [ ] **Step 3: Write `Propfirm Rules/_Hub.md`**

Create `/Users/jsonse/Documents/Obsidian/CopyTraderX/30-Features/Propfirm Rules/_Hub.md`:

```markdown
---
type: hub
area: propfirm-rules
updated: 2026-05-07
---

# Propfirm Rules

Subsystem hub. Per-product propfirm constraints and account-type gating.

Code: `app/admin/propfirm-rules/`, `app/api/propfirm-rules/`, `lib/products.ts`.

## Features

- [[Account Type Gate]]
```

- [ ] **Step 4: Write `Journal/_Hub.md`**

Create `/Users/jsonse/Documents/Obsidian/CopyTraderX/30-Features/Journal/_Hub.md`:

```markdown
---
type: hub
area: journal
updated: 2026-05-07
---

# Journal

Subsystem hub. Per-account trade journal view, sourced from a separate Supabase project.

Code: `app/api/journal/`, `lib/journal/`.

## Features

- [[Journal Integration]]
```

- [ ] **Step 5: Verify all four hubs exist**

```bash
VAULT=/Users/jsonse/Documents/Obsidian/CopyTraderX
for d in "Licenses" "Users" "Propfirm Rules" "Journal"; do
  test -f "$VAULT/30-Features/$d/_Hub.md" || echo "MISSING: $d/_Hub.md"
done
echo DONE
```
Expected: only `DONE`.

---

## Task 6: Backfill feature notes from existing specs

**Files:**
- Create: `$VAULT/30-Features/Licenses/Admin UI.md`
- Create: `$VAULT/30-Features/Licenses/License Activation.md`
- Create: `$VAULT/30-Features/Licenses/Polling & Inactive Label.md`
- Create: `$VAULT/30-Features/Propfirm Rules/Account Type Gate.md`
- Create: `$VAULT/30-Features/Journal/Journal Integration.md`
- Create: `$VAULT/30-Features/Users/Admin Client Roles.md`

> All six existing specs have `Status: Approved` and have been shipped. Use `status: shipped` for all of them. The `shipped` date is the spec's filename date (best signal we have without per-feature merge timestamps). PR numbers are unknown — leave `pr: null`. The `/update-kb` skill (Task 9) will be the way to fill these in going forward.

- [ ] **Step 1: Write `Admin UI.md`**

Create `/Users/jsonse/Documents/Obsidian/CopyTraderX/30-Features/Licenses/Admin UI.md`:

```markdown
---
status: shipped
area: licenses
shipped: 2026-04-25
spec: docs/superpowers/specs/2026-04-25-admin-ui-design.md
plan: docs/superpowers/plans/2026-04-25-admin-ui-implementation.md
pr: null
related:
  - "[[License Lifecycle]]"
  - "[[Stack]]"
---

# Admin UI

The original CopyTraderX-License admin tool: list, create, edit, renew, revoke, delete licenses. Single-admin, dev-only, no auth (auth came later — see [[Admin Client Roles]]).

## What it does

- Lists all licenses with filters and an action menu per row.
- "+ New License" form: pre-fills a fresh `IMPX-XXXX-XXXX-XXXX-XXXX`, asks for MT5 account, tier, optional email/notes.
- Renew (Monthly/Quarterly/Yearly) extends `expires_at` and sets `tier`.
- Revoke flips `status='revoked'` (terminal).
- Delete requires typing `DELETE` to confirm.

## Gotchas

- Service-role key only on server; never reaches the browser.
- Schema migrations live in the EA repo, not here.
```

- [ ] **Step 2: Write `License Activation.md`**

Create `/Users/jsonse/Documents/Obsidian/CopyTraderX/30-Features/Licenses/License Activation.md`:

```markdown
---
status: shipped
area: licenses
shipped: 2026-04-25
spec: docs/superpowers/specs/2026-04-25-license-activation-design.md
plan: docs/superpowers/plans/2026-04-25-license-activation.md
pr: null
related:
  - "[[License Lifecycle]]"
  - "[[EA ↔ License Server]]"
---

# License Activation

Flow that binds a license key to an MT5 account when the EA first runs.

## What it does

- EA writes its MT5 account number into its license row on first check-in.
- Admin UI surfaces the bound account in the license list.
- Status transitions `pending → active` once bound and within `expires_at`.

## Gotchas

- Activation is one-shot; rebinding to a different account is a manual admin operation.
```

- [ ] **Step 3: Write `Polling & Inactive Label.md`**

Create `/Users/jsonse/Documents/Obsidian/CopyTraderX/30-Features/Licenses/Polling & Inactive Label.md`:

```markdown
---
status: shipped
area: licenses
shipped: 2026-04-25
spec: docs/superpowers/specs/2026-04-25-license-polling-and-inactive-label-design.md
plan: docs/superpowers/plans/2026-04-25-license-polling-and-inactive-label.md
pr: null
related:
  - "[[EA ↔ License Server]]"
---

# Polling & Inactive Label

Adds a "live / inactive" label to each license row based on recent EA check-ins.

## What it does

- `lib/liveness.ts` computes liveness from the EA's last-seen timestamp.
- UI shows an "inactive" badge when the EA hasn't checked in within the threshold.
- Polling refresh on the license list keeps the badge current.

## Gotchas

- Liveness threshold is tuned to the EA's ~12h check-in cadence — don't tighten it without coordinating with the EA.
```

- [ ] **Step 4: Write `Account Type Gate.md`**

Create `/Users/jsonse/Documents/Obsidian/CopyTraderX/30-Features/Propfirm Rules/Account Type Gate.md`:

```markdown
---
status: shipped
area: propfirm-rules
shipped: 2026-04-28
spec: docs/superpowers/specs/2026-04-28-account-type-gate-design.md
plan: docs/superpowers/plans/2026-04-28-account-type-gate.md
pr: null
related:
  - "[[Glossary]]"
---

# Account Type Gate

Gate licenses by MT5 account type (`live` vs `demo`) and apply propfirm rules accordingly.

## What it does

- Licenses carry an `account_type` (`live` | `demo`).
- A subscription bundles one live + one demo slot.
- Propfirm rules apply per-product to live accounts; demo is unconstrained.

## Gotchas

- The bundle invariant (1 live + 1 demo per subscription) is enforced server-side; UI nudges but cannot be the only check.
```

- [ ] **Step 5: Write `Journal Integration.md`**

Create `/Users/jsonse/Documents/Obsidian/CopyTraderX/30-Features/Journal/Journal Integration.md`:

```markdown
---
status: shipped
area: journal
shipped: 2026-05-02
spec: docs/superpowers/specs/2026-05-02-journal-integration-design.md
plan: docs/superpowers/plans/2026-05-02-journal-integration.md
pr: null
related:
  - "[[Data Model]]"
  - "[[Roles & Permissions]]"
---

# Journal Integration

Reads per-account trade journal data from a separate Supabase project and surfaces it in the UI.

## What it does

- `lib/journal/` reads from the journal Supabase project (read-only).
- API routes return journal slices scoped to the caller's owned accounts.
- Users see their own accounts; admins see all.

## Gotchas

- Two Supabase projects: don't cross the keys.
- Journal data is sourced — never written from this app.
```

- [ ] **Step 6: Write `Admin Client Roles.md`**

Create `/Users/jsonse/Documents/Obsidian/CopyTraderX/30-Features/Users/Admin Client Roles.md`:

```markdown
---
status: shipped
area: users
shipped: 2026-05-06
spec: docs/superpowers/specs/2026-05-06-admin-client-roles-design.md
plan: docs/superpowers/plans/2026-05-06-roles-admin-users.md
pr: null
related:
  - "[[Roles & Permissions]]"
  - "[[Auth & Middleware]]"
  - "[[Glossary]]"
---

# Admin Client Roles

Adds Supabase-Auth-backed login with `admin` and `user` roles, plus per-user data scoping. Includes the multi-product amendment: `product` column on subscriptions/licenses, per-product license-key prefixes, product picker.

## What it does

- Email + password login via Supabase Auth.
- Admin: provision users, see all licenses/journals, manage propfirm rules, approve/reject claims.
- User: claim slots by MT5 account, view own journal, see own subscriptions.
- Welcome flow uses Supabase invite (not magic link).
- Manual provisioning + admin password reset.

## Gotchas

- Duplicate-email check uses `public.users`, not `auth.users`.
- Service role only on server; user-scoped reads still filter by `user_id` server-side.
- Bundles 1 live + 1 demo license per subscription, per product.
```

- [ ] **Step 7: Verify all six feature notes exist with required frontmatter**

```bash
VAULT=/Users/jsonse/Documents/Obsidian/CopyTraderX
FILES=(
  "30-Features/Licenses/Admin UI.md"
  "30-Features/Licenses/License Activation.md"
  "30-Features/Licenses/Polling & Inactive Label.md"
  "30-Features/Propfirm Rules/Account Type Gate.md"
  "30-Features/Journal/Journal Integration.md"
  "30-Features/Users/Admin Client Roles.md"
)
for f in "${FILES[@]}"; do
  test -f "$VAULT/$f" || { echo "MISSING: $f"; continue; }
  for k in status area shipped spec; do
    grep -q "^$k:" "$VAULT/$f" || echo "MISSING-KEY $k in $f"
  done
done
echo DONE
```
Expected: only `DONE`.

---

## Task 7: Create the two Bases

**Files:**
- Create: `$VAULT/30-Features/_Features Index.base`
- Create: `$VAULT/40-Decisions/_ADR Index.base`

> Bases use YAML and reference frontmatter properties. Schema reference: kepano/obsidian-skills `obsidian-bases/SKILL.md`. If the engineer is unsure of a syntax detail, invoke the `obsidian:obsidian-bases` skill.

- [ ] **Step 1: Write `_Features Index.base`**

Create `/Users/jsonse/Documents/Obsidian/CopyTraderX/30-Features/_Features Index.base`:

```yaml
filters:
  and:
    - file.inFolder("30-Features")
    - file.name != "_Hub"
    - 'note["status"] != null'
properties:
  note.status:
    displayName: Status
  note.area:
    displayName: Area
  note.shipped:
    displayName: Shipped
  note.pr:
    displayName: PR
views:
  - type: table
    name: All features
    order:
      - file.name
      - note.status
      - note.area
      - note.shipped
      - note.pr
    sort:
      - property: note.shipped
        direction: DESC
  - type: table
    name: By area
    order:
      - note.area
      - file.name
      - note.status
      - note.shipped
    sort:
      - property: note.area
        direction: ASC
      - property: note.shipped
        direction: DESC
```

- [ ] **Step 2: Write `_ADR Index.base`**

Create `/Users/jsonse/Documents/Obsidian/CopyTraderX/40-Decisions/_ADR Index.base`:

```yaml
filters:
  and:
    - file.inFolder("40-Decisions")
    - 'note["date"] != null'
properties:
  note.status:
    displayName: Status
  note.date:
    displayName: Date
  note.supersedes:
    displayName: Supersedes
views:
  - type: table
    name: All ADRs
    order:
      - file.name
      - note.status
      - note.date
      - note.supersedes
    sort:
      - property: note.date
        direction: DESC
```

- [ ] **Step 3: Verify both Bases exist and are non-empty**

```bash
VAULT=/Users/jsonse/Documents/Obsidian/CopyTraderX
for f in "30-Features/_Features Index.base" "40-Decisions/_ADR Index.base"; do
  test -s "$VAULT/$f" || echo "MISSING-OR-EMPTY: $f"
done
echo DONE
```
Expected: only `DONE`.

> If Obsidian reports a syntax error opening a Base, invoke `obsidian:obsidian-bases` for current syntax and adjust. Bases syntax has evolved; treat the schema above as the intent, not gospel.

---

## Task 8: Write the first ADR + External Links

**Files:**
- Create: `$VAULT/40-Decisions/2026-05-07 — Vault is canonical KB.md`
- Create: `$VAULT/90-References/External Links.md`

- [ ] **Step 1: Write the first ADR**

Create `/Users/jsonse/Documents/Obsidian/CopyTraderX/40-Decisions/2026-05-07 — Vault is canonical KB.md`:

```markdown
---
status: accepted
date: 2026-05-07
supersedes: null
---

# 2026-05-07 — Vault is canonical KB

## Context

The repo has good design specs (`docs/superpowers/specs/`) and implementation plans (`docs/superpowers/plans/`), but no evergreen home for domain terms, architecture summaries, glossary, or cross-feature relationships. New Claude sessions re-derive context by grepping the codebase, which is slow and lossy.

## Decision

Use the existing Obsidian vault at `/Users/jsonse/Documents/Obsidian/CopyTraderX/` as the canonical knowledge base. Vault is owned by Obsidian and lives outside the repo. Updates happen on demand via a project-level `/update-kb` skill, not automatically. CLAUDE.md points to the vault and forbids inline writes.

## Consequences

- Vault is not git-versioned. Loss/move of the folder loses history.
- CLAUDE.md stays small (~15 lines added).
- New sessions read the vault first, write specs/plans into the repo, then run `/update-kb` after shipping to keep the vault current.
- Two-place writes when shipping a feature: spec/plan in repo, feature note in vault.
```

- [ ] **Step 2: Write `External Links.md`**

Create `/Users/jsonse/Documents/Obsidian/CopyTraderX/90-References/External Links.md`:

```markdown
---
type: reference
updated: 2026-05-07
---

# External Links

- **Supabase project (license + auth):** `mkfabzqlxzeidfblxzhq.supabase.co`
- **EA repo (schema source of truth):** `~/Documents/development/EA/JSONFX-IMPULSE`
- **License repo:** `~/Documents/development/copytraderx-license` · `git@github.com:JSON-FX/copytraderx.git`
- **Local deploy:** `http://copytraderx.local` (via `lgu-nginx`)
- **Local dev:** `http://localhost:3000` (`pnpm dev`)
- **Obsidian skills repo:** https://github.com/kepano/obsidian-skills
```

- [ ] **Step 3: Verify both files exist**

```bash
VAULT=/Users/jsonse/Documents/Obsidian/CopyTraderX
test -f "$VAULT/40-Decisions/2026-05-07 — Vault is canonical KB.md" || echo MISSING-ADR
test -f "$VAULT/90-References/External Links.md" || echo MISSING-LINKS
echo DONE
```
Expected: only `DONE`.

---

## Task 9: Create the `/update-kb` skill

**Files:**
- Create: `.claude/skills/update-kb/SKILL.md`

- [ ] **Step 1: Create the skill directory**

```bash
mkdir -p /Users/jsonse/Documents/development/copytraderx-license/.claude/skills/update-kb
test -d /Users/jsonse/Documents/development/copytraderx-license/.claude/skills/update-kb && echo OK
```
Expected: `OK`.

- [ ] **Step 2: Write `SKILL.md`**

Create `/Users/jsonse/Documents/development/copytraderx-license/.claude/skills/update-kb/SKILL.md`:

```markdown
---
name: update-kb
description: Update the CopyTraderX Obsidian knowledge base from the latest specs, plans, and shipped commits. Use when the user says "/update-kb", "update the knowledge base", "update the vault", or after a feature ships. Read-then-confirm-then-write — never bulk-edit autonomously.
---

# update-kb

Update the CopyTraderX Obsidian vault at `/Users/jsonse/Documents/Obsidian/CopyTraderX/` from the latest specs, plans, and commits in this repo. Vault is canonical (see ADR `40-Decisions/2026-05-07 — Vault is canonical KB.md`).

## Constants

- `VAULT = /Users/jsonse/Documents/Obsidian/CopyTraderX`
- Subsystem folders: `Licenses`, `Users`, `Propfirm Rules`, `Journal`. Map specs to subsystems by area; ask if ambiguous.

## Process

Always run all steps in order. Never skip the confirmation prompts.

### 1. Discover candidates

- List all specs in `docs/superpowers/specs/*.md` sorted by filename date DESC.
- List all feature notes in `$VAULT/30-Features/**/*.md` (skip `_Hub.md`) and read their `spec:` frontmatter values.
- Candidates = specs with no matching feature note, OR specs whose file mtime is newer than the matching feature note's mtime.
- If there are zero candidates, report "Vault is up to date." and STOP.

### 2. For each candidate, prompt the user

For each candidate spec, ask:

> "Found `<spec-filename>`. Subsystem? (Licenses / Users / Propfirm Rules / Journal / skip)"

If skip, move to the next candidate without writing anything.

### 3. Write or update the feature note

Path: `$VAULT/30-Features/<Subsystem>/<Feature Name>.md`. Derive `<Feature Name>` from the spec's H1 heading (strip "Design", "— Design", "Spec" suffixes). Confirm the derived name with the user before writing.

Frontmatter template (fill every field; use `null` if unknown):

```yaml
---
status: shipped            # planned | in-progress | shipped | revoked
area: <licenses|users|propfirm-rules|journal|auth>
shipped: <ISO date or null>
spec: docs/superpowers/specs/<file>.md
plan: docs/superpowers/plans/<file>.md   # find the matching plan by date prefix
pr: <PR number or null>
related: []                                # ask the user
---
```

Body sections (each one short, pulled from the spec):

- **What it does** — 3–6 bullets, paraphrased from the spec.
- **Gotchas** — non-obvious constraints. Pull from spec "Risks", "Non-goals", or amendments.

If the feature note already exists, MERGE: keep the user's body edits, only update frontmatter. Show a diff before writing.

### 4. Glossary check

Scan the spec text for proper-noun-ish terms (capitalized words, kebab-case identifiers like `account-type`, table names). For each that does NOT appear in `$VAULT/10-Domain/Glossary.md`, ask:

> "New term `<term>` — add to Glossary? (y/n, or paste a one-line definition)"

Append confirmed terms to Glossary.md alphabetically. NEVER auto-add without confirmation.

### 5. ADR prompt

Ask:

> "Any non-obvious decision in this feature worth recording as an ADR? (y/n)"

If yes, ask for a short title and three sections (Context, Decision, Consequences). Write to `$VAULT/40-Decisions/<YYYY-MM-DD> — <Title>.md` with this frontmatter:

```yaml
---
status: accepted
date: <today>
supersedes: null   # or "[[<existing ADR title>]]"
---
```

### 6. Index refresh

If a new subsystem hub was created (shouldn't happen — the four are fixed), add a link to it from `$VAULT/00-Index/CopyTraderX.md`. Otherwise skip.

### 7. Report

Print a summary table:

```
Created:
  - <path>
Updated:
  - <path>
Glossary additions:
  - <term>
ADRs created:
  - <path>
```

The vault is NOT git-tracked. Do not run `git add` against vault paths. Only the repo's `CLAUDE.md` and this skill file are committed.

## Constraints

- Read-then-confirm-then-write. Never bulk-create or bulk-update without per-item confirmation.
- Never delete vault notes. To mark a feature dead, set `status: revoked` and add a one-line "deprecated YYYY-MM-DD because …" at the top of the body.
- Never inline architecture/stack details into `CLAUDE.md`. They live in `20-Architecture/`.
- For markdown syntax questions (callouts, embeds, properties), invoke the `obsidian:obsidian-markdown` skill.
- For Bases syntax questions, invoke the `obsidian:obsidian-bases` skill.

## Out of scope

- Auto-syncing the vault to a remote.
- Generating notes from git log alone (without a spec).
- Editing notes in `10-Domain/` or `20-Architecture/` automatically — those are human-curated; suggest edits, never write.
```

- [ ] **Step 3: Verify the skill file is well-formed**

```bash
F=/Users/jsonse/Documents/development/copytraderx-license/.claude/skills/update-kb/SKILL.md
test -f "$F" || { echo MISSING; exit 1; }
head -1 "$F" | grep -q "^---$" && echo HAS-FRONTMATTER
grep -q "^name: update-kb$" "$F" && echo HAS-NAME
grep -q "^description: " "$F" && echo HAS-DESCRIPTION
```
Expected:
```
HAS-FRONTMATTER
HAS-NAME
HAS-DESCRIPTION
```

---

## Task 10: Create root `CLAUDE.md`

**Files:**
- Create: `CLAUDE.md` (project root)

> The repo currently has no top-level `CLAUDE.md` (only `.claude/settings.local.json`). Create a fresh one. Keep it small.

- [ ] **Step 1: Write `CLAUDE.md`**

Create `/Users/jsonse/Documents/development/copytraderx-license/CLAUDE.md`:

```markdown
# CopyTraderX License — Claude Notes

Single-admin Next.js 16 + Supabase tool to manage CopyTraderX-Impulse EA licenses, with per-user journal views and propfirm-rule gating.

See `README.md` for setup, scripts, and Docker/nginx layout.

## Knowledge Base

Project knowledge base (Obsidian vault):
`/Users/jsonse/Documents/Obsidian/CopyTraderX/`

**Read it** at the start of any non-trivial work — especially:

- Brainstorming a new feature (check `30-Features/` for related work, `10-Domain/` for terms).
- Touching auth, roles, licenses, or propfirm rules (check the relevant subsystem hub).
- Naming things — defer to `10-Domain/Glossary.md`.

**Don't write to it inline.** Vault updates happen via `/update-kb` after a feature is shipped. If you notice the vault is out of date during a session, flag it — don't fix it silently.

## Specs and plans

- Design specs: `docs/superpowers/specs/YYYY-MM-DD-<topic>-design.md`
- Implementation plans: `docs/superpowers/plans/YYYY-MM-DD-<feature>.md`

After a feature ships, run `/update-kb` to backfill the vault.
```

- [ ] **Step 2: Verify the file**

```bash
F=/Users/jsonse/Documents/development/copytraderx-license/CLAUDE.md
test -f "$F" && grep -q "^## Knowledge Base$" "$F" && grep -q "/update-kb" "$F" && echo OK
```
Expected: `OK`.

---

## Task 11: Smoke-test the skill discovery

**Files:** none modified

> This is a manual sanity check, not an automated test. The skill behavior itself is exercised by the user when they run `/update-kb`. Here we just confirm the file is in the right place and the marker text is correct.

- [ ] **Step 1: Confirm skill is discoverable as a project-level skill**

```bash
ls /Users/jsonse/Documents/development/copytraderx-license/.claude/skills/update-kb/SKILL.md && \
  grep -E "^(name|description):" /Users/jsonse/Documents/development/copytraderx-license/.claude/skills/update-kb/SKILL.md
```
Expected output (order of name/description doesn't matter):
```
.../SKILL.md
name: update-kb
description: Update the CopyTraderX Obsidian knowledge base ...
```

- [ ] **Step 2: Open the vault in Obsidian and verify**

This step is user-driven. Ask the user to:

1. Open Obsidian, switch to the `CopyTraderX` vault.
2. Confirm the file tree shows `00-Index`, `10-Domain`, `20-Architecture`, `30-Features`, `40-Decisions`, `90-References` in that order.
3. Open `30-Features/_Features Index.base` and confirm 6 rows render (the six backfilled feature notes). If the Base shows zero rows or a syntax error, invoke the `obsidian:obsidian-bases` skill to repair the syntax against current Bases.
4. Open `40-Decisions/_ADR Index.base` and confirm 1 row (the canonical-KB ADR).

If Bases fail to render, fix syntax inline with `obsidian:obsidian-bases` and re-verify. Do NOT proceed to Task 12 until both Bases render.

---

## Task 12: Commit the repo changes

**Files:**
- Modify: stage `.claude/skills/update-kb/SKILL.md` and `CLAUDE.md`

- [ ] **Step 1: Check working tree**

```bash
cd /Users/jsonse/Documents/development/copytraderx-license
git status --short
```
Expected (order may differ):
```
?? .claude/skills/update-kb/
?? CLAUDE.md
 M next-env.d.ts
```

(`next-env.d.ts` is a pre-existing unrelated change — leave it alone.)

- [ ] **Step 2: Stage only the new files**

```bash
cd /Users/jsonse/Documents/development/copytraderx-license
git add CLAUDE.md .claude/skills/update-kb/SKILL.md
git status --short
```
Expected:
```
A  .claude/skills/update-kb/SKILL.md
A  CLAUDE.md
 M next-env.d.ts
```

- [ ] **Step 3: Commit**

```bash
cd /Users/jsonse/Documents/development/copytraderx-license
git commit -m "$(cat <<'EOF'
feat(kb): add Obsidian KB pointer + /update-kb skill

CLAUDE.md points at the vault at ~/Documents/Obsidian/CopyTraderX/.
/update-kb skill backfills feature notes from specs/plans on demand.
Vault content lives outside git; only the pointer + skill are committed.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
git log -1 --oneline
```
Expected: a new commit with the message above.

---

## Done criteria

- [ ] Vault has the folder skeleton (Task 1).
- [ ] Entry-point `00-Index/CopyTraderX.md` written (Task 2).
- [ ] Three domain notes written (Task 3).
- [ ] Four architecture notes written (Task 4).
- [ ] Four subsystem hubs written (Task 5).
- [ ] Six feature notes backfilled from existing specs (Task 6).
- [ ] Two `.base` files render in Obsidian (Tasks 7 + 11).
- [ ] First ADR + External Links written (Task 8).
- [ ] `/update-kb` skill committed (Task 9).
- [ ] Root `CLAUDE.md` committed (Task 10).
- [ ] User has visually verified the vault in Obsidian (Task 11).
- [ ] Repo has one new commit (Task 12).
