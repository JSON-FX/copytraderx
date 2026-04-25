# CopyTraderX License Admin UI — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. **For UI implementation tasks specifically, invoke the `frontend-design` skill** (see Tasks 12, 13, 14, 16) — these are visual surfaces where good design judgment matters.

**Goal:** Build a small, single-admin Next.js admin UI to CRUD CopyTraderX-Impulse EA licenses in cloud Supabase, served at `http://copytraderx.local` via the existing `lgu-nginx` reverse proxy in a Docker container.

**Architecture:** Next.js 16 App Router with server components for data fetching (service-role Supabase client) and client components for interaction. API routes mediate writes. Single `licenses` table in cloud Supabase (`mkfabzqlxzeidfblxzhq.supabase.co`) gets a new `tier` column via migration. UI is desktop-only, no auth, runs in a Docker container on the existing `development_lgu-network`.

**Tech Stack:** Next.js 16.1, React 19, TypeScript 5, Tailwind v4, shadcn/ui, react-hook-form, zod, date-fns, @supabase/supabase-js, Jest + ts-jest, Docker (multi-stage Node 23 alpine), pnpm.

**Spec:** [docs/superpowers/specs/2026-04-25-admin-ui-design.md](../specs/2026-04-25-admin-ui-design.md)

**Project root:** `~/Documents/development/copytraderx-license` (only `docs/` exists today; everything else is created by these tasks)

**Sibling repo (for migration only):** `~/Documents/development/EA/JSONFX-IMPULSE` (the EA repo holds Supabase migrations as the source of truth)

---

## Pre-flight

Before Task 1, the implementer must verify:

```bash
node --version    # Should be v23.x (matches metatrader-journal)
pnpm --version    # Should be 10.x
docker --version  # Required for container build/run
supabase --version  # 2.90+ — for migration push from the EA repo
```

The cloud Supabase project ref is `mkfabzqlxzeidfblxzhq`. The service-role key is available via:

```bash
supabase projects api-keys --project-ref mkfabzqlxzeidfblxzhq
```

(Look for the row labelled `service_role`.)

The existing nginx config lives at `/Users/jsonse/Documents/development/nginx/nginx.conf`. The current `copytraderx.local` server block proxies to Supabase Kong — Task 17 replaces it.

---

## File structure (final state after all tasks)

```
~/Documents/development/copytraderx-license/
├── README.md
├── package.json
├── pnpm-lock.yaml
├── tsconfig.json
├── next.config.ts
├── postcss.config.mjs
├── eslint.config.mjs
├── jest.config.mjs
├── components.json                       # shadcn config
├── .gitignore
├── .env.example
├── .dockerignore
├── Dockerfile
├── docker-compose.yml
├── public/
│   └── copytraderx-logo.png
├── app/
│   ├── layout.tsx
│   ├── page.tsx
│   ├── globals.css
│   ├── licenses/
│   │   ├── page.tsx                      # list (server component)
│   │   ├── new/page.tsx                  # create
│   │   └── [id]/page.tsx                 # edit
│   └── api/
│       └── licenses/
│           ├── route.ts                  # GET, POST
│           └── [id]/route.ts             # GET, PATCH, DELETE
├── components/
│   ├── ui/                               # shadcn primitives (auto-added per use)
│   ├── license-table.tsx
│   ├── license-form.tsx
│   ├── status-badge.tsx
│   ├── tier-badge.tsx
│   ├── site-nav.tsx
│   └── confirm-dialog.tsx
├── lib/
│   ├── supabase/
│   │   └── server.ts
│   ├── license-key.ts
│   ├── license-key.test.ts
│   ├── expiry.ts
│   ├── expiry.test.ts
│   ├── schemas.ts
│   ├── schemas.test.ts
│   └── types.ts
└── docs/
    └── superpowers/
        ├── specs/
        │   └── 2026-04-25-admin-ui-design.md  (already exists)
        └── plans/
            └── 2026-04-25-admin-ui-implementation.md  (this file)
```

---

## Task 1: Apply the Supabase migration (in EA repo)

**Files:**
- Create: `~/Documents/development/EA/JSONFX-IMPULSE/supabase/migrations/20260426000001_add_tier_column.sql`

The migration is additive and nullable — safe to apply against the live cloud DB while the EA is running.

- [ ] **Step 1: Verify the EA repo is on the licensing branch**

```bash
cd ~/Documents/development/EA/JSONFX-IMPULSE
git status
git branch --show-current
```

Expected: branch `feat/copytraderx-licensing` (or `main`), working tree clean.

- [ ] **Step 2: Write the migration**

Create `~/Documents/development/EA/JSONFX-IMPULSE/supabase/migrations/20260426000001_add_tier_column.sql` with EXACTLY this content:

```sql
-- Add tier column for admin-UI subscription tracking.
-- Spec: copytraderx-license/docs/superpowers/specs/2026-04-25-admin-ui-design.md §5

alter table public.licenses
  add column tier text;

alter table public.licenses
  add constraint licenses_tier_check
  check (tier in ('monthly', 'quarterly', 'yearly', 'lifetime') or tier is null);

comment on column public.licenses.tier is
  'Subscription tier set by admin UI when issuing the license. Null for legacy/manual rows.';
```

- [ ] **Step 3: Push to cloud Supabase**

```bash
cd ~/Documents/development/EA/JSONFX-IMPULSE
supabase db push
```

When prompted, type `Y` to confirm. Expected output ends with `Finished supabase db push.`

- [ ] **Step 4: Verify the column exists in cloud**

```bash
SERVICE_KEY=$(supabase projects api-keys --project-ref mkfabzqlxzeidfblxzhq 2>/dev/null | grep service_role | awk '{print $3}')
curl -s "https://mkfabzqlxzeidfblxzhq.supabase.co/rest/v1/licenses?select=id,license_key,tier&limit=5" \
  -H "apikey: $SERVICE_KEY" \
  -H "Authorization: Bearer $SERVICE_KEY"
```

Expected: JSON array. Each row has a `tier` field (will be `null` on existing rows).

- [ ] **Step 5: Commit in the EA repo**

```bash
cd ~/Documents/development/EA/JSONFX-IMPULSE
git add supabase/migrations/20260426000001_add_tier_column.sql
git commit -m "$(cat <<'EOF'
feat(licensing): add tier column to licenses table

Nullable text column with a check constraint allowing
'monthly'|'quarterly'|'yearly'|'lifetime'|null. Set by the admin UI
(separate repo at ~/Documents/development/copytraderx-license) when
new licenses are issued; legacy rows stay null.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

Then `cd ~/Documents/development/copytraderx-license` for all following tasks.

---

## Task 2: Scaffold Next.js project + initial commit

**Files:** All project root files except those handled in later tasks.

- [ ] **Step 1: Create the project root and initialize**

```bash
cd ~/Documents/development/copytraderx-license
ls
```

Expected: only `docs/` and (after Task 1) `.git/`. We're starting from a near-empty repo.

- [ ] **Step 2: Initialize Next.js manually**

We bypass `create-next-app` because it doesn't support ad-hoc dirs and we want exact control. Create `package.json`:

```json
{
  "name": "copytraderx-license",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "eslint",
    "test": "jest"
  },
  "dependencies": {
    "@supabase/supabase-js": "^2.45.0",
    "@hookform/resolvers": "^3.9.0",
    "class-variance-authority": "^0.7.1",
    "clsx": "^2.1.1",
    "date-fns": "^4.1.0",
    "lucide-react": "^0.562.0",
    "next": "16.1.1",
    "next-themes": "^0.4.6",
    "react": "19.2.3",
    "react-dom": "19.2.3",
    "react-hook-form": "^7.55.0",
    "server-only": "^0.0.1",
    "sonner": "^1.7.0",
    "tailwind-merge": "^2.6.0",
    "zod": "^3.23.8"
  },
  "devDependencies": {
    "@tailwindcss/postcss": "^4",
    "@types/jest": "^29.5.14",
    "@types/node": "^20",
    "@types/react": "^19",
    "@types/react-dom": "^19",
    "eslint": "^9",
    "eslint-config-next": "16.1.1",
    "jest": "^29.7.0",
    "jest-environment-jsdom": "^29.7.0",
    "tailwindcss": "^4",
    "ts-jest": "^29.4.9",
    "typescript": "^5"
  }
}
```

- [ ] **Step 3: Create supporting config files**

Create `tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": false,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "baseUrl": ".",
    "paths": {
      "@/*": ["./*"]
    }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

Create `next.config.ts`:

```ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
};

export default nextConfig;
```

Create `postcss.config.mjs`:

```js
const config = {
  plugins: {
    "@tailwindcss/postcss": {},
  },
};

export default config;
```

Create `eslint.config.mjs`:

```js
import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
];

export default eslintConfig;
```

Create `jest.config.mjs`:

```js
/** @type {import('jest').Config} */
const config = {
  preset: "ts-jest",
  testEnvironment: "node",
  testMatch: ["**/*.test.ts", "**/*.test.tsx"],
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/$1",
  },
};

export default config;
```

Create `.gitignore`:

```
node_modules/
.next/
out/
dist/
build/
*.tsbuildinfo
.DS_Store

# env
.env
.env.local
.env.*.local

# logs
npm-debug.log*
yarn-debug.log*
yarn-error.log*
pnpm-debug.log*

# testing
coverage/

# editor
.vscode/
.idea/
```

