# License Polling + "Inactive" Expiry Label — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the misleading "Lifetime" label in the EA Dashboard with "Inactive", and add automatic 3s polling to the admin licenses table with a configurable `/settings` page.

**Architecture:** Two repos. In `JSONFX-IMPULSE` (MQL5 EA), string-only changes — flip the `expires_at == 0` label and clean up legacy "lifetime" log strings. In `copytraderx-license` (Next.js admin), add a localStorage-backed settings module, convert the licenses table to a stateful client component that polls `GET /api/licenses` on a configurable interval, and add a `/settings` page exposing that interval.

**Tech Stack:** MQL5 (EA strings), Next.js 16 App Router, React 19, TypeScript, Jest + ts-jest (Node test environment), shadcn/ui, sonner.

---

## File Structure

| File | Responsibility |
|---|---|
| `JSONFX-IMPULSE/Include/CopyTraderX-Impulse/Dashboard.mqh` | Render "Inactive" instead of "Lifetime" when `licenseExpiresAt == 0` |
| `JSONFX-IMPULSE/Include/CopyTraderX-Impulse/LicenseManager.mqh` | Update log strings + comments to use "inactive" terminology |
| `copytraderx-license/lib/settings.ts` | localStorage helpers for polling interval (`getPollingInterval`, `setPollingInterval`, `POLLING_OPTIONS`, `POLLING_KEY`) |
| `copytraderx-license/lib/settings.test.ts` | Unit tests for the helpers |
| `copytraderx-license/app/licenses/page.tsx` | Pass server-fetched data as `initialLicenses` |
| `copytraderx-license/components/license-table.tsx` | Stateful client component: polling, visibility pause, storage events, replace `router.refresh()` with `refetch()` |
| `copytraderx-license/app/settings/page.tsx` | New page exposing the polling-interval Select |
| `copytraderx-license/components/site-nav.tsx` | Add Settings link with active-route highlighting |

Each file has one responsibility and is editable in isolation.

---

## Task 1: EA Dashboard label change

**Files:**
- Modify: `JSONFX-IMPULSE/Include/CopyTraderX-Impulse/Dashboard.mqh:382`

Pure-string change, no logic change. MQL5 has no test framework — verification is by clean compile + visual inspection (per project convention).

- [ ] **Step 1: Edit Dashboard.mqh**

Replace line 382:
```cpp
         licenseExpiryStr = "Lifetime";
```
With:
```cpp
         licenseExpiryStr = "Inactive";
```

- [ ] **Step 2: Verify compile**

Open `MetaEditor`, compile `Experts/Advisors/CopyTraderX-Impulse/CopyTraderX-Impulse.mq5`. Expected: 0 errors, 0 warnings.

(If compiling in CI/CLI: this project has no CLI compile step documented. Confirm visually that no other file references the literal `"Lifetime"`.)

- [ ] **Step 3: Confirm no other "Lifetime" references in EA code**

Run:
```bash
grep -rn "Lifetime" JSONFX-IMPULSE/Experts JSONFX-IMPULSE/Include
```
Expected: no output.

- [ ] **Step 4: Commit**

```bash
cd /Users/jsonse/Documents/development/EA
git add JSONFX-IMPULSE/Include/CopyTraderX-Impulse/Dashboard.mqh
git commit -m "fix(ea): show 'Inactive' instead of 'Lifetime' for unknown expiry

We do not sell a lifetime tier. The 'Lifetime' label appeared whenever
the cached token had expires_at = null/0, which only happens for stale
caches. Replacing the user-facing label avoids confusing the customer;
the next 12h revalidation refreshes the cache with a real date."
```

---

## Task 2: EA LicenseManager — drop "lifetime" terminology

**Files:**
- Modify: `JSONFX-IMPULSE/Include/CopyTraderX-Impulse/LicenseManager.mqh` (lines 31, 244, 468, 505)

- [ ] **Step 1: Update line 31 (member comment)**

Replace:
```cpp
   datetime           m_token_expires_at;       // license-level expiry (0 = lifetime)
```
With:
```cpp
   datetime           m_token_expires_at;       // license-level expiry (0 = unknown/inactive)
```

- [ ] **Step 2: Update line 244 (parser comment)**

Replace:
```cpp
      m_token_expires_at = 0;  // 0 means lifetime
```
With:
```cpp
      m_token_expires_at = 0;  // 0 means expiry unknown — Dashboard renders "Inactive"
```

