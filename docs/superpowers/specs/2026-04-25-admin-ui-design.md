# CopyTraderX License Admin UI — Design Spec

**Date:** 2026-04-25
**Status:** Approved (pending user review of this written spec)
**Project root:** `~/Documents/development/copytraderx-license` (does not yet exist)
**Git remote:** `git@github.com:JSON-FX/copytraderx.git` (branch `main`)

## 1. Goal

Build a small admin UI that lets the developer create, view, edit, renew, revoke, and delete CopyTraderX-Impulse EA licenses. Writes go directly to the cloud Supabase project that the EA already validates against. Single-admin, local-only deployment via the existing `lgu-nginx` reverse proxy at `copytraderx.local`.

This replaces the current process of running `psql` commands or clicking through Supabase Studio to manage licenses.

## 2. Non-goals

- **Authentication.** The UI is dev-only on the admin's local machine. No login flow.
- **Customer-facing pages.** No signup, no checkout, nothing public.
- **Email automation.** The UI displays the license key for the admin to copy into a manual customer email.
- **Payment integration.** Stripe/Gumroad webhook ingestion is deferred. UI is purely manual issuance for v1.
- **Audit log.** Single admin, no need to track who-changed-what.
- **Mobile responsiveness.** Desktop-first.
- **Multi-language.** English only.

## 3. Architecture

```
Browser (http://copytraderx.local)
  ↓
lgu-nginx (existing reverse proxy)
  server_name copytraderx.local
  location /  →  copytraderx-license:3000
  ↓
Docker container: copytraderx-license
  Next.js 16 standalone server (Node 23)
  - Pages:        /licenses, /licenses/new, /licenses/[id]
  - API routes:   /api/licenses[/...]
  - Reads SUPABASE_SERVICE_ROLE_KEY from env
  ↓ HTTPS
Cloud Supabase: mkfabzqlxzeidfblxzhq.supabase.co
  Postgres: licenses table (RLS enabled, service-role bypasses)
  Edge function validate-license (consumed by EA, not by UI)
```

The UI never touches the EA-side licensing flow. It writes to the database; the EA reads/validates via the edge function. The two systems share only the `licenses` table schema.

## 4. Tech stack

| Layer | Choice | Rationale |
|---|---|---|
| Framework | Next.js 16 + React 19 (App Router) | Matches the developer's existing `metatrader-journal` project. Server Components keep the service-role key server-side. |
| Language | TypeScript | Type safety for DB rows + form payloads. |
| UI components | shadcn/ui + Tailwind v4 | Polished defaults, fast iteration. |
| Forms | react-hook-form + zod | Standard. Catches bad input before hitting Supabase. |
| DB client | `@supabase/supabase-js` | Server-side, service-role. |
| Date handling | `date-fns` | Calendar arithmetic for tier expiry. |
| Package manager | `pnpm` | Same as existing dev environment. |
| Container | Multi-stage Node 23 alpine, Next.js standalone | ~120MB image, fast restart. |
| Hosting | nginx → docker container on `lgu-network` | Same pattern as the developer's existing services. |
| Logo | `/Users/jsonse/Pictures/copytraderx/profile_3.png` | 2048×2048 PNG, navy + green. Copied to `public/copytraderx-logo.png`. |

## 5. Database schema change

### Migration `20260426000001_add_tier_column.sql`

```sql
alter table public.licenses
  add column tier text;

alter table public.licenses
  add constraint licenses_tier_check
  check (tier in ('monthly', 'quarterly', 'yearly', 'lifetime') or tier is null);
```

**Notes:**

- `tier` is nullable. Existing rows (e.g. `IMPX-PROD-AAAA-BBBB-CCCC`) get `tier=NULL` — legacy/manual.
- New rows from the admin UI always set a tier.
- `lifetime` tier maps to `expires_at = NULL`. UI shows "Never expires".
- The migration file lives in the **EA repo** (`JSONFX-IMPULSE/supabase/migrations/`) where Supabase migrations are authoritative. Applied with `supabase db push` from that repo.

### Tier → expires_at calculation

```ts
import { addMonths, addYears } from "date-fns";

function calculateExpiresAt(tier: Tier, from: Date): Date | null {
  switch (tier) {
    case 'monthly':   return addMonths(from, 1);
    case 'quarterly': return addMonths(from, 3);
    case 'yearly':    return addYears(from, 1);
    case 'lifetime':  return null;
  }
}
```

Calendar-based, weekend-inclusive. Standard subscription convention.

## 6. Pages and routing

### `/` — root

Server-side `redirect("/licenses")`. No content.