Create `.env.example`:

```
# Cloud Supabase project
SUPABASE_URL=https://mkfabzqlxzeidfblxzhq.supabase.co

# Service role key — get from: supabase projects api-keys --project-ref mkfabzqlxzeidfblxzhq
# NEVER commit. NEVER expose to the browser.
SUPABASE_SERVICE_ROLE_KEY=

NODE_ENV=development
```

- [ ] **Step 4: Install dependencies**

```bash
cd ~/Documents/development/copytraderx-license
pnpm install
```

Expected: `Done in <30s`. A `pnpm-lock.yaml` is created.

- [ ] **Step 5: Verify TypeScript compiles**

```bash
pnpm exec tsc --noEmit
```

Expected: no output, exit 0. The project is empty but the config must type-check.

- [ ] **Step 6: Commit**

```bash
git add package.json pnpm-lock.yaml tsconfig.json next.config.ts \
        postcss.config.mjs eslint.config.mjs jest.config.mjs \
        .gitignore .env.example
git commit -m "$(cat <<'EOF'
chore: scaffold Next.js 16 + TypeScript + Tailwind v4 + Jest

Mirrors the metatrader-journal project's stack: Node 23, pnpm,
Next.js 16.1, React 19, Tailwind v4 via @tailwindcss/postcss,
Jest with ts-jest. Adds Supabase, react-hook-form, zod, date-fns,
sonner, lucide-react for the admin UI requirements.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Add `globals.css`, `layout.tsx`, root `page.tsx`

**Files:**
- Create: `app/layout.tsx`
- Create: `app/page.tsx`
- Create: `app/globals.css`
- Create: `next-env.d.ts` (auto-generated; we just verify)

- [ ] **Step 1: Write `app/globals.css`**

```css
@import "tailwindcss";

@theme {
  --color-brand-navy: #1B2D6E;
  --color-brand-green: #2DAA47;

  --font-sans: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont,
    "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans", sans-serif;
  --font-mono: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas,
    "Liberation Mono", "Courier New", monospace;
}

:root {
  --background: oklch(1 0 0);
  --foreground: oklch(0.145 0 0);
  --primary: var(--color-brand-navy);
  --primary-foreground: oklch(1 0 0);
  --accent: var(--color-brand-green);
  --accent-foreground: oklch(1 0 0);
}

.dark {
  --background: oklch(0.145 0 0);
  --foreground: oklch(0.985 0 0);
}

body {
  background: var(--background);
  color: var(--foreground);
  font-family: var(--font-sans);
}
```

- [ ] **Step 2: Write `app/layout.tsx`**

```tsx
import type { Metadata } from "next";
import { Toaster } from "sonner";
import "./globals.css";

export const metadata: Metadata = {
  title: "CopyTraderX Licenses",
  description: "Admin UI for managing CopyTraderX-Impulse EA licenses.",
  icons: { icon: "/copytraderx-logo.png" },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        {children}
        <Toaster position="top-right" richColors />
      </body>
    </html>
  );
}
```

- [ ] **Step 3: Write `app/page.tsx`**

```tsx
import { redirect } from "next/navigation";

export default function HomePage() {
  redirect("/licenses");
}
```

- [ ] **Step 4: Copy the logo asset**

```bash
mkdir -p public
cp "/Users/jsonse/Pictures/copytraderx/profile_3.png" public/copytraderx-logo.png
ls -la public/copytraderx-logo.png
```

Expected: file exists, ~478 KB.

- [ ] **Step 5: Run `pnpm build` to confirm everything wires up**

```bash
pnpm build
```

Expected: `Compiled successfully`. There may be lint warnings about unused exports — that's fine. There must be NO errors.

- [ ] **Step 6: Commit**

```bash
git add app/layout.tsx app/page.tsx app/globals.css public/copytraderx-logo.png next-env.d.ts
git commit -m "$(cat <<'EOF'
feat(ui): add root layout, home redirect, brand tokens, logo

