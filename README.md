# CopyTraderX License Admin UI

Single-admin Next.js tool to manage CopyTraderX-Impulse EA licenses. Reads/writes the same cloud Supabase project (`mkfabzqlxzeidfblxzhq.supabase.co`) that the EA validates against. Local-only deployment via Docker behind the existing `lgu-nginx` reverse proxy at `http://copytraderx.local`.

> ⚠️ **DEV ONLY** — there is no authentication. Do not deploy this publicly without adding a login flow.

## Prerequisites

- Docker (with `lgu-nginx` and `development_lgu-network` already configured per `~/Documents/development/nginx/`)
- `supabase` CLI (for migrations)
- Node 23 + pnpm 10 (for local dev)

## Quick start

```bash
# 1. Get the service role key
supabase projects api-keys --project-ref mkfabzqlxzeidfblxzhq

# 2. Configure environment
cp .env.example .env
# Paste the service_role JWT into SUPABASE_SERVICE_ROLE_KEY in .env

# 3. Start the container
docker compose up -d --build

# 4. Open the UI
open http://copytraderx.local
```

## Day-to-day

```bash
docker compose restart       # after a code change (rebuilds incrementally — slow; prefer dev mode)
docker compose logs -f       # debug
docker compose down          # stop
```

## Local dev (faster iteration)

```bash
pnpm install
pnpm dev
# Open http://localhost:3000
```

While in dev mode, requests go straight to the Next.js dev server on port 3000, bypassing nginx + Docker.

## Schema migrations

The `licenses` table schema lives in the **EA repo** (`~/Documents/development/EA/JSONFX-IMPULSE/supabase/migrations/`). To change the schema:

```bash
cd ~/Documents/development/EA/JSONFX-IMPULSE
# Add/edit a migration file in supabase/migrations/
supabase db push
```

Restart this container afterwards if the change affects what the UI displays.

## Architecture

- **Frontend:** Next.js 16 App Router, React 19, Tailwind v4, shadcn/ui (Radix-based variant)
- **Forms:** react-hook-form + zod
- **Data access:** server-side `@supabase/supabase-js` with **service role key** (never reaches the browser)
- **Container:** multi-stage Node 23 alpine, ~120 MB
- **Routing:** `lgu-nginx` proxies `copytraderx.local` → `copytraderx-license:3000`

## Tests

```bash
pnpm test
```

Covers `lib/schemas.ts`, `lib/license-key.ts`, `lib/expiry.ts`. UI components are not covered by Jest tests; verify visually.

## Adding a license (UI flow)

1. `http://copytraderx.local` → "+ New License"
2. Form pre-fills a fresh `IMPX-XXXX-XXXX-XXXX-XXXX` key
3. Type customer's MT5 account, pick tier (Monthly/Quarterly/Yearly/Lifetime), optional email + notes
4. Click Create
5. Copy the license key from the table — paste into your customer email manually

## Renewing

In the licenses list, open a row's action menu and click **Renew Monthly / Quarterly / Yearly**. The button extends `expires_at` and updates `tier` in one shot.

## Revoking

Action menu → **Revoke**. Confirms first. Sets `status='revoked'`. The EA refuses to trade on next validation (within 12h, or sooner if it restarts).

## Deleting

Action menu → **Delete**. Permanent. Requires typing `DELETE` to confirm. Use Revoke instead unless you really mean it.