- [ ] **Step 3: Update line 468 (FetchAndStoreToken log)**

Replace:
```cpp
   string expiry_str = (m_token_expires_at == 0) ? "lifetime" : TimeToString(m_token_expires_at, TIME_DATE);
```
With:
```cpp
   string expiry_str = (m_token_expires_at == 0) ? "inactive" : TimeToString(m_token_expires_at, TIME_DATE);
```

- [ ] **Step 4: Update line 505 (Init cached-load log)**

Same change as Step 3, applied to the second occurrence (around line 505).

Replace:
```cpp
      string expiry_str = (m_token_expires_at == 0) ? "lifetime" : TimeToString(m_token_expires_at, TIME_DATE);
```
With:
```cpp
      string expiry_str = (m_token_expires_at == 0) ? "inactive" : TimeToString(m_token_expires_at, TIME_DATE);
```

- [ ] **Step 5: Confirm no other "lifetime" string remains**

Run:
```bash
grep -rni "lifetime" JSONFX-IMPULSE/Experts JSONFX-IMPULSE/Include
```
Expected: no output.

- [ ] **Step 6: Verify compile**

Compile in MetaEditor. Expected: 0 errors, 0 warnings.

- [ ] **Step 7: Commit**

```bash
cd /Users/jsonse/Documents/development/EA
git add JSONFX-IMPULSE/Include/CopyTraderX-Impulse/LicenseManager.mqh
git commit -m "chore(ea): replace 'lifetime' with 'inactive' in LicenseManager logs/comments

Aligns log output and code comments with the Dashboard label change.
No behavior change — m_token_expires_at = 0 still means 'expiry unknown
from token'."
```

---

## Task 3: Admin app — `lib/settings.ts` (TDD)

**Files:**
- Create: `copytraderx-license/lib/settings.ts`
- Create: `copytraderx-license/lib/settings.test.ts`

The Jest config uses `testEnvironment: "node"`. localStorage is not available in Node — we must guard with `typeof window === "undefined"` (already in the design) and write tests that mock localStorage or run on jsdom. Simplest: use a small in-test localStorage stub since we control the module surface.

- [ ] **Step 1: Write failing test for `getPollingInterval` defaults**

Create `copytraderx-license/lib/settings.test.ts`:
```ts
/**
 * @jest-environment jsdom
 */
import {
  getPollingInterval,
  setPollingInterval,
  POLLING_KEY,
  POLLING_OPTIONS,
} from "./settings";

beforeEach(() => {
  localStorage.clear();
});

describe("getPollingInterval", () => {
  it("returns the default 3000 when nothing is stored", () => {
    expect(getPollingInterval()).toBe(3000);
  });

  it("returns the stored value when valid", () => {
    localStorage.setItem(POLLING_KEY, "5000");
    expect(getPollingInterval()).toBe(5000);
  });

  it("returns 0 when explicitly stored as 0 (Off)", () => {
    localStorage.setItem(POLLING_KEY, "0");
    expect(getPollingInterval()).toBe(0);
  });

  it("falls back to default for non-numeric values", () => {
    localStorage.setItem(POLLING_KEY, "banana");
    expect(getPollingInterval()).toBe(3000);
  });

  it("falls back to default for negative values", () => {
    localStorage.setItem(POLLING_KEY, "-100");
    expect(getPollingInterval()).toBe(3000);
  });
});

describe("setPollingInterval", () => {
  it("writes the value to localStorage under POLLING_KEY", () => {
    setPollingInterval(10000);
    expect(localStorage.getItem(POLLING_KEY)).toBe("10000");
  });
});

describe("POLLING_OPTIONS", () => {
  it("starts with the Off option", () => {
    expect(POLLING_OPTIONS[0]).toEqual({ label: "Off", value: 0 });
  });

  it("includes 3 seconds as a discoverable option", () => {
    expect(POLLING_OPTIONS.find((o) => o.value === 3000)).toBeTruthy();
  });
});
```

- [ ] **Step 2: Install jsdom test environment if missing**

Run:
```bash
cd /Users/jsonse/Documents/development/copytraderx-license
pnpm list jest-environment-jsdom 2>&1 | head -5
```
If not installed:
```bash
pnpm add -D jest-environment-jsdom
```