Tailwind v4 theme exposes --color-brand-navy (#1B2D6E) and
--color-brand-green (#2DAA47) inferred from the CopyTraderX logo.
Root layout wires the Sonner toaster; home page redirects to
/licenses (the only entry point).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Set up shadcn/ui

**Files:**
- Create: `components.json`
- Create: `components/ui/*` (auto-added per shadcn)
- Modify: `app/globals.css`

- [ ] **Step 1: Run `shadcn init` non-interactively**

```bash
cd ~/Documents/development/copytraderx-license
pnpm dlx shadcn@latest init --yes --base-color slate
```

Expected: creates `components.json`, updates `app/globals.css` with shadcn's CSS variables, may add helper packages. Accept all defaults.

- [ ] **Step 2: Verify components.json content**

```bash
cat components.json
```

Expected: JSON with `style`, `tailwind`, `aliases.components = "@/components"`, `aliases.ui = "@/components/ui"`, `aliases.lib = "@/lib"`. If `aliases.lib` is missing, edit `components.json` to add it.

- [ ] **Step 3: Add the primitives we'll use across the app**

```bash
pnpm dlx shadcn@latest add button input label table badge dropdown-menu \
  dialog form select textarea card separator alert
```

Each primitive lands at `components/ui/<name>.tsx`. Verify:

```bash
ls components/ui/
```

Expected: `alert.tsx`, `badge.tsx`, `button.tsx`, `card.tsx`, `dialog.tsx`, `dropdown-menu.tsx`, `form.tsx`, `input.tsx`, `label.tsx`, `select.tsx`, `separator.tsx`, `table.tsx`, `textarea.tsx`.

- [ ] **Step 4: Re-merge brand tokens into `globals.css`**

`shadcn init` likely overwrote our `--color-brand-*` tokens. Open `app/globals.css` and confirm both blocks are present:
1. `@theme` block with `--color-brand-navy` and `--color-brand-green`.
2. shadcn's `:root` and `.dark` blocks with `--background`, `--foreground`, `--primary`, etc.

If the brand tokens are missing, paste them back into the `@theme` block:

```css
@theme {
  --color-brand-navy: #1B2D6E;
  --color-brand-green: #2DAA47;
}
```

Also override shadcn's `--primary` and `--accent` to use the brand tokens. In the `:root` block:

```css
--primary: var(--color-brand-navy);
--primary-foreground: oklch(1 0 0);
--accent: var(--color-brand-green);
--accent-foreground: oklch(1 0 0);
```

- [ ] **Step 5: Compile-check**

```bash
pnpm build
```

Expected: builds clean, no errors.

- [ ] **Step 6: Commit**

```bash
git add components.json components/ui/ app/globals.css
git commit -m "$(cat <<'EOF'
chore(ui): add shadcn/ui primitives + brand tokens

Pulls in the 13 primitives the admin UI needs (button, input,
table, dialog, form, select, dropdown-menu, badge, card, label,
separator, textarea, alert). Brand tokens (navy #1B2D6E,
green #2DAA47) feed shadcn's --primary and --accent so buttons
and accents inherit the CopyTraderX palette.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Library — types and zod schemas (with tests)

**Files:**
- Create: `lib/types.ts`
- Create: `lib/schemas.ts`
- Create: `lib/schemas.test.ts`

- [ ] **Step 1: Write `lib/types.ts`**

```ts
export type LicenseStatus = "active" | "revoked" | "expired";
export type LicenseTier = "monthly" | "quarterly" | "yearly" | "lifetime";

export interface License {
  id: number;
  license_key: string;
  mt5_account: number;
  status: LicenseStatus;
  tier: LicenseTier | null;
  expires_at: string | null;            // ISO 8601 or null
  customer_email: string | null;
  purchase_date: string | null;
  last_validated_at: string | null;
  broker_name: string | null;
  notes: string | null;
  created_at: string;
}

/** Derived "display" status: revoked > expired (date-based) > active. */
export type DisplayStatus = "active" | "revoked" | "expired";
```

- [ ] **Step 2: Write the failing test for schemas**

Create `lib/schemas.test.ts`:

```ts
import {
  createLicenseSchema,
  updateLicenseSchema,
  renewActionSchema,
} from "./schemas";

describe("createLicenseSchema", () => {
  it("accepts a valid monthly license", () => {
    const result = createLicenseSchema.safeParse({
      license_key: "IMPX-AAAA-BBBB-CCCC-DDDD",
      mt5_account: 12345678,
      tier: "monthly",
      customer_email: "test@example.com",
      notes: "first customer",
    });
    expect(result.success).toBe(true);
  });

  it("rejects malformed license_key (wrong prefix)", () => {
    const result = createLicenseSchema.safeParse({
      license_key: "WRONG-AAAA-BBBB-CCCC-DDDD",
      mt5_account: 12345678,
      tier: "monthly",
    });
    expect(result.success).toBe(false);
  });

  it("rejects mt5_account = 0", () => {
    const result = createLicenseSchema.safeParse({
      license_key: "IMPX-AAAA-BBBB-CCCC-DDDD",
      mt5_account: 0,
      tier: "monthly",
    });
    expect(result.success).toBe(false);
  });

  it("rejects negative mt5_account", () => {
    const result = createLicenseSchema.safeParse({
      license_key: "IMPX-AAAA-BBBB-CCCC-DDDD",
      mt5_account: -5,
      tier: "monthly",
    });
    expect(result.success).toBe(false);
  });

  it("rejects unknown tier", () => {
    const result = createLicenseSchema.safeParse({
      license_key: "IMPX-AAAA-BBBB-CCCC-DDDD",
      mt5_account: 1,
      tier: "weekly",
    });
    expect(result.success).toBe(false);
  });

  it("accepts empty/missing customer_email", () => {
    const a = createLicenseSchema.safeParse({
      license_key: "IMPX-AAAA-BBBB-CCCC-DDDD",
      mt5_account: 1,
      tier: "monthly",
    });
    expect(a.success).toBe(true);
    const b = createLicenseSchema.safeParse({
      license_key: "IMPX-AAAA-BBBB-CCCC-DDDD",
      mt5_account: 1,
      tier: "monthly",
      customer_email: "",
    });
    expect(b.success).toBe(true);
  });

  it("rejects invalid customer_email format", () => {
    const result = createLicenseSchema.safeParse({
      license_key: "IMPX-AAAA-BBBB-CCCC-DDDD",
      mt5_account: 1,
      tier: "monthly",
      customer_email: "not-an-email",
    });
    expect(result.success).toBe(false);
  });
});

describe("updateLicenseSchema", () => {
  it("accepts a partial update", () => {
    const result = updateLicenseSchema.safeParse({
      status: "revoked",
    });
    expect(result.success).toBe(true);
  });

  it("rejects empty body", () => {
    const result = updateLicenseSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it("rejects unknown extra fields", () => {
    const result = updateLicenseSchema.safeParse({
      status: "active",
      hacker_field: "evil",
    });
    expect(result.success).toBe(false);
  });
});

describe("renewActionSchema", () => {
  it("accepts a valid renew action", () => {
    const result = renewActionSchema.safeParse({
      action: "renew",
      tier: "yearly",
    });
    expect(result.success).toBe(true);
  });

  it("rejects renew with invalid tier", () => {
    const result = renewActionSchema.safeParse({
      action: "renew",
      tier: "lifetime",
    });
    expect(result.success).toBe(false);
  });
});
```

- [ ] **Step 3: Run the tests — confirm failure**

```bash
pnpm test lib/schemas.test.ts
```

Expected: FAIL with module-not-found or similar.

- [ ] **Step 4: Write `lib/schemas.ts`**

```ts
import { z } from "zod";

export const LICENSE_KEY_PATTERN = /^IMPX-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/;

const tierEnum = z.enum(["monthly", "quarterly", "yearly", "lifetime"]);
const statusEnum = z.enum(["active", "revoked", "expired"]);
const renewableTierEnum = z.enum(["monthly", "quarterly", "yearly"]);

const optionalEmail = z
  .string()
  .trim()
  .transform((v) => (v === "" ? null : v))
  .nullable()
  .optional()
  .refine(
    (v) => v == null || z.string().email().safeParse(v).success,
    "Invalid email",
  );

const optionalNonEmpty = z
  .string()
  .trim()
  .transform((v) => (v === "" ? null : v))
  .nullable()
  .optional();

export const createLicenseSchema = z
  .object({
    license_key: z.string().regex(LICENSE_KEY_PATTERN, {
      message: "Must match IMPX-XXXX-XXXX-XXXX-XXXX",
    }),
    mt5_account: z
      .number()
      .int()
      .positive("Must be a positive integer"),
    tier: tierEnum,
    customer_email: optionalEmail,
    notes: optionalNonEmpty,
  })
  .strict();

export const updateLicenseSchema = z
  .object({
    license_key: z.string().regex(LICENSE_KEY_PATTERN).optional(),
    mt5_account: z.number().int().positive().optional(),
    status: statusEnum.optional(),
    tier: tierEnum.nullable().optional(),
    expires_at: z.string().datetime().nullable().optional(),
    customer_email: optionalEmail,
    notes: optionalNonEmpty,
  })
  .strict()
  .refine(
    (obj) => Object.keys(obj).length > 0,
    "Update body cannot be empty",
  );

export const renewActionSchema = z
  .object({
    action: z.literal("renew"),
    tier: renewableTierEnum,
  })
  .strict();

export type CreateLicenseInput = z.infer<typeof createLicenseSchema>;
export type UpdateLicenseInput = z.infer<typeof updateLicenseSchema>;
export type RenewActionInput = z.infer<typeof renewActionSchema>;
```

- [ ] **Step 5: Run the tests — confirm pass**

```bash
pnpm test lib/schemas.test.ts
```

Expected: 11 passed, 0 failed.

- [ ] **Step 6: Commit**

```bash
git add lib/types.ts lib/schemas.ts lib/schemas.test.ts
git commit -m "$(cat <<'EOF'
feat(lib): add shared types and zod schemas with tests

License, LicenseStatus, LicenseTier types match the cloud licenses
table. createLicenseSchema validates new-row payloads (key format,
positive mt5_account, tier enum, optional email format).
updateLicenseSchema is a strict partial that rejects empty bodies and
unknown fields. renewActionSchema is a tagged action for the quick
"Renew Monthly/Quarterly/Yearly" buttons.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Library — license-key generator (with tests)

**Files:**
- Create: `lib/license-key.ts`
- Create: `lib/license-key.test.ts`

- [ ] **Step 1: Write the failing test**

Create `lib/license-key.test.ts`:

```ts
import { generateLicenseKey, LICENSE_KEY_ALPHABET } from "./license-key";
import { LICENSE_KEY_PATTERN } from "./schemas";

describe("generateLicenseKey", () => {
  it("returns a key matching the IMPX format", () => {
    const key = generateLicenseKey();
    expect(key).toMatch(LICENSE_KEY_PATTERN);
  });

  it("returns a 24-character key", () => {
    expect(generateLicenseKey()).toHaveLength(24);
  });

  it("uses only safe alphabet characters in the random portion", () => {
    const key = generateLicenseKey();
    const groups = key.slice(5).split("-").join("");
    for (const ch of groups) {
      expect(LICENSE_KEY_ALPHABET).toContain(ch);
    }
  });

  it("excludes ambiguous characters 0/O/1/I/L", () => {
    expect(LICENSE_KEY_ALPHABET).not.toMatch(/[01OIL]/);
  });

  it("returns different keys on consecutive calls (probabilistic)", () => {
    const a = generateLicenseKey();
    const b = generateLicenseKey();
    expect(a).not.toBe(b);
  });
});
```

- [ ] **Step 2: Run the failing test**

```bash
pnpm test lib/license-key.test.ts
```

Expected: FAIL with module-not-found.

- [ ] **Step 3: Write `lib/license-key.ts`**

```ts
/**
 * Safe alphabet for license keys: 31 uppercase alphanumerics excluding
 * ambiguous 0/O/1/I/L. 16 chars over this alphabet ≈ 79 bits of entropy.
 */
export const LICENSE_KEY_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

/** Generates a key shaped IMPX-XXXX-XXXX-XXXX-XXXX. */
export function generateLicenseKey(): string {
  const groups: string[] = [];
  for (let g = 0; g < 4; g++) {
    let group = "";
    for (let i = 0; i < 4; i++) {
      group += pickRandomChar();
    }
    groups.push(group);
  }
  return `IMPX-${groups.join("-")}`;
}

function pickRandomChar(): string {
  // Use crypto where available, fall back to Math.random in Node environments
  // that haven't polyfilled crypto.getRandomValues. Node 23 has it natively.
  const idx = secureRandomIndex(LICENSE_KEY_ALPHABET.length);
  return LICENSE_KEY_ALPHABET[idx];
}

function secureRandomIndex(max: number): number {
  // Rejection sampling to avoid modulo bias.
  const range = 256 - (256 % max);
  const buf = new Uint8Array(1);
  // eslint-disable-next-line no-constant-condition
  while (true) {
    crypto.getRandomValues(buf);
    if (buf[0] < range) return buf[0] % max;
  }
}
```

- [ ] **Step 4: Run the tests — confirm pass**

```bash
pnpm test lib/license-key.test.ts
```

Expected: 5 passed.

- [ ] **Step 5: Commit**

```bash
git add lib/license-key.ts lib/license-key.test.ts
git commit -m "$(cat <<'EOF'
feat(lib): generate IMPX-XXXX-XXXX-XXXX-XXXX license keys

Uses crypto.getRandomValues with rejection sampling to avoid modulo
bias. The 31-char alphabet excludes ambiguous 0/O/1/I/L; 16 random
chars give ~79 bits of entropy.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Library — expiry / display helpers (with tests)

**Files:**
- Create: `lib/expiry.ts`
- Create: `lib/expiry.test.ts`

- [ ] **Step 1: Write the failing test**

Create `lib/expiry.test.ts`:

```ts
import {
  calculateExpiresAt,
  isExpired,
  computeDisplayStatus,
  formatExpiry,
} from "./expiry";

describe("calculateExpiresAt", () => {
  const from = new Date("2026-04-25T10:00:00Z");

  it("monthly: adds 1 calendar month", () => {
    const result = calculateExpiresAt("monthly", from);
    expect(result?.toISOString()).toBe("2026-05-25T10:00:00.000Z");
  });

  it("quarterly: adds 3 calendar months", () => {
    const result = calculateExpiresAt("quarterly", from);
    expect(result?.toISOString()).toBe("2026-07-25T10:00:00.000Z");
  });

  it("yearly: adds 1 calendar year", () => {
    const result = calculateExpiresAt("yearly", from);
    expect(result?.toISOString()).toBe("2027-04-25T10:00:00.000Z");
  });

  it("lifetime: returns null", () => {
    expect(calculateExpiresAt("lifetime", from)).toBeNull();
  });

  it("monthly handles end-of-month rollover (Jan 31 → Feb 28)", () => {
    const jan31 = new Date("2026-01-31T00:00:00Z");
    // date-fns addMonths clamps to the last day of the shorter month.
    const result = calculateExpiresAt("monthly", jan31);
    expect(result?.toISOString().slice(0, 10)).toBe("2026-02-28");
  });
});

describe("isExpired", () => {
  it("returns false for null (lifetime)", () => {
    expect(isExpired(null)).toBe(false);
  });

  it("returns false for future date", () => {
    const future = new Date(Date.now() + 86400000).toISOString();
    expect(isExpired(future)).toBe(false);
  });

  it("returns true for past date", () => {
    expect(isExpired("2020-01-01T00:00:00Z")).toBe(true);
  });
});

describe("computeDisplayStatus", () => {
  it("revoked beats everything", () => {
    expect(computeDisplayStatus("revoked", "2099-01-01")).toBe("revoked");
    expect(computeDisplayStatus("revoked", "2020-01-01")).toBe("revoked");
    expect(computeDisplayStatus("revoked", null)).toBe("revoked");
  });

  it("active + past expires_at → expired", () => {
    expect(computeDisplayStatus("active", "2020-01-01")).toBe("expired");
  });

  it("active + future expires_at → active", () => {
    expect(computeDisplayStatus("active", "2099-01-01")).toBe("active");
  });

  it("active + null expires_at → active (lifetime)", () => {
    expect(computeDisplayStatus("active", null)).toBe("active");
  });

  it("explicit expired status → expired", () => {
    expect(computeDisplayStatus("expired", "2099-01-01")).toBe("expired");
  });
});

describe("formatExpiry", () => {
  it("null → 'Lifetime'", () => {
    expect(formatExpiry(null)).toBe("Lifetime");
  });

  it("ISO string → YYYY-MM-DD", () => {
    expect(formatExpiry("2027-04-25T00:00:00Z")).toBe("2027-04-25");
  });
});
```

- [ ] **Step 2: Run the failing test**

```bash
pnpm test lib/expiry.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Write `lib/expiry.ts`**

```ts
import { addMonths, addYears, format } from "date-fns";
import type { LicenseTier, LicenseStatus, DisplayStatus } from "./types";

export function calculateExpiresAt(
  tier: LicenseTier,
  from: Date,
): Date | null {
  switch (tier) {
    case "monthly":
      return addMonths(from, 1);
    case "quarterly":
      return addMonths(from, 3);
    case "yearly":
      return addYears(from, 1);
    case "lifetime":
      return null;
  }
}

export function isExpired(expiresAt: string | null): boolean {
  if (expiresAt === null) return false;
  return new Date(expiresAt).getTime() <= Date.now();
}

export function computeDisplayStatus(
  status: LicenseStatus,
  expiresAt: string | null,
): DisplayStatus {
  if (status === "revoked") return "revoked";
  if (status === "expired") return "expired";
  if (isExpired(expiresAt)) return "expired";
  return "active";
}

export function formatExpiry(expiresAt: string | null): string {
  if (expiresAt === null) return "Lifetime";
  return format(new Date(expiresAt), "yyyy-MM-dd");
}
```

- [ ] **Step 4: Run the tests — confirm pass**

```bash
pnpm test lib/expiry.test.ts
```

Expected: 13 passed.

- [ ] **Step 5: Commit**

```bash
git add lib/expiry.ts lib/expiry.test.ts
git commit -m "$(cat <<'EOF'
feat(lib): add expiry calculation and display helpers

calculateExpiresAt(tier, from) maps tier→ISO via date-fns addMonths/
addYears (calendar-based, end-of-month aware via date-fns clamp).
isExpired/computeDisplayStatus implement the spec rule
"revoked > expired (date-based) > active". formatExpiry renders
null as "Lifetime" and ISO as YYYY-MM-DD.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: Library — Supabase server client

**Files:**
- Create: `lib/supabase/server.ts`

- [ ] **Step 1: Write `lib/supabase/server.ts`**

```ts
import "server-only";
import { createClient, SupabaseClient } from "@supabase/supabase-js";

let cached: SupabaseClient | null = null;

export function getSupabaseAdmin(): SupabaseClient {
  if (cached) return cached;

  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    throw new Error(
      "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in the environment",
    );
  }

  cached = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cached;
}
```

- [ ] **Step 2: Verify type-check**

```bash
pnpm exec tsc --noEmit
```

Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add lib/supabase/server.ts
git commit -m "$(cat <<'EOF'
feat(lib): add server-only Supabase admin client

createClient with service-role key, sessions disabled. Marked with
'server-only' so a stray browser-side import fails the build instead
of leaking the secret. Cached at module scope for cold-start reuse.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: API route — `/api/licenses` (GET, POST)

**Files:**
- Create: `app/api/licenses/route.ts`

- [ ] **Step 1: Write `app/api/licenses/route.ts`**

```ts
import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { createLicenseSchema } from "@/lib/schemas";
import { calculateExpiresAt } from "@/lib/expiry";

export async function GET() {
  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .from("licenses")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json(
      { error: "lookup_failed", details: error.message },
      { status: 500 },
    );
  }
  return NextResponse.json({ licenses: data });
}

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const parsed = createLicenseSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_request", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const input = parsed.data;
  const now = new Date();
  const expiresAt = calculateExpiresAt(input.tier, now);

  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .from("licenses")
    .insert({
      license_key: input.license_key,
      mt5_account: input.mt5_account,
      tier: input.tier,
      expires_at: expiresAt ? expiresAt.toISOString() : null,
      customer_email: input.customer_email ?? null,
      notes: input.notes ?? null,
      status: "active",
    })
    .select()
    .single();

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json({ error: "key_exists" }, { status: 409 });
    }
    return NextResponse.json(
      { error: "insert_failed", details: error.message },
      { status: 500 },
    );
  }

  return NextResponse.json({ license: data }, { status: 201 });
}
```

- [ ] **Step 2: Run type-check + build**

```bash
pnpm build
```

Expected: builds. Note that Next.js may warn about no actual data fetch testing; ignore.

- [ ] **Step 3: Commit**

```bash
git add app/api/licenses/route.ts
git commit -m "$(cat <<'EOF'
feat(api): add GET (list) and POST (create) for /api/licenses

