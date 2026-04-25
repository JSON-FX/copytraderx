# License Polling + "Inactive" Expiry Label

**Date:** 2026-04-25
**Scope:** copytraderx-license (Next.js admin app) + JSONFX-IMPULSE (MQL5 EA)

## Problem

Three related issues from a license activation walkthrough:

1. **EA Dashboard shows "Lifetime" for fresh activations.** The `LicenseManager` parses `expires_at: null` from the cached token as `m_token_expires_at = 0`, and the Dashboard renders that as `"Lifetime"`. We do not sell a lifetime tier — this is a misleading label that resolves itself only after the next 12h revalidation.
2. **Admin licenses table shows "Not activated" after the EA has activated.** The `/licenses` page is server-rendered and only refetches on user actions (`router.refresh()` after PATCH/DELETE). Server-side stamping of `activated_at` by the validate-license edge function is invisible to an open browser tab.
3. **No automatic refresh.** Watching activation happen requires manual reload.

## Goals

- EA Dashboard never shows "Lifetime"; uses "Inactive" when `expires_at` is unknown.
- Admin licenses table updates automatically every 3s by default.
- Polling interval configurable in a new `/settings` page (Off / 1s / 3s / 5s / 10s / 30s).

## Non-goals

- No server-side settings storage (localStorage only).
- No real-time push (no Supabase realtime subscriptions). Polling is sufficient.
- No new visual indicator on the table for "polling active" — silent refresh.
- No retry/backoff sophistication on failed polls.

## Design

### Part 1 — EA Dashboard label change

**File:** `JSONFX-IMPULSE/Include/CopyTraderX-Impulse/Dashboard.mqh`

The "Expires" row in the LICENSE section currently renders:

```cpp
if(!licenseValid)
   licenseExpiryStr = "—";
else if(licenseExpiresAt == 0)
   licenseExpiryStr = "Lifetime";
else
   licenseExpiryStr = TimeToString(licenseExpiresAt, TIME_DATE);
```

Change `"Lifetime"` → `"Inactive"`. Behavioral consequence: a freshly-activated EA that loaded a stale cache without `expires_at` will display "Inactive" in the Expires row until the next 12h revalidation overwrites the cache with a real date. No new logic needed — `LicenseConfig.mqh:LICENSE_REVALIDATE_INTERVAL_SEC` (12h) and the edge function always returning a real `expires_at` for `monthly|quarterly|yearly` tiers ([validate-license/index.ts:67](../../../EA/JSONFX-IMPULSE/supabase/functions/validate-license/index.ts)) guarantee self-correction.

**File:** `JSONFX-IMPULSE/Include/CopyTraderX-Impulse/LicenseManager.mqh`

Replace "lifetime" with "inactive" in the two log strings (lines 468, 505) and the two comments (lines 31, 244) so log output and code reading stay consistent with the dashboard label.

No behavior change beyond strings. The `m_token_expires_at = 0` sentinel keeps its meaning.

### Part 2 — License table auto-polling

#### New file: `lib/settings.ts`

```ts
const KEY = "ctx.pollingIntervalMs";
const DEFAULT_MS = 3000;

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
  const raw = localStorage.getItem(KEY);
  if (raw === null) return DEFAULT_MS;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : DEFAULT_MS;
}

export function setPollingInterval(ms: number): void {
  localStorage.setItem(KEY, String(ms));
}

export const POLLING_KEY = KEY;
```

Exporting `POLLING_KEY` lets the table listen for `storage` events keyed to this setting.

#### Modify: `app/licenses/page.tsx`

Rename the prop passed to the table:

```tsx
<LicenseTable initialLicenses={licenses} />
```

No other change. SSR still hands the first paint of data.

#### Modify: `components/license-table.tsx`

Component signature changes from `licenses: License[]` → `initialLicenses: License[]`. Internal state holds the live list.

```tsx
export function LicenseTable({ initialLicenses }: { initialLicenses: License[] }) {
  const [licenses, setLicenses] = useState<License[]>(initialLicenses);
  const [intervalMs, setIntervalMs] = useState<number>(() => getPollingInterval());

  // Fetch helper — used by polling AND by mutation handlers (replacing router.refresh)
  const refetch = useCallback(async () => {
    try {
      const res = await fetch("/api/licenses", { cache: "no-store" });
      if (!res.ok) return;                       // silent failure
      const json = await res.json();
      setLicenses(json.licenses as License[]);
    } catch {
      // silent — don't toast every 3s on a flaky network
    }
  }, []);

  // Polling effect
  useEffect(() => {
    if (intervalMs <= 0) return;

    let timer: ReturnType<typeof setInterval> | null = null;
    const start = () => {
      if (timer !== null) return;
      timer = setInterval(refetch, intervalMs);
    };
    const stop = () => {
      if (timer !== null) { clearInterval(timer); timer = null; }
    };
    const onVisibility = () => {
      if (document.hidden) stop(); else start();
    };

    if (!document.hidden) start();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [intervalMs, refetch]);

  // React to settings changes from /settings (or another tab)
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === POLLING_KEY) setIntervalMs(getPollingInterval());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  // ... existing render, replacing router.refresh() with refetch() in patchLicense/deleteLicense
}
```