### `/licenses` — list view

**Top bar:**

- Title "Licenses"
- Search input (filters by `license_key` or `customer_email`, client-side over the fetched data)
- Status filter (All / Active / Revoked / Expired)
- **+ New License** button (top-right, primary)

**Table columns** (sortable):

| Column | Format | Notes |
|---|---|---|
| Status | Badge | "Revoked" (gray) if `status='revoked'`; else "Expired" (red) if `expires_at IS NOT NULL AND expires_at < now()`; else "Active" (green). Note: revoked wins over expired. |
| License Key | Mono, click-to-copy | `IMPX-XXXX-XXXX-XXXX-XXXX` |
| MT5 Account | Number | Right-aligned |
| Tier | Badge | "Monthly" / "Quarterly" / "Yearly" / "Lifetime" / "—" (null) |
| Customer Email | Text | Empty if null |
| Expires | Date or "Lifetime" | Red text if past |
| Last Validated | Relative time | `formatDistanceToNow` ("5 mins ago", "Never") |
| Actions | Dropdown menu | Edit / Renew Monthly / Renew Quarterly / Renew Yearly / Revoke / Delete |

**Empty state:** "No licenses yet. Create your first one." with a CTA button.

**Per-row actions:**

- **Renew Monthly/Quarterly/Yearly** — extends `expires_at` and updates `tier` accordingly. Toast: "Renewed to {date}". Disabled when `status='revoked'`.
- **Revoke** — confirms first ("This will block the EA from trading on the customer's account."), then sets `status='revoked'`.
- **Delete** — modal requires typing `DELETE` to confirm. Permanent.

### `/licenses/new` — create form

Fields, in order:

1. **License Key** — pre-filled with auto-generated `IMPX-XXXX-XXXX-XXXX-XXXX`. Editable. "Regenerate" button.
2. **MT5 Account** — numeric input, required, integer > 0.
3. **Tier** — radio group: `Monthly` / `Quarterly` / `Yearly` / `Lifetime`. Default: `Monthly`.
4. **Expires At** — read-only display of computed expiry based on tier. For `Lifetime`: "Never expires".
5. **Customer Email** — optional text input, validates email format if non-empty.
6. **Notes** — optional textarea.

Buttons: **Cancel** (back to list) / **Create** (save → toast "License created" → redirect to `/licenses`).

### `/licenses/[id]` — edit form

Same fields as create, with these differences:

- **License Key** — disabled, read-only display with click-to-copy.
- **MT5 Account** — editable. Yellow warning banner: "Changing this will invalidate the license on the customer's existing account until they reconfigure the EA."
- **Status** — adds a select: `Active` / `Revoked` / `Expired`.
- **Tier change handling** — radio: "Apply tier going forward (don't change current expiry)" or "Recompute expires_at from now using new tier". Default: apply going forward.
- **Expires At** — manually editable (date picker) for one-off cases ("give this customer 17 extra days").
- **Lifetime → tiered downgrade** confirms: "Switching from Lifetime to {tier} will set expires_at to {date}. Customer's EA will stop validating after that date."
- **Past expires_at + status=active** shows warning: "License is past expiry — customer's EA stopped trading on {date}. Renew?"
- Adds a **Read-only metadata section** at the bottom: `purchase_date`, `last_validated_at`, `created_at`.

Buttons: **Cancel** / **Save** / **Delete** (red, secondary, with double-confirm modal).

## 7. API routes