- [ ] **Step 3: Run the failing test**

```bash
cd /Users/jsonse/Documents/development/copytraderx-license
pnpm test lib/settings.test.ts
```
Expected: FAIL — `Cannot find module './settings'`.

- [ ] **Step 4: Implement `lib/settings.ts`**

Create `copytraderx-license/lib/settings.ts`:
```ts
const KEY = "ctx.pollingIntervalMs";
const DEFAULT_MS = 3000;

export const POLLING_KEY = KEY;

export const POLLING_OPTIONS = [
  { label: "Off", value: 0 },
  { label: "1 second", value: 1000 },
  { label: "3 seconds", value: 3000 },
  { label: "5 seconds", value: 5000 },
  { label: "10 seconds", value: 10000 },
  { label: "30 seconds", value: 30000 },
] as const;

export function getPollingInterval(): number {
  if (typeof window === "undefined") return DEFAULT_MS;
  const raw = window.localStorage.getItem(KEY);
  if (raw === null) return DEFAULT_MS;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return DEFAULT_MS;
  return n;
}

export function setPollingInterval(ms: number): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KEY, String(ms));
}
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
pnpm test lib/settings.test.ts
```
Expected: PASS — all 7 tests.

- [ ] **Step 6: Commit**

```bash
cd /Users/jsonse/Documents/development/copytraderx-license
git add lib/settings.ts lib/settings.test.ts package.json pnpm-lock.yaml
git commit -m "feat(settings): add localStorage helpers for polling interval

New module owns the ctx.pollingIntervalMs key + the option list shared
by the licenses table and the settings page. Default 3000ms; 0 = Off.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

(Include `package.json`/`pnpm-lock.yaml` only if `jest-environment-jsdom` was installed in Step 2.)

---

## Task 4: Wire `initialLicenses` prop through the page

**Files:**
- Modify: `copytraderx-license/app/licenses/page.tsx`

Trivial rename — the table component will be modified in Task 5 to accept this prop. Do this first so the type error is loud and obvious during Task 5.

- [ ] **Step 1: Edit the page**

Replace the `<LicenseTable licenses={licenses} />` line with `<LicenseTable initialLicenses={licenses} />`.

Updated `app/licenses/page.tsx`:
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
        <LicenseTable initialLicenses={licenses} />
      </main>
    </div>
  );
}
```

- [ ] **Step 2: Skip type-check for now**

The LicenseTable signature still expects `licenses` until Task 5. We'll do a single combined commit after Task 5 to keep the tree compiling. Move on.

---

## Task 5: License table — polling, visibility, storage events

**Files:**
- Modify: `copytraderx-license/components/license-table.tsx`

This is the largest change. The component already has all rendering logic; we keep that and only modify state ownership + add three effects.

- [ ] **Step 1: Replace the imports block**

Replace:
```tsx
import { useState, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
```
With:
```tsx
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  getPollingInterval,
  POLLING_KEY,
} from "@/lib/settings";
```

- [ ] **Step 2: Replace the component signature and add state + effects**

Replace the line:
```tsx
export function LicenseTable({ licenses }: { licenses: License[] }) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
```
With:
```tsx
export function LicenseTable({ initialLicenses }: { initialLicenses: License[] }) {
  const [licenses, setLicenses] = useState<License[]>(initialLicenses);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [intervalMs, setIntervalMs] = useState<number>(3000);

  // Read interval from localStorage after mount (avoids SSR mismatch).
  useEffect(() => {
    setIntervalMs(getPollingInterval());
  }, []);

  // Replace router.refresh() — fetch the snapshot and overwrite local state.
  // Failures are silent so a flaky network doesn't spam toasts every poll.
  const refetch = useCallback(async () => {
    try {
      const res = await fetch("/api/licenses", { cache: "no-store" });
      if (!res.ok) return;
      const json = (await res.json()) as { licenses: License[] };
      setLicenses(json.licenses);
    } catch {
      /* silent */
    }
  }, []);

  // Polling — pauses while the tab is hidden.
  useEffect(() => {
    if (intervalMs <= 0) return;

    let timer: ReturnType<typeof setInterval> | null = null;
    const start = () => {
      if (timer !== null) return;
      timer = setInterval(refetch, intervalMs);
    };
    const stop = () => {
      if (timer !== null) {
        clearInterval(timer);
        timer = null;
      }
    };
    const onVisibility = () => {
      if (document.hidden) stop();
      else start();
    };

    if (!document.hidden) start();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [intervalMs, refetch]);

  // Pick up settings changes from another tab.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === POLLING_KEY) setIntervalMs(getPollingInterval());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);
```