Replace the two `router.refresh()` calls inside `patchLicense` and `deleteLicense` with `await refetch()`. The `useRouter` import can be dropped.

#### Same-tab settings updates

`storage` events do **not** fire in the tab that wrote the value. The /settings page lives in a different route, so when navigating back to `/licenses` the table re-mounts and reads the latest interval. This is sufficient — no additional cross-component event channel needed.

#### New page: `app/settings/page.tsx`

Client component:

```tsx
"use client";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { SiteNav } from "@/components/site-nav";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { POLLING_OPTIONS, getPollingInterval, setPollingInterval } from "@/lib/settings";

export default function SettingsPage() {
  const [interval, setIntervalState] = useState<number>(3000);

  useEffect(() => { setIntervalState(getPollingInterval()); }, []);

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

        <div className="max-w-md space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">License table auto-refresh</label>
            <Select value={String(interval)} onValueChange={onChange}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {POLLING_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={String(o.value)}>{o.label}</SelectItem>
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

#### Modify: `components/site-nav.tsx`

Add a Settings link next to the existing logo title:

```tsx
<nav className="ml-auto flex items-center gap-4 text-sm">
  <Link href="/licenses" className="text-muted-foreground hover:text-foreground">Licenses</Link>
  <Link href="/settings" className="text-muted-foreground hover:text-foreground">Settings</Link>
</nav>
```

Apply `aria-current` highlighting based on `usePathname()`.

## Data flow (table polling)

```
Page load (SSR) → fetchLicenses → initialLicenses prop
                                       │
                                       ▼
                          <LicenseTable initialLicenses>
                                       │
                       useState<License[]>(initialLicenses)
                                       │
        ┌──────────────────────────────┴──────────────────────────────┐
        ▼                                                              ▼
useEffect (polling)                                          useEffect (storage)
  if intervalMs > 0:                                            on storage event
    setInterval(refetch, intervalMs)                              if key matches:
  pause when document.hidden                                        setIntervalMs(...)
  resume when visible
        │
        ▼
GET /api/licenses → setLicenses(data)   (silent — no spinner, no toast on failure)

Mutations (PATCH/DELETE) → await refetch()  (replaces router.refresh)
```

## Edge cases

| Case | Behavior |
|---|---|
| Polling = Off | `useEffect` returns early, no interval, no requests |
| Tab hidden | `clearInterval`; resumes on `visibilitychange` |
| Network error during poll | Silent; keeps last-known state, retries next tick |
| Settings change in this tab | Page reload on `/licenses` re-reads interval (different routes) |
| Settings change in another tab | `storage` event triggers `setIntervalMs` → effect re-runs |
| Mutation while poll in flight | Both write to `setLicenses`; last write wins. Acceptable — both are full snapshots from the same endpoint |
| First paint | SSR data, no flash; polling kicks in after mount |
| Stale EA cache showing "Inactive" | Self-corrects within 12h (revalidate cycle) |

## Files touched

| File | Change |
|---|---|
| `JSONFX-IMPULSE/Include/CopyTraderX-Impulse/Dashboard.mqh` | `"Lifetime"` → `"Inactive"` |
| `JSONFX-IMPULSE/Include/CopyTraderX-Impulse/LicenseManager.mqh` | Log strings + comments: lifetime → inactive |
| `copytraderx-license/lib/settings.ts` | **new** — localStorage helpers |
| `copytraderx-license/app/licenses/page.tsx` | Rename prop to `initialLicenses` |
| `copytraderx-license/components/license-table.tsx` | Polling + visibility + storage listeners; remove `useRouter` |
| `copytraderx-license/app/settings/page.tsx` | **new** — settings page |
| `copytraderx-license/components/site-nav.tsx` | Add Settings nav link |

## Out of scope / explicitly not doing

- **No `app_settings` DB table.** localStorage is sufficient for a single admin's preference.
- **No realtime/SSE.** Polling 3s is fine for this volume of data.
- **No "live indicator" UI.** Silent refresh. The user knows the table is fresh because rows update.
- **No EA-side cache invalidation for `expires_at == 0`.** Self-correction within 12h is acceptable per the chosen approach.
- **No backwards-compat shim** for any existing localStorage key (none used previously).

## Testing

- **EA**: visual backtest + journal log review (per project convention — no unit tests). Confirm "Inactive" renders when `expires_at == 0`.
- **Admin app**:
  - Manual: open `/licenses`, confirm table refreshes every 3s by tailing network panel.
  - Manual: change `/settings` to "Off"; confirm no `/api/licenses` requests after navigating back.
  - Manual: hide tab (switch to another), confirm requests pause; refocus, confirm they resume.
  - Existing Jest tests in `lib/` keep passing; add a small unit test for `getPollingInterval` clamp behavior in `lib/settings.test.ts`.