All API routes are server-side and use `@supabase/supabase-js` initialized with the **service role key** (bypasses RLS). The key is read from `process.env.SUPABASE_SERVICE_ROLE_KEY` and never exposed to the browser.

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/licenses` | List all licenses, ordered by `created_at desc`. No server-side filter/search params for v1 — the dataset is small and the client filters in memory. |
| `POST` | `/api/licenses` | Create a new license. Body validated by zod. |
| `GET` | `/api/licenses/[id]` | Fetch one license by id |
| `PATCH` | `/api/licenses/[id]` | Update fields. Body is a partial License object; the server merges and writes. Quick-renew sends `{ action: "renew", tier: "monthly" \| "quarterly" \| "yearly" }` which the server expands to `{tier, expires_at = calculateExpiresAt(tier, now)}`. Quick-revoke sends `{status: "revoked"}`. |
| `DELETE` | `/api/licenses/[id]` | Permanent removal |

**Why API routes (not Server Actions):**

- Cleaner mental model: forms POST JSON to endpoints.
- Easier to test with `curl`.
- Easier to swap to a different frontend later if the project grows.

## 8. Component structure

```
src/
  app/
    layout.tsx                      ← root layout: nav, fonts, theme provider, toaster
    page.tsx                        ← redirect "/" → "/licenses"
    licenses/
      page.tsx                      ← list view (server component, fetches data)
      new/page.tsx                  ← create form (client)
      [id]/page.tsx                 ← edit form (client)
    api/
      licenses/
        route.ts                    ← GET, POST
        [id]/route.ts               ← GET, PATCH, DELETE
  components/
    ui/                             ← shadcn primitives (auto-generated by `pnpm dlx shadcn add ...`)
    license-table.tsx               ← table + filters + per-row actions menu
    license-form.tsx                ← shared by /new and /[id]; receives `mode` and `initialValues`
    status-badge.tsx                ← Active/Revoked/Expired pill
    tier-badge.tsx                  ← Monthly/Quarterly/Yearly/Lifetime/— pill
    site-nav.tsx                    ← top nav: logo (32×32) + "CopyTraderX Licenses" wordmark
    confirm-dialog.tsx              ← reusable modal for revoke/delete confirmations
  lib/
    supabase/
      server.ts                     ← createClient with service-role, server-only
    license-key.ts                  ← generateKey() — 16 random chars from safe alphabet
    expiry.ts                       ← calculateExpiresAt(tier, from), isExpired(expires_at), formatExpiry(...)
    schemas.ts                      ← zod schemas for create/update payloads
    types.ts                        ← shared types: License, Tier, Status
public/
  copytraderx-logo.png              ← copied from ~/Pictures/copytraderx/profile_3.png at scaffold time
  favicon.ico                       ← derived from logo (single-file PNG link is acceptable v1)
```

**Component boundaries:**

- **List page** (`licenses/page.tsx`) — server component. Fetches data via `lib/supabase/server.ts` and passes it to `<LicenseTable>` as a prop.
- **`<LicenseTable>`** — client component. Handles filter, search, row action menu state. Calls API routes for actions.
- **Forms** — client components. Use `react-hook-form`. POST/PATCH to API routes. Show toasts on success/error.
- **`lib/supabase/server.ts`** — never imported by client code. Marked with `import "server-only"` to enforce.

## 9. Branding

- **Logo:** `/Users/jsonse/Pictures/copytraderx/profile_3.png` (2048×2048 PNG, navy + green palette, "CopyTraderX — Smart Trading, Simplified" wordmark within the image).
- **Where it ships:** copied into `public/copytraderx-logo.png` during scaffold.
- **Usage:**
  - Top nav — 32×32 icon left of "CopyTraderX Licenses" wordmark.
  - Empty/loading states — 96–128px for visual anchor.
  - Favicon — `<link rel="icon" href="/copytraderx-logo.png">` (modern browsers accept PNG).
- **Color palette inferred from logo:**
  - Primary navy `#1B2D6E` — text, primary buttons.
  - Accent green `#2DAA47` — success states, positive metrics.
  - Background — white (light mode) / near-black (dark mode default).
  - shadcn theme uses these via CSS variables.

## 10. Docker + nginx integration

### Project Dockerfile

```dockerfile
FROM node:23-alpine AS deps
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN corepack enable && pnpm install --frozen-lockfile

FROM node:23-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN corepack enable && pnpm build

FROM node:23-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
EXPOSE 3000
CMD ["node", "server.js"]
```

### docker-compose.yml

```yaml
services:
  copytraderx-license:
    container_name: copytraderx-license
    build: .
    restart: unless-stopped
    environment:
      SUPABASE_URL: https://mkfabzqlxzeidfblxzhq.supabase.co
      SUPABASE_SERVICE_ROLE_KEY: ${SUPABASE_SERVICE_ROLE_KEY}
    networks:
      - lgu-network
    expose:
      - "3000"

networks:
  lgu-network:
    external: true
    name: development_lgu-network
```

`SUPABASE_SERVICE_ROLE_KEY` provided via project-root `.env` (gitignored). Generated during scaffolding from the value already on the developer's Mac (Supabase CLI / dashboard).

### nginx.conf change

The existing `copytraderx.local` server block in `/Users/jsonse/Documents/development/nginx/nginx.conf` proxies everything to Supabase Kong. Replace it with:

```nginx
# CopyTraderX-Impulse License Admin UI
server {
    listen 80;
    server_name copytraderx.local;

    location / {
        set $upstream_ctxlic http://copytraderx-license:3000;
        proxy_pass $upstream_ctxlic;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

The EA hits `https://mkfabzqlxzeidfblxzhq.supabase.co` directly (cloud); the local Kong proxy is no longer needed for production.