- [ ] **Step 3: Update the `now` memo dep**

The existing `useMemo` recomputes `now` when `licenses` changes — that already updates on every poll, so no change needed. Confirm the line still reads:
```tsx
const now = useMemo(() => new Date(), [licenses]);
```
Leave it.

- [ ] **Step 4: Replace `router.refresh()` calls in `patchLicense`**

Replace:
```tsx
    toast.success(msg);
    router.refresh();
  }
```
With:
```tsx
    toast.success(msg);
    await refetch();
  }
```

- [ ] **Step 5: Replace `router.refresh()` calls in `deleteLicense`**

Replace:
```tsx
    toast.success("License deleted");
    router.refresh();
  }
```
With:
```tsx
    toast.success("License deleted");
    await refetch();
  }
```

- [ ] **Step 6: Type-check**

```bash
cd /Users/jsonse/Documents/development/copytraderx-license
pnpm exec tsc --noEmit
```
Expected: 0 errors. (If there's a stray `useRouter` reference, remove it.)

- [ ] **Step 7: Lint**

```bash
pnpm lint
```
Expected: 0 errors. (Unused-import warnings for `useRouter` should be gone since we removed the import in Step 1.)

- [ ] **Step 8: Smoke test in dev**

```bash
pnpm dev
```
Open `http://localhost:3000/licenses`. Open browser DevTools → Network → filter `licenses`. Expected: a `GET /api/licenses` request fires every 3 seconds while the tab is foreground; pauses when you switch to another tab.

- [ ] **Step 9: Commit**

```bash
git add app/licenses/page.tsx components/license-table.tsx
git commit -m "feat(table): auto-poll /api/licenses every 3s (configurable)

The licenses table now owns its own state and refetches on a localStorage-
backed interval (default 3000ms, 0 = off). Replaces router.refresh() so
mutations reuse the same fetch path. Pauses while the tab is hidden;
listens for cross-tab settings changes via the storage event.

Fixes: admin table showing 'Not activated' after EA validation until
manual reload.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: Site nav — Settings link

**Files:**
- Modify: `copytraderx-license/components/site-nav.tsx`

The current nav has only the logo. Add right-aligned links for Licenses + Settings, with active highlighting.

- [ ] **Step 1: Replace the nav contents**

Replace the entire body of `components/site-nav.tsx` with:
```tsx
"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";

export function SiteNav() {
  const pathname = usePathname();

  const linkClass = (href: string) =>
    pathname?.startsWith(href)
      ? "text-foreground"
      : "text-muted-foreground hover:text-foreground transition-colors";

  return (
    <header className="border-b bg-background">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-6">
        <Link
          href="/licenses"
          className="flex items-center gap-3 transition-opacity hover:opacity-80"
        >
          <Image
            src="/copytraderx-logo.png"
            alt="CopyTraderX"
            width={32}
            height={32}
            priority
          />
          <span className="text-base font-semibold tracking-tight text-foreground">
            CopyTraderX{" "}
            <span className="font-normal text-muted-foreground">Licenses</span>
          </span>
        </Link>

        <nav className="ml-auto flex items-center gap-5 text-sm">
          <Link
            href="/licenses"
            className={linkClass("/licenses")}
            aria-current={pathname?.startsWith("/licenses") ? "page" : undefined}
          >
            Licenses
          </Link>
          <Link
            href="/settings"
            className={linkClass("/settings")}
            aria-current={pathname?.startsWith("/settings") ? "page" : undefined}
          >
            Settings
          </Link>
        </nav>
      </div>
    </header>
  );
}
```

- [ ] **Step 2: Type-check**

```bash
pnpm exec tsc --noEmit
```
Expected: 0 errors.

- [ ] **Step 3: Visual check in dev**

With `pnpm dev` running, refresh `/licenses`. Confirm "Licenses" + "Settings" links appear right-aligned in the nav. Hover state shows colour shift; the current route is bolder.

- [ ] **Step 4: Commit**

```bash
git add components/site-nav.tsx
git commit -m "feat(nav): add Settings link with active-route highlight

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: Settings page

**Files:**
- Create: `copytraderx-license/app/settings/page.tsx`

- [ ] **Step 1: Create the page**

Create `copytraderx-license/app/settings/page.tsx`:
```tsx
"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { SiteNav } from "@/components/site-nav";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  POLLING_OPTIONS,
  getPollingInterval,
  setPollingInterval,
} from "@/lib/settings";

export default function SettingsPage() {
  const [interval, setIntervalState] = useState<number>(3000);

  useEffect(() => {
    setIntervalState(getPollingInterval());
  }, []);

  function onChange(value: string) {
    const ms = Number(value);
    setPollingInterval(ms);
    setIntervalState(ms);
    toast.success("Saved");
  }

  return (
    <div className="min-h-screen">
      <SiteNav />
      <main className="mx-auto max-w-6xl px-6 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold">Settings</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Preferences are stored in this browser only.
          </p>
        </div>

        <div className="max-w-md space-y-6">
          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="polling-interval">
              License table auto-refresh
            </label>
            <Select value={String(interval)} onValueChange={onChange}>
              <SelectTrigger id="polling-interval">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {POLLING_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={String(o.value)}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              How often the licenses table refetches in the background.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

```bash
pnpm exec tsc --noEmit
```
Expected: 0 errors.

- [ ] **Step 3: Manual end-to-end test**

With `pnpm dev` running:

1. Visit `http://localhost:3000/settings`. Default selection = "3 seconds".
2. Change to "Off". Toast "Saved" appears.
3. DevTools → Application → Local Storage → confirm `ctx.pollingIntervalMs = 0`.
4. Navigate to `/licenses`. Network panel: NO recurring `/api/licenses` requests.
5. Back to `/settings`. Change to "1 second".
6. `/licenses` → confirm `/api/licenses` fires every ~1s.
7. Switch tab away → requests stop. Switch back → resume.
8. Open `/licenses` in two browser tabs. In one, navigate to `/settings`, change interval. In the other tab still on `/licenses`, confirm the new interval takes effect (storage event).

- [ ] **Step 4: Commit**

```bash
git add app/settings/page.tsx
git commit -m "feat(settings): add /settings page for polling interval

Single setting today: license table auto-refresh interval. Stored in
localStorage (per-browser). Off / 1s / 3s / 5s / 10s / 30s.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 8: Final verification

- [ ] **Step 1: Run the full test suite**

```bash
cd /Users/jsonse/Documents/development/copytraderx-license
pnpm test
```
Expected: all suites green (existing tests + new `lib/settings.test.ts`).

- [ ] **Step 2: Lint clean**

```bash
pnpm lint
```
Expected: 0 errors, 0 warnings.

- [ ] **Step 3: Production build**

```bash
pnpm build
```
Expected: build succeeds. The new `/settings` route appears in the route summary.

- [ ] **Step 4: End-to-end smoke**

With `pnpm dev`:
1. `/licenses` loads, table polls every 3s.
2. Mutate a row (renew/revoke); table updates immediately via `refetch`, no double-refresh.
3. `/settings` toggles polling off and on; behaviour matches.

If all green, the feature is done.

---

## Self-Review Notes

**Spec coverage:**
- "Lifetime → Inactive" — Task 1 (Dashboard), Task 2 (LicenseManager comments + logs).
- "Table updates after activation" — Task 5 (polling).
- "Polling default 3s, configurable in /settings" — Task 3 (settings module), Task 7 (page).
- "localStorage only" — Task 3.
- "No realtime, no 'live' indicator, silent failures, visibility pause" — Task 5 effect.
- All seven files in the spec's "Files touched" table appear in a task.

**Placeholder scan:** none — every code block is concrete, every command is exact.

**Type consistency:**
- `getPollingInterval` / `setPollingInterval` / `POLLING_KEY` / `POLLING_OPTIONS` defined in Task 3, consumed in Task 5 (`getPollingInterval`, `POLLING_KEY`) and Task 7 (`getPollingInterval`, `setPollingInterval`, `POLLING_OPTIONS`). All names match.
- `LicenseTable` prop renamed `licenses` → `initialLicenses` consistently in Task 4 (page) and Task 5 (component). API response shape `{licenses: License[]}` matches the existing `GET /api/licenses` handler.
- `License` type imported from `@/lib/types` already used by both files — no change needed.

No issues found.