GET returns rows ordered by created_at desc. POST validates with zod,
computes expires_at from tier, inserts with status='active'. Maps
Postgres unique-constraint error 23505 to HTTP 409 'key_exists' so the
form can suggest regenerating.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 10: API route — `/api/licenses/[id]` (GET, PATCH, DELETE)

**Files:**
- Create: `app/api/licenses/[id]/route.ts`

- [ ] **Step 1: Write the file**

```ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { updateLicenseSchema, renewActionSchema } from "@/lib/schemas";
import { calculateExpiresAt } from "@/lib/expiry";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(_req: Request, ctx: RouteContext) {
  const { id } = await ctx.params;
  const numericId = Number(id);
  if (!Number.isInteger(numericId) || numericId <= 0) {
    return NextResponse.json({ error: "invalid_id" }, { status: 400 });
  }

  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .from("licenses")
    .select("*")
    .eq("id", numericId)
    .maybeSingle();

  if (error) {
    return NextResponse.json(
      { error: "lookup_failed", details: error.message },
      { status: 500 },
    );
  }
  if (!data) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  return NextResponse.json({ license: data });
}

const patchBodySchema = z.union([renewActionSchema, updateLicenseSchema]);

export async function PATCH(req: Request, ctx: RouteContext) {
  const { id } = await ctx.params;
  const numericId = Number(id);
  if (!Number.isInteger(numericId) || numericId <= 0) {
    return NextResponse.json({ error: "invalid_id" }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const parsed = patchBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_request", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  // Expand renew action into a real update payload
  let updatePayload: Record<string, unknown>;
  if ("action" in parsed.data && parsed.data.action === "renew") {
    const expiresAt = calculateExpiresAt(parsed.data.tier, new Date());
    updatePayload = {
      tier: parsed.data.tier,
      expires_at: expiresAt ? expiresAt.toISOString() : null,
    };
  } else {
    updatePayload = parsed.data;
  }

  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .from("licenses")
    .update(updatePayload)
    .eq("id", numericId)
    .select()
    .single();

  if (error) {
    if (error.code === "PGRST116") {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    return NextResponse.json(
      { error: "update_failed", details: error.message },
      { status: 500 },
    );
  }
  return NextResponse.json({ license: data });
}

export async function DELETE(_req: Request, ctx: RouteContext) {
  const { id } = await ctx.params;
  const numericId = Number(id);
  if (!Number.isInteger(numericId) || numericId <= 0) {
    return NextResponse.json({ error: "invalid_id" }, { status: 400 });
  }

  const sb = getSupabaseAdmin();
  const { error } = await sb.from("licenses").delete().eq("id", numericId);
  if (error) {
    return NextResponse.json(
      { error: "delete_failed", details: error.message },
      { status: 500 },
    );
  }
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 2: Build**

```bash
pnpm build
```

Expected: succeeds.

- [ ] **Step 3: Commit**

```bash
git add app/api/licenses/[id]/route.ts
git commit -m "$(cat <<'EOF'
feat(api): add GET/PATCH/DELETE for /api/licenses/[id]