### Disconnect lgu-nginx from local Supabase network

Earlier work connected `lgu-nginx` to `supabase_network_JSONFX-IMPULSE` so it could proxy Kong. Disconnect it after the nginx config change:

```bash
docker network disconnect supabase_network_JSONFX-IMPULSE lgu-nginx
```

Local Supabase stays reachable at `localhost:54321` for any future direct testing.

## 11. State matrix — error and edge cases

| Scenario | UI behavior |
|---|---|
| Supabase unreachable | Toast: "Couldn't reach Supabase. Try again." Form data preserved. |
| Insert collides on `license_key` unique constraint | Toast: "License key already exists — regenerate." |
| `mt5_account` already has another active license | Soft warning ("Account already has IMPX-..."), allows save. |
| zod validation fails | Inline field errors. Submit disabled. |
| Filter returns 0 rows | Empty state: "No licenses match your filters." |
| Browser refresh during typing | Form data not persisted — typing is short. |
| Renew on Revoked license | Quick-renew button disabled. Have to set status to Active first. |
| Lifetime → tiered downgrade | Confirm modal: "Switching to {tier} will set expires_at to {date}." |
| Past expires_at, status=active | Edit form warning banner. Renew is the obvious next action. |
| `last_validated_at` is null | Display "Never" in gray. |
| `tier` is null (legacy row) | Display "—" in tier badge. |

## 12. v1 deliverables

1. New repo at `~/Documents/development/copytraderx-license`, git-init, remote `git@github.com:JSON-FX/copytraderx.git`, branch `main`.
2. Next.js 16 + TypeScript + Tailwind v4 + shadcn/ui scaffold.
3. Supabase migration `20260426000001_add_tier_column.sql` added to the **EA repo** and applied via `supabase db push`.
4. `lib/supabase/server.ts`, `license-key.ts`, `expiry.ts`, `schemas.ts`, `types.ts`.
5. API routes `/api/licenses` and `/api/licenses/[id]`.
6. Pages `/licenses`, `/licenses/new`, `/licenses/[id]`.
7. Components: `LicenseTable`, `LicenseForm`, `StatusBadge`, `TierBadge`, `SiteNav`, `ConfirmDialog`.
8. Logo at `public/copytraderx-logo.png`.
9. Dockerfile + docker-compose.yml.
10. nginx server block updated, lgu-nginx disconnected from supabase network.
11. README explaining: prerequisites, setup, run, dev workflow, security warning ("DEV ONLY — do not deploy publicly without auth").
12. First push to `git@github.com:JSON-FX/copytraderx.git`.

## 13. Out of scope (deferred)

- **Authentication.** README warns; revisit when the project might move public.
- **Audit log.** Not needed at single-admin scale.
- **Bulk operations.** Not needed at v1 customer count.
- **Customer-facing pages.** No signup, no checkout.
- **Email integration.** Manual copy/paste from UI to your email client.
- **Stripe / Gumroad webhook ingestion.** Future automation will write to the same `licenses` table; UI surfaces the rows automatically.
- **Trial license flow.** A `'trial'` tier would require updating the `licenses_tier_check` constraint and adding a duration policy. Defer until ready.
- **Mobile responsiveness.** Desktop-first.
- **i18n.** English only.

## 14. Risks

| Risk | Mitigation |
|---|---|
| Service-role key leaks via committed `.env` | `.env` in `.gitignore`. README documents handling. |
| Container exposed beyond nginx | Network is `external: development_lgu-network` — same private network as other services. nginx is the only public-facing entry. |
| Supabase URL/key drift between EA and admin UI | Both reference the cloud project `mkfabzqlxzeidfblxzhq`. Documented in both READMEs. |
| Date-fns timezone confusion | UI displays in local time; storage is UTC ISO via Supabase. Standard. |
| Migration race vs. running EA | The `tier` column is additive and nullable — existing EA rows untouched, edge function unaffected. Apply at any time. |

## 15. README content (skeleton)

A short README at the project root must cover:

- One-paragraph "what is this"
- Prerequisites: Docker, Supabase CLI (for migrations), Node 23 + pnpm (for dev)
- Quick start: `cp .env.example .env`, fill in service-role key, `docker compose up -d --build`
- Open `http://copytraderx.local`
- Day-to-day: `docker compose restart`, `docker compose logs -f`, `docker compose down`
- Migration workflow: edit migration in EA repo, `supabase db push` from that repo
- ⚠️ **DEV ONLY — do not deploy publicly without adding authentication**