GET returns 404 if missing. PATCH accepts either a partial update
(updateLicenseSchema) or a tagged {action:"renew",tier} payload that
the server expands into {tier, expires_at}. DELETE is permanent.
Maps PostgREST PGRST116 (no rows) to HTTP 404.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 11: Tooling check — manual end-to-end via dev server

**Files:** none modified — verification only.

- [ ] **Step 1: Create `.env.local`**

```bash
SERVICE_KEY=$(supabase projects api-keys --project-ref mkfabzqlxzeidfblxzhq 2>/dev/null | grep service_role | awk '{print $3}')
cat > .env.local <<EOF
SUPABASE_URL=https://mkfabzqlxzeidfblxzhq.supabase.co
SUPABASE_SERVICE_ROLE_KEY=$SERVICE_KEY
NODE_ENV=development
EOF
```

Verify:

```bash
grep -c SUPABASE_SERVICE_ROLE_KEY .env.local
```

Expected: `1`. The line should NOT be empty after the `=`.

- [ ] **Step 2: Run dev server in background**

```bash
pnpm dev > /tmp/copytraderx-dev.log 2>&1 &
sleep 6
```

- [ ] **Step 3: Smoke-test the API**

```bash
echo "--- list ---"
curl -s http://localhost:3000/api/licenses | head -c 500
echo
echo "--- create ---"
curl -s -X POST http://localhost:3000/api/licenses \
  -H "content-type: application/json" \
  -d '{"license_key":"IMPX-DEV1-AAAA-BBBB-CCCC","mt5_account":99000001,"tier":"monthly","customer_email":"smoke@test.com","notes":"smoke test"}'
echo
echo "--- list shows new row ---"
curl -s http://localhost:3000/api/licenses | grep -o "IMPX-DEV1-AAAA-BBBB-CCCC"
echo
echo "--- delete it (replace ID below with the id from create response) ---"
ID=$(curl -s http://localhost:3000/api/licenses | python3 -c "import sys,json; rows=json.load(sys.stdin)['licenses']; print(next(r['id'] for r in rows if r['license_key']=='IMPX-DEV1-AAAA-BBBB-CCCC'))")
echo "ID = $ID"
curl -s -X DELETE "http://localhost:3000/api/licenses/$ID"
echo
```

Expected:
- `list` returns `{"licenses": [...]}` with at least one row (the test license inserted earlier in the EA work).
- `create` returns `{"license": {...}}` with `tier:"monthly"` and a non-null `expires_at`.
- `IMPX-DEV1-...` appears in the second list call.
- `delete` returns `{"ok":true}`.

- [ ] **Step 4: Stop the dev server**

```bash
kill %1 2>/dev/null || pkill -f "next dev"
```

- [ ] **Step 5: This task makes NO commit** (env file is gitignored, no source changed).

---

## Task 12: UI — `<SiteNav>` and `<StatusBadge>` and `<TierBadge>`

> **For agentic workers:** This task contains visual UI work. **Invoke `frontend-design` skill** before writing the components.

**Files:**
- Create: `components/site-nav.tsx`
- Create: `components/status-badge.tsx`
- Create: `components/tier-badge.tsx`

- [ ] **Step 1: Write `components/site-nav.tsx`**

```tsx
import Image from "next/image";
import Link from "next/link";

export function SiteNav() {
  return (
    <header className="border-b bg-background">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-6">
        <Link href="/licenses" className="flex items-center gap-3">
          <Image
            src="/copytraderx-logo.png"
            alt="CopyTraderX"
            width={32}
            height={32}
            priority
          />
          <span className="text-base font-semibold tracking-tight text-foreground">
            CopyTraderX <span className="text-muted-foreground">Licenses</span>
          </span>
        </Link>
      </div>
    </header>
  );
}
```

- [ ] **Step 2: Write `components/status-badge.tsx`**

```tsx
import { Badge } from "@/components/ui/badge";
import type { DisplayStatus } from "@/lib/types";

export function StatusBadge({ status }: { status: DisplayStatus }) {
  const styles: Record<DisplayStatus, string> = {
    active:  "bg-green-100 text-green-800 border-green-200 dark:bg-green-950 dark:text-green-200 dark:border-green-900",
    revoked: "bg-gray-100 text-gray-800 border-gray-200 dark:bg-gray-900 dark:text-gray-200 dark:border-gray-700",
    expired: "bg-red-100 text-red-800 border-red-200 dark:bg-red-950 dark:text-red-200 dark:border-red-900",
  };
  const labels: Record<DisplayStatus, string> = {
    active: "Active",
    revoked: "Revoked",
    expired: "Expired",
  };

  return (
    <Badge variant="outline" className={styles[status]}>
      {labels[status]}
    </Badge>
  );
}
```

- [ ] **Step 3: Write `components/tier-badge.tsx`**

```tsx
import { Badge } from "@/components/ui/badge";
import type { LicenseTier } from "@/lib/types";

export function TierBadge({ tier }: { tier: LicenseTier | null }) {
  if (tier === null) {
    return <Badge variant="outline" className="text-muted-foreground">—</Badge>;
  }
  const labels: Record<LicenseTier, string> = {
    monthly: "Monthly",
    quarterly: "Quarterly",
    yearly: "Yearly",
    lifetime: "Lifetime",
  };
  return <Badge variant="secondary">{labels[tier]}</Badge>;
}
```

- [ ] **Step 4: Build to confirm**

```bash
pnpm build
```

Expected: builds clean.

- [ ] **Step 5: Commit**

```bash
git add components/site-nav.tsx components/status-badge.tsx components/tier-badge.tsx
git commit -m "$(cat <<'EOF'
feat(ui): add SiteNav, StatusBadge, TierBadge components

SiteNav renders the logo + "CopyTraderX Licenses" wordmark, links
back to /licenses. Status/Tier badges use semantic colour
combinations (green/red/gray for status, neutral secondary for
tier). Null tier (legacy rows) renders as a dim em-dash.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 13: UI — `<ConfirmDialog>` reusable confirmation modal

> **For agentic workers:** Visual component — **invoke `frontend-design` skill** for polish.

**Files:**
- Create: `components/confirm-dialog.tsx`

- [ ] **Step 1: Write the file**

```tsx
"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  /** Set to e.g. "DELETE" to require typing confirmation. Omit for single-click confirm. */
  typeToConfirm?: string;
  confirmLabel?: string;
  destructive?: boolean;
  onConfirm: () => void | Promise<void>;
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  typeToConfirm,
  confirmLabel = "Confirm",
  destructive = false,
  onConfirm,
}: Props) {
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const ready = typeToConfirm == null || typed === typeToConfirm;

  async function handleConfirm() {
    if (!ready) return;
    setBusy(true);
    try {
      await onConfirm();
      setTyped("");
      onOpenChange(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        {typeToConfirm && (
          <div className="space-y-2">
            <Label htmlFor="confirm-input">
              Type <span className="font-mono">{typeToConfirm}</span> to confirm
            </Label>
            <Input
              id="confirm-input"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              autoFocus
            />
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button
            variant={destructive ? "destructive" : "default"}
            disabled={!ready || busy}
            onClick={handleConfirm}
          >
            {busy ? "Working…" : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Build**

```bash
pnpm build
```

Expected: builds clean.

- [ ] **Step 3: Commit**

```bash
git add components/confirm-dialog.tsx
git commit -m "$(cat <<'EOF'
feat(ui): add ConfirmDialog reusable confirmation modal

Single component handles both single-click confirm (Revoke) and
type-to-confirm (Delete). Async-safe via internal busy state so
the button reflects in-flight requests. Destructive variant maps
to the red shadcn button variant.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 14: UI — `<LicenseTable>` (list + filter + actions)

> **For agentic workers:** Significant visual UI work — **invoke `frontend-design` skill** to refine layout, density, hover states.

**Files:**
- Create: `components/license-table.tsx`

- [ ] **Step 1: Write the table component**

```tsx
"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MoreHorizontal, Plus, Copy } from "lucide-react";
import { StatusBadge } from "./status-badge";
import { TierBadge } from "./tier-badge";
import { ConfirmDialog } from "./confirm-dialog";
import { computeDisplayStatus, formatExpiry, isExpired } from "@/lib/expiry";
import type { License } from "@/lib/types";

type Filter = "all" | "active" | "revoked" | "expired";

export function LicenseTable({ licenses }: { licenses: License[] }) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");

  const [revokeTarget, setRevokeTarget] = useState<License | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<License | null>(null);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return licenses.filter((l) => {
      const display = computeDisplayStatus(l.status, l.expires_at);
      if (filter !== "all" && display !== filter) return false;
      if (q.length === 0) return true;
      return (
        l.license_key.toLowerCase().includes(q) ||
        (l.customer_email ?? "").toLowerCase().includes(q)
      );
    });
  }, [licenses, search, filter]);

  async function patchLicense(id: number, body: object, msg: string) {
    const res = await fetch(`/api/licenses/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      toast.error("Failed: " + (await res.text()));
      return;
    }
    toast.success(msg);
    router.refresh();
  }

  async function deleteLicense(id: number) {
    const res = await fetch(`/api/licenses/${id}`, { method: "DELETE" });
    if (!res.ok) {
      toast.error("Delete failed: " + (await res.text()));
      return;
    }
    toast.success("License deleted");
    router.refresh();
  }

  function copyKey(key: string) {
    navigator.clipboard.writeText(key);
    toast.success("Key copied");
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Input
          placeholder="Search by key or email"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-xs"
        />
        <Select value={filter} onValueChange={(v) => setFilter(v as Filter)}>
          <SelectTrigger className="w-[160px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="revoked">Revoked</SelectItem>
            <SelectItem value="expired">Expired</SelectItem>
          </SelectContent>
        </Select>
        <div className="flex-1" />
        <Button asChild>
          <Link href="/licenses/new">
            <Plus className="mr-2 h-4 w-4" />
            New License
          </Link>
        </Button>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Status</TableHead>
              <TableHead>License Key</TableHead>
              <TableHead className="text-right">MT5 Account</TableHead>
              <TableHead>Tier</TableHead>
              <TableHead>Customer Email</TableHead>
              <TableHead>Expires</TableHead>
              <TableHead>Last Validated</TableHead>
              <TableHead className="w-[60px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="py-12 text-center text-muted-foreground">
                  {licenses.length === 0
                    ? "No licenses yet. Create your first one."
                    : "No licenses match your filters."}
                </TableCell>
              </TableRow>
            ) : (
              rows.map((l) => {
                const display = computeDisplayStatus(l.status, l.expires_at);
                const isPastExpiry = isExpired(l.expires_at);
                const isRevoked = l.status === "revoked";
                return (
                  <TableRow key={l.id}>
                    <TableCell>
                      <StatusBadge status={display} />
                    </TableCell>
                    <TableCell>
                      <button
                        type="button"
                        onClick={() => copyKey(l.license_key)}
                        className="inline-flex items-center gap-2 font-mono text-xs hover:underline"
                        title="Click to copy"
                      >
                        {l.license_key}
                        <Copy className="h-3 w-3 opacity-50" />
                      </button>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {l.mt5_account}
                    </TableCell>
                    <TableCell>
                      <TierBadge tier={l.tier} />
                    </TableCell>
                    <TableCell className="text-sm">
                      {l.customer_email ?? "—"}
                    </TableCell>
                    <TableCell className={isPastExpiry ? "text-red-600" : ""}>
                      {formatExpiry(l.expires_at)}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {l.last_validated_at
                        ? formatDistanceToNow(new Date(l.last_validated_at), { addSuffix: true })
                        : "Never"}
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem asChild>
                            <Link href={`/licenses/${l.id}`}>Edit</Link>
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            disabled={isRevoked}
                            onClick={() =>
                              patchLicense(l.id, { action: "renew", tier: "monthly" }, "Renewed monthly")
                            }
                          >
                            Renew Monthly
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            disabled={isRevoked}
                            onClick={() =>
                              patchLicense(l.id, { action: "renew", tier: "quarterly" }, "Renewed quarterly")
                            }
                          >
                            Renew Quarterly
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            disabled={isRevoked}
                            onClick={() =>
                              patchLicense(l.id, { action: "renew", tier: "yearly" }, "Renewed yearly")
                            }
                          >
                            Renew Yearly
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            disabled={isRevoked}
                            onClick={() => setRevokeTarget(l)}
                          >
                            Revoke
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="text-red-600"
                            onClick={() => setDeleteTarget(l)}
                          >
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      <ConfirmDialog
        open={revokeTarget !== null}
        onOpenChange={(o) => !o && setRevokeTarget(null)}
        title="Revoke license?"
        description="This will block the EA from trading on the customer's account. They can be re-activated later."
        confirmLabel="Revoke"
        destructive
        onConfirm={() => {
          if (revokeTarget) {
            return patchLicense(revokeTarget.id, { status: "revoked" }, "License revoked");
          }
        }}
      />

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
        title="Permanently delete this license?"
        description="This cannot be undone. Use Revoke instead unless you really mean to remove all trace of this license."
        typeToConfirm="DELETE"
        confirmLabel="Delete forever"
        destructive
        onConfirm={() => {
          if (deleteTarget) {
            return deleteLicense(deleteTarget.id);
          }
        }}
      />
    </div>
  );
}
```

- [ ] **Step 2: Build**

```bash
pnpm build
```

Expected: builds clean.

- [ ] **Step 3: Commit**

```bash
git add components/license-table.tsx
git commit -m "$(cat <<'EOF'
feat(ui): LicenseTable with search, filter, row actions, dialogs

Search filters by license_key or customer_email; status filter narrows
to active/revoked/expired (uses derived display status). Click-to-copy
license key. Per-row dropdown: Edit / Renew Monthly|Quarterly|Yearly /
Revoke / Delete. Renew/Revoke disabled on already-revoked rows.
Revoke uses single-click confirm; Delete requires typing DELETE.
After actions, router.refresh() re-runs the server fetch.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 15: List page — `app/licenses/page.tsx`

**Files:**
- Create: `app/licenses/page.tsx`

- [ ] **Step 1: Write the file**

```tsx
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { LicenseTable } from "@/components/license-table";
import { SiteNav } from "@/components/site-nav";
import type { License } from "@/lib/types";

export const dynamic = "force-dynamic";

async function fetchLicenses(): Promise<License[]> {
  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .from("licenses")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) {
    console.error("Failed to fetch licenses:", error);
    return [];
  }
  return data as License[];
}

export default async function LicensesPage() {
  const licenses = await fetchLicenses();
  return (
    <div className="min-h-screen">
      <SiteNav />
      <main className="mx-auto max-w-6xl px-6 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold">Licenses</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {licenses.length} {licenses.length === 1 ? "license" : "licenses"} total
          </p>
        </div>
        <LicenseTable licenses={licenses} />
      </main>
    </div>
  );
}
```

- [ ] **Step 2: Build**

```bash
pnpm build
```

Expected: succeeds. The page is server-rendered.

- [ ] **Step 3: Smoke-test in dev**

```bash
pnpm dev > /tmp/copytraderx-dev.log 2>&1 &
sleep 6
curl -s http://localhost:3000/licenses | head -c 1500
pkill -f "next dev"
```

Expected: HTML containing "CopyTraderX Licenses", "Licenses" heading, and the existing test license rows from cloud DB.

- [ ] **Step 4: Commit**

```bash
git add app/licenses/page.tsx
git commit -m "$(cat <<'EOF'
feat(ui): add /licenses list page

Server component fetches via getSupabaseAdmin (service-role bypasses
RLS). Sorts by created_at desc. Page heading shows total count;
LicenseTable handles all interactivity client-side. force-dynamic
since data freshness matters for revoke/delete to feel snappy.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 16: UI — `<LicenseForm>` (shared by /new and /[id])

> **For agentic workers:** Visual UI work — **invoke `frontend-design` skill** for polish.

**Files:**
- Create: `components/license-form.tsx`

- [ ] **Step 1: Write the form component**

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ConfirmDialog } from "./confirm-dialog";
import { generateLicenseKey } from "@/lib/license-key";
import { calculateExpiresAt, formatExpiry } from "@/lib/expiry";
import { LICENSE_KEY_PATTERN } from "@/lib/schemas";
import type { License, LicenseTier, LicenseStatus } from "@/lib/types";
import { RefreshCw, Copy, AlertTriangle } from "lucide-react";

const formSchema = z.object({
  license_key: z.string().regex(LICENSE_KEY_PATTERN, "Must match IMPX-XXXX-XXXX-XXXX-XXXX"),
  mt5_account: z.coerce.number().int().positive("Must be a positive integer"),
  tier: z.enum(["monthly", "quarterly", "yearly", "lifetime"]),
  status: z.enum(["active", "revoked", "expired"]),
  customer_email: z.string().email().or(z.literal("")).optional(),
  notes: z.string().optional(),
});

type FormValues = z.infer<typeof formSchema>;

interface Props {
  mode: "create" | "edit";
  initial?: License;
}

export function LicenseForm({ mode, initial }: Props) {
  const router = useRouter();
  const [showDelete, setShowDelete] = useState(false);

  const defaultValues: FormValues = {
    license_key: initial?.license_key ?? generateLicenseKey(),
    mt5_account: initial?.mt5_account ?? 0,
    tier: (initial?.tier as LicenseTier | undefined) ?? "monthly",
    status: (initial?.status as LicenseStatus | undefined) ?? "active",
    customer_email: initial?.customer_email ?? "",
    notes: initial?.notes ?? "",
  };

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues,
  });

  const tier = form.watch("tier");
  const accountChanged =
    mode === "edit" && Number(form.watch("mt5_account")) !== initial?.mt5_account;

  async function onSubmit(values: FormValues) {
    const path =
      mode === "create" ? "/api/licenses" : `/api/licenses/${initial!.id}`;
    const method = mode === "create" ? "POST" : "PATCH";

    const body =
      mode === "create"
        ? {
            license_key: values.license_key,
            mt5_account: values.mt5_account,
            tier: values.tier,
            customer_email: values.customer_email || null,
            notes: values.notes || null,
          }
        : {
            mt5_account: values.mt5_account,
            tier: values.tier,
            status: values.status,
            customer_email: values.customer_email || null,
            notes: values.notes || null,
          };

    const res = await fetch(path, {
      method,
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text();
      if (res.status === 409) {
        toast.error("License key already exists. Regenerate to try again.");
      } else {
        toast.error("Save failed: " + text);
      }
      return;
    }

    toast.success(mode === "create" ? "License created" : "License updated");
    router.push("/licenses");
    router.refresh();
  }

  async function handleDelete() {
    if (!initial) return;
    const res = await fetch(`/api/licenses/${initial.id}`, { method: "DELETE" });
    if (!res.ok) {
      toast.error("Delete failed: " + (await res.text()));
      return;
    }
    toast.success("License deleted");
    router.push("/licenses");
    router.refresh();
  }

  function regenerateKey() {
    form.setValue("license_key", generateLicenseKey(), { shouldDirty: true });
  }

  function copyKey() {
    navigator.clipboard.writeText(form.getValues("license_key"));
    toast.success("Key copied");
  }

  // Preview the would-be expires_at as the user picks tier
  const previewExpiry =
    tier === "lifetime"
      ? "Never expires"
      : `Expires ${formatExpiry(
          calculateExpiresAt(tier as LicenseTier, new Date())?.toISOString() ?? null,
        )}`;

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 max-w-xl">
      <div className="space-y-2">
        <Label htmlFor="license_key">License Key</Label>
        <div className="flex gap-2">
          <Input
            id="license_key"
            {...form.register("license_key")}
            disabled={mode === "edit"}
            className="font-mono"
          />
          {mode === "create" ? (
            <Button type="button" variant="outline" size="icon" onClick={regenerateKey} title="Regenerate">
              <RefreshCw className="h-4 w-4" />
            </Button>
          ) : (
            <Button type="button" variant="outline" size="icon" onClick={copyKey} title="Copy">
              <Copy className="h-4 w-4" />
            </Button>
          )}
        </div>
        {form.formState.errors.license_key && (
          <p className="text-sm text-red-600">
            {form.formState.errors.license_key.message}
          </p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="mt5_account">MT5 Account</Label>
        <Input
          id="mt5_account"
          type="number"
          {...form.register("mt5_account")}
        />
        {form.formState.errors.mt5_account && (
          <p className="text-sm text-red-600">
            {form.formState.errors.mt5_account.message}
          </p>
        )}
        {accountChanged && (
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              Changing the MT5 account invalidates the license on the customer's
              existing account until they reconfigure the EA.
            </AlertDescription>
          </Alert>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="tier">Tier</Label>
        <Select
          value={form.watch("tier")}
          onValueChange={(v) => form.setValue("tier", v as LicenseTier, { shouldDirty: true })}
        >
          <SelectTrigger id="tier">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="monthly">Monthly</SelectItem>
            <SelectItem value="quarterly">Quarterly</SelectItem>
            <SelectItem value="yearly">Yearly</SelectItem>
            <SelectItem value="lifetime">Lifetime</SelectItem>
          </SelectContent>
        </Select>
        <p className="text-sm text-muted-foreground">{previewExpiry}</p>
      </div>

      {mode === "edit" && (
        <div className="space-y-2">
          <Label htmlFor="status">Status</Label>
          <Select
            value={form.watch("status")}
            onValueChange={(v) => form.setValue("status", v as LicenseStatus, { shouldDirty: true })}
          >
            <SelectTrigger id="status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="revoked">Revoked</SelectItem>
              <SelectItem value="expired">Expired</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor="customer_email">Customer Email (optional)</Label>
        <Input id="customer_email" type="email" {...form.register("customer_email")} />
        {form.formState.errors.customer_email && (
          <p className="text-sm text-red-600">
            {form.formState.errors.customer_email.message}
          </p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="notes">Notes (optional)</Label>
        <Textarea id="notes" rows={3} {...form.register("notes")} />
      </div>

      <div className="flex items-center gap-3 pt-2">
        <Button type="button" variant="outline" onClick={() => router.push("/licenses")}>
          Cancel
        </Button>
        <Button type="submit" disabled={form.formState.isSubmitting}>
          {mode === "create" ? "Create" : "Save"}
        </Button>
        {mode === "edit" && (
          <>
            <div className="flex-1" />
            <Button type="button" variant="destructive" onClick={() => setShowDelete(true)}>
              Delete
            </Button>
          </>
        )}
      </div>

      {mode === "edit" && (
        <ConfirmDialog
          open={showDelete}
          onOpenChange={setShowDelete}
          title="Permanently delete this license?"
          description="This cannot be undone. Use Revoke (set Status = Revoked) if you might want to restore it later."
          typeToConfirm="DELETE"
          confirmLabel="Delete forever"
          destructive
          onConfirm={handleDelete}
        />
      )}
    </form>
  );
}
```

- [ ] **Step 2: Build**

```bash
pnpm build
```

Expected: builds clean.

- [ ] **Step 3: Commit**

```bash
git add components/license-form.tsx
git commit -m "$(cat <<'EOF'
feat(ui): LicenseForm shared by create + edit

Single component handles both modes via a 'mode' prop. Create mode
auto-generates a key (regenerable); edit mode locks the key (with a
copy button) and shows status select. Yellow warning Alert appears
when mt5_account changes in edit mode. Tier picker previews the
resulting expires_at. Delete (edit only) opens type-to-confirm dialog.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 17: Form pages — `/licenses/new` and `/licenses/[id]`

**Files:**
- Create: `app/licenses/new/page.tsx`
- Create: `app/licenses/[id]/page.tsx`

- [ ] **Step 1: Write `app/licenses/new/page.tsx`**

```tsx
import Link from "next/link";
import { LicenseForm } from "@/components/license-form";
import { SiteNav } from "@/components/site-nav";

export default function NewLicensePage() {
  return (
    <div className="min-h-screen">
      <SiteNav />
      <main className="mx-auto max-w-6xl px-6 py-8">
        <div className="mb-6">
          <Link href="/licenses" className="text-sm text-muted-foreground hover:underline">
            ← Back to licenses
          </Link>
          <h1 className="mt-2 text-2xl font-semibold">New License</h1>
        </div>
        <LicenseForm mode="create" />
      </main>
    </div>
  );
}
```

- [ ] **Step 2: Write `app/licenses/[id]/page.tsx`**

```tsx
import Link from "next/link";
import { notFound } from "next/navigation";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { LicenseForm } from "@/components/license-form";
import { SiteNav } from "@/components/site-nav";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { isExpired } from "@/lib/expiry";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertTriangle } from "lucide-react";
import type { License } from "@/lib/types";

export const dynamic = "force-dynamic";

async function fetchLicense(id: number): Promise<License | null> {
  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .from("licenses")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) return null;
  return data as License | null;
}

export default async function EditLicensePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const numericId = Number(id);
  if (!Number.isInteger(numericId) || numericId <= 0) notFound();

  const license = await fetchLicense(numericId);
  if (!license) notFound();

  const pastExpiry =
    license.status === "active" && isExpired(license.expires_at);

  return (
    <div className="min-h-screen">
      <SiteNav />
      <main className="mx-auto max-w-6xl px-6 py-8">
        <div className="mb-6">
          <Link href="/licenses" className="text-sm text-muted-foreground hover:underline">
            ← Back to licenses
          </Link>
          <h1 className="mt-2 text-2xl font-semibold">Edit License</h1>
        </div>

        {pastExpiry && (
          <Alert className="mb-6">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              License is past expiry — customer's EA stopped trading on{" "}
              {new Date(license.expires_at!).toLocaleDateString()}. Renew below to reactivate.
            </AlertDescription>
          </Alert>
        )}

        <LicenseForm mode="edit" initial={license} />

        <Card className="mt-10 max-w-xl">
          <CardHeader>
            <CardTitle className="text-base">Metadata</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2 text-sm">
            <Row label="ID" value={license.id} />
            <Row label="Created" value={license.created_at} />
            <Row label="Purchase Date" value={license.purchase_date ?? "—"} />
            <Row
              label="Last Validated"
              value={license.last_validated_at ?? "Never"}
            />
            <Row label="Broker (last seen)" value={license.broker_name ?? "—"} />
          </CardContent>
        </Card>
      </main>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex justify-between gap-4 border-b py-1.5 last:border-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-mono text-xs">{value}</span>
    </div>
  );
}
```

- [ ] **Step 3: Build**

```bash
pnpm build
```

Expected: succeeds.

- [ ] **Step 4: End-to-end smoke test**

```bash
pnpm dev > /tmp/copytraderx-dev.log 2>&1 &
sleep 6

echo "--- /licenses/new should render the form ---"
curl -s http://localhost:3000/licenses/new | grep -o "License Key" | head -1

echo "--- /licenses/[id] for the existing test license ---"
ID=$(curl -s http://localhost:3000/api/licenses | python3 -c "import sys,json; print(json.load(sys.stdin)['licenses'][0]['id'])")
echo "Editing ID = $ID"
curl -s "http://localhost:3000/licenses/$ID" | grep -o "Edit License" | head -1

echo "--- /licenses/99999999 should 404 ---"
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/licenses/99999999

pkill -f "next dev"
```

Expected: form renders, edit page renders, missing id returns 404.

- [ ] **Step 5: Commit**

```bash
git add app/licenses/new/page.tsx app/licenses/[id]/page.tsx
git commit -m "$(cat <<'EOF'
feat(ui): add /licenses/new and /licenses/[id] pages

Both pages reuse <LicenseForm> with the right mode. Edit page
fetches the row server-side with notFound() on miss, surfaces a
"past expiry" warning Alert when relevant, and shows a read-only
Metadata card with id/created_at/purchase_date/last_validated_at/
broker_name below the form.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 18: Dockerfile + docker-compose.yml

**Files:**
- Create: `Dockerfile`
- Create: `docker-compose.yml`
- Create: `.dockerignore`

- [ ] **Step 1: Write `.dockerignore`**

```
node_modules
.next
.git
.env
.env.local
*.log
docs
.vscode
.idea
README.md
Dockerfile
docker-compose.yml
.dockerignore
```

- [ ] **Step 2: Write `Dockerfile`**

```dockerfile
# 1. Dependencies
FROM node:23-alpine AS deps
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

# 2. Build
FROM node:23-alpine AS builder
WORKDIR /app
RUN corepack enable
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm build

# 3. Runtime (Next.js standalone)
FROM node:23-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Copy standalone output
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

EXPOSE 3000
CMD ["node", "server.js"]
```

- [ ] **Step 3: Write `docker-compose.yml`**

```yaml
services:
  copytraderx-license:
    container_name: copytraderx-license
    build:
      context: .
      dockerfile: Dockerfile
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

- [ ] **Step 4: Create the `.env` file Docker compose will read**

```bash
cp .env.example .env
SERVICE_KEY=$(supabase projects api-keys --project-ref mkfabzqlxzeidfblxzhq 2>/dev/null | grep service_role | awk '{print $3}')
# Replace the empty SUPABASE_SERVICE_ROLE_KEY= line with the real value
if grep -q "^SUPABASE_SERVICE_ROLE_KEY=$" .env; then
  sed -i.bak "s|^SUPABASE_SERVICE_ROLE_KEY=$|SUPABASE_SERVICE_ROLE_KEY=$SERVICE_KEY|" .env
  rm .env.bak
fi
grep "^SUPABASE_SERVICE_ROLE_KEY=" .env | head -1 | wc -c
```

Expected: a number > 100 (the key is a JWT, ~200 chars). The line should be populated.

- [ ] **Step 5: Build the image**

```bash
docker compose build
```

Expected: builds. ~2 minutes first time. The final image tag will be like `copytraderx-license-copytraderx-license`.

- [ ] **Step 6: Bring it up and smoke-test**

```bash
docker compose up -d
sleep 5
docker compose logs --tail 30 copytraderx-license
docker compose ps
```

Expected: container `copytraderx-license` shows `Up`. Logs show Next.js ready on port 3000.

```bash
# Test from inside the same network
docker exec lgu-nginx wget -qO- http://copytraderx-license:3000/api/licenses | head -c 300
```

Expected: JSON response with the licenses array.

- [ ] **Step 7: Commit**

```bash
git add Dockerfile docker-compose.yml .dockerignore
git commit -m "$(cat <<'EOF'
chore(docker): add multi-stage Dockerfile and compose service

Three-stage build (deps→builder→runner) over node:23-alpine using
Next.js standalone output. Final image ~120MB. docker-compose
attaches the container to development_lgu-network so lgu-nginx can
proxy by container name. SUPABASE_SERVICE_ROLE_KEY comes from
project-root .env (gitignored).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 19: nginx + DNS wiring

**Files:**
- Modify: `/Users/jsonse/Documents/development/nginx/nginx.conf`

This task touches infrastructure outside the project repo. No commits in the project repo for the nginx change itself (that file isn't tracked here).

- [ ] **Step 1: Replace the existing `copytraderx.local` server block**

Open `/Users/jsonse/Documents/development/nginx/nginx.conf`. Find the existing block:

```
    # CopyTraderX-Impulse Licensing — proxies to local Supabase Kong gateway
    server {
        listen 80;
        server_name copytraderx.local;

        location / {
            set $upstream_ctx http://supabase_kong_JSONFX-IMPULSE:8000;
            ...
        }
    }
```

Replace the entire block with:

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

- [ ] **Step 2: Validate nginx config and reload**

```bash
docker exec lgu-nginx nginx -t
docker exec lgu-nginx nginx -s reload
```

Expected: `syntax is ok`, `test is successful`. Reload prints nothing (success).

If `nginx -t` complains the config wasn't picked up, the bind-mount may be stale (Docker for Mac quirk):

```bash
docker restart lgu-nginx
sleep 3
docker network connect supabase_network_JSONFX-IMPULSE lgu-nginx 2>&1 || true
```

(Reconnect to supabase network is harmless if already connected; we'll disconnect in the next step.)

- [ ] **Step 3: Disconnect lgu-nginx from the local Supabase network**

It's no longer needed since we're not proxying to Kong:

```bash
docker network disconnect supabase_network_JSONFX-IMPULSE lgu-nginx 2>&1 || echo "(already disconnected)"
```

- [ ] **Step 4: Smoke-test the full chain**

```bash
curl -s -o /dev/null -w "Status: %{http_code}\n" http://copytraderx.local
curl -s http://copytraderx.local/licenses | grep -o "CopyTraderX Licenses" | head -1
curl -s http://copytraderx.local/api/licenses | head -c 200
```

Expected:
- HTTP 200 on `/` (will redirect, status 307 or 200 depending on Next.js)
- "CopyTraderX Licenses" string appears
- `/api/licenses` returns JSON

- [ ] **Step 5: Open in your browser**

In Safari/Chrome: `http://copytraderx.local`. You should see the licenses list page with the existing test row(s) from cloud Supabase.

This step makes no commit (nginx file is external).

---

## Task 20: README + first push to GitHub

**Files:**
- Create: `README.md`

- [ ] **Step 1: Write `README.md`**

```markdown
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
# Paste the service_role JWT into SUPABASE_SERVICE_ROLE_KEY

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

- **Frontend:** Next.js 16 App Router, React 19, Tailwind v4, shadcn/ui
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
```

- [ ] **Step 2: Add the GitHub remote and push**

```bash
git remote add origin git@github.com:JSON-FX/copytraderx.git
git branch -M main
```

Verify the remote:

```bash
git remote -v
```

Expected: `origin git@github.com:JSON-FX/copytraderx.git` for both fetch and push.

- [ ] **Step 3: Commit README**

```bash
git add README.md
git commit -m "$(cat <<'EOF'
docs: add README

Quick start, day-to-day commands, schema migration workflow,
and a DEV-ONLY warning. Documents the manual customer-email flow
for delivering keys.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 4: Push**

```bash
git push -u origin main
```

Expected: `Branch 'main' set up to track 'origin/main'.` All commits land on GitHub.

- [ ] **Step 5: Verify on GitHub**

Visit `https://github.com/JSON-FX/copytraderx`. You should see all the commits, the README rendered, and the project structure.

---

## Self-Review

### Spec coverage

- §3 architecture (browser → nginx → container → Supabase) — Tasks 18, 19
- §4 tech stack — Tasks 2, 3, 4
- §5 schema migration (`tier` column) — Task 1
- §5 calculateExpiresAt helper — Task 7
- §6 list view (`/licenses`) — Task 14, 15
- §6 create form (`/licenses/new`) — Task 16, 17
- §6 edit form (`/licenses/[id]`) — Task 16, 17
- §7 API routes (GET, POST, PATCH, DELETE) — Tasks 9, 10
- §7 PATCH renew action vs partial update — Task 10
- §8 component structure — Tasks 12, 13, 14, 16
- §9 branding (logo + palette) — Tasks 3, 12
- §10 Dockerfile + docker-compose.yml — Task 18
- §10 nginx server block + lgu-nginx network disconnect — Task 19
- §11 error handling (toasts, 409, soft warnings) — Tasks 9, 14, 16
- §12 v1 deliverables — covered across Tasks 1–20
- §13 out-of-scope items — explicitly not implemented (no auth, no audit, etc.)
- §14 risks (.env gitignore, key drift) — Tasks 2, 18, 20
- §15 README — Task 20

### Placeholder scan

- "TBD"/"TODO"/"fill in details" — none.
- "Add appropriate error handling" — none; specific status codes and messages everywhere.
- "Similar to Task N" — none; each step is self-contained.
- Test code with no assertions — none; all tests have explicit `expect`.
- References to undefined types/methods — `License`, `LicenseTier`, `LicenseStatus`, `DisplayStatus`, `generateLicenseKey`, `calculateExpiresAt`, `isExpired`, `computeDisplayStatus`, `formatExpiry`, `getSupabaseAdmin`, `LICENSE_KEY_PATTERN`, `LICENSE_KEY_ALPHABET`, `createLicenseSchema`, `updateLicenseSchema`, `renewActionSchema` — all defined in earlier tasks.

### Type consistency

- `License` shape used in API routes (Tasks 9, 10), list page (Task 15), edit page (Task 17), table (Task 14), form (Task 16) — all match `lib/types.ts` (Task 5).
- `LicenseTier` used identically across schemas (Task 5), expiry helpers (Task 7), table (Task 14), form (Task 16).
- `getSupabaseAdmin()` (Task 8) is the only DB entry point, used in all 3 API route files (Tasks 9, 10) and 2 server pages (Tasks 15, 17). Consistent.
- `generateLicenseKey()` from Task 6 is used in Task 16 (form pre-fill). Same export name.
- `LICENSE_KEY_PATTERN` from Task 5 is reused in Task 6 tests and Task 16 form schema.

No issues found.

---

## Execution Handoff

The plan has 20 tasks. Tasks 12, 13, 14, 16 are visual UI work and the implementer should invoke the `frontend-design` skill before/during those tasks. Tasks 1, 11, 19, 20 cross repo or infra boundaries (EA repo, dev server smoke, nginx config, GitHub push).
