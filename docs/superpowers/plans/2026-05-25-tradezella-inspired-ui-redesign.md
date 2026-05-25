# Tradezella-Inspired UI Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **REQUIRED IMPLEMENTATION SKILL:** Use `/frontend-design` for all UI component tasks. This ensures production-grade design quality rather than generic outputs.

**Goal:** Replace the user-facing header nav + subscription card grid with a Tradezella-inspired sidebar shell, account switcher, adaptive dashboard, prop firm management view, and relocated subscription management.

**Architecture:** New sidebar layout wraps all `/dashboard` routes. Journal tabs become individual routes under `/dashboard/[id]/`. Polling logic is extracted into a shared context provider at the `[id]` layout level so all sub-pages (dashboard, journal, calendar, performance, objectives) share live data. A new prop firm management page aggregates data across all prop firm accounts.

**Tech Stack:** Next.js 16, React 19, Tailwind 4, shadcn/ui (with Sheet for mobile drawer), Recharts, Supabase, @phosphor-icons/react, date-fns.

**Spec:** `docs/superpowers/specs/2026-05-25-tradezella-inspired-ui-redesign-design.md`

---

## File Structure

### New Files

```
components/sidebar/
  app-sidebar.tsx           — Main sidebar: logo, account switcher, nav sections, footer
  account-switcher.tsx      — Dropdown with grouped subscriptions, search, slot selection
  sidebar-nav-item.tsx      — Single nav link: icon, label, active state, disabled state
  mobile-top-bar.tsx        — Mobile-only top bar: hamburger, logo, account chip

components/dashboard/
  challenge-progress-hero.tsx — Prop firm challenge hero card with progress bars
  recent-trades-list.tsx    — Compact recent trades list for dashboard (reuses deal data)
  weekly-calendar-mini.tsx  — 5-day P&L heatmap strip
  date-range-selector.tsx   — Dropdown: Today, 7d, 30d, This month, All time
  dashboard-kpi-grid.tsx    — Layout A: 4 KPI cards + equity chart + bottom row
  dashboard-objective.tsx   — Layout B: challenge hero + stacked KPIs + equity chart

components/prop-firms/
  prop-firm-table.tsx       — Sortable cross-account table
  prop-firm-summary-strip.tsx — 4 aggregate KPI cards

components/settings/
  subscription-management-table.tsx — Subscription CRUD table
  settings-tabs.tsx         — Tab nav for Preferences / Subscriptions

lib/
  sidebar-data.ts           — Server query: grouped subscriptions for sidebar
  prop-firm-data.ts         — Server query: cross-account prop firm aggregation

app/dashboard/
  layout.tsx                — MODIFY: replace DashboardNav with AppSidebar
  page.tsx                  — MODIFY: redirect to last-used account or show empty state
  prop-firms/page.tsx       — NEW: prop firm management page
  settings/
    layout.tsx              — NEW: settings tabs layout
    page.tsx                — MODIFY: preferences content (remove DashboardNav)
    subscriptions/page.tsx  — NEW: subscription management

app/dashboard/[id]/
  layout.tsx                — NEW: account-scoped layout with polling context
  page.tsx                  — NEW: adaptive dashboard
  journal/page.tsx          — NEW: merged trades + positions + orders
  calendar/page.tsx         — NEW: calendar view (wraps CalendarTab)
  performance/page.tsx      — NEW: performance view (wraps PerformanceTab)
  objectives/page.tsx       — NEW: objectives view (wraps ObjectivesTab)

lib/hooks/
  use-account-context.tsx   — NEW: React context for active account + polled journal data
```

### Deleted Files (Phase 7 cleanup)

```
components/user/dashboard-card-grid.tsx
components/user/subscription-card.tsx
components/user/subscription-card-slots.tsx
components/user/dashboard-filter-toolbar.tsx
components/user/dashboard-filter-product-chip.tsx
components/user/dashboard-filter-status-chip.tsx
components/user/dashboard-filter-slots-chip.tsx
components/user/dashboard-filter-sort-chip.tsx
components/user/dashboard-pagination.tsx
components/user/dashboard-nav.tsx
app/dashboard/licenses/[id]/page.tsx       (replaced by /dashboard/[id]/)
app/dashboard/licenses/[id]/loading.tsx    (replaced by /dashboard/[id]/ loading)
```

---

## Phase 1: App Shell Foundation

### Task 1: Add shadcn Sheet component

**Files:**
- Create: `components/ui/sheet.tsx`

The mobile drawer needs shadcn's Sheet component. This project doesn't have it yet.

- [ ] **Step 1: Install Sheet component**

```bash
npx shadcn@latest add sheet
```

- [ ] **Step 2: Verify the component was added**

```bash
ls components/ui/sheet.tsx
```

Expected: file exists.

- [ ] **Step 3: Commit**

```bash
git add components/ui/sheet.tsx
git commit -m "chore: add shadcn Sheet component for mobile sidebar drawer"
```

---

### Task 2: Create SidebarNavItem component

**Files:**
- Create: `components/sidebar/sidebar-nav-item.tsx`

A single nav link used by AppSidebar. Renders an icon + label with active state (green left border + tinted background). Supports a `disabled` prop for account-dependent items when no account is selected.

- [ ] **Step 1: Create the component**

```tsx
// components/sidebar/sidebar-nav-item.tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import type { Icon } from "@phosphor-icons/react";

interface Props {
  href: string;
  label: string;
  icon: Icon;
  disabled?: boolean;
  /** Match exact path only (default false = prefix match). */
  exact?: boolean;
}

export function SidebarNavItem({ href, label, icon: IconCmp, disabled, exact }: Props) {
  const pathname = usePathname();
  const isActive = exact ? pathname === href : pathname.startsWith(href);

  if (disabled) {
    return (
      <span className="flex items-center gap-3 rounded-md px-3 py-2 text-sm text-slate-600 cursor-not-allowed opacity-40">
        <IconCmp className="h-[18px] w-[18px]" />
        <span className="truncate">{label}</span>
      </span>
    );
  }

  return (
    <Link
      href={href}
      className={cn(
        "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
        isActive
          ? "border-l-[3px] border-[#2DAA47] bg-[rgba(45,170,71,0.12)] pl-[9px] font-medium text-white"
          : "text-slate-400 hover:bg-white/5 hover:text-slate-200",
      )}
    >
      <IconCmp className="h-[18px] w-[18px] shrink-0" weight={isActive ? "fill" : "regular"} />
      <span className="truncate">{label}</span>
    </Link>
  );
}
```

- [ ] **Step 2: Verify it compiles**

```bash
npx tsc --noEmit --pretty 2>&1 | head -20
```

Expected: no errors related to this file.

- [ ] **Step 3: Commit**

```bash
git add components/sidebar/sidebar-nav-item.tsx
git commit -m "feat(sidebar): add SidebarNavItem component"
```

---

### Task 3: Create sidebar data query

**Files:**
- Create: `lib/sidebar-data.ts`

Server-side function that fetches the current user's subscriptions grouped for the sidebar account switcher. Returns subscriptions with their nested live/demo licenses, sorted by status.

- [ ] **Step 1: Create the query module**

```typescript
// lib/sidebar-data.ts
import { getSupabaseAdmin } from "@/lib/supabase/server";
import type { DashboardSubscription } from "./types";

const STATUS_ORDER: Record<string, number> = {
  active: 0, pending: 1, expired: 2, revoked: 3, rejected: 4,
};

export interface SidebarAccount {
  licenseId: number;
  mt5Account: number;
  slotType: "live" | "demo";
  status: string;
  product: string;
}

export interface SidebarSubscriptionGroup {
  subscriptionId: number;
  product: string;
  productDisplayName: string;
  ruleName: string | null;
  status: string;
  liveSlot: SidebarAccount | null;
  demoSlot: SidebarAccount | null;
}

export interface SidebarData {
  active: SidebarSubscriptionGroup[];
  past: SidebarSubscriptionGroup[];
}

export async function getSidebarData(userId: string): Promise<SidebarData> {
  const sb = getSupabaseAdmin();

  const { data: subs, error: subsErr } = await sb
    .from("subscriptions")
    .select("*, propfirm_rules(name)")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (subsErr) throw new Error(`sidebar_subs_fetch: ${subsErr.message}`);
  if (!subs || subs.length === 0) return { active: [], past: [] };

  const subIds = subs.map((s: { id: number }) => s.id);
  const { data: lics, error: licErr } = await sb
    .from("licenses")
    .select("id, mt5_account, intended_account_type, subscription_id, status, product")
    .in("subscription_id", subIds);

  if (licErr) throw new Error(`sidebar_lics_fetch: ${licErr.message}`);

  const licBySub = new Map<number, { live: SidebarAccount | null; demo: SidebarAccount | null }>();
  for (const sub of subs) licBySub.set(sub.id, { live: null, demo: null });
  for (const lic of lics ?? []) {
    const slot = licBySub.get(lic.subscription_id);
    if (!slot) continue;
    const acct: SidebarAccount = {
      licenseId: lic.id,
      mt5Account: lic.mt5_account,
      slotType: lic.intended_account_type === "demo" ? "demo" : "live",
      status: lic.status,
      product: lic.product,
    };
    if (lic.intended_account_type === "demo") slot.demo = acct;
    else slot.live = acct;
  }

  const { productDisplayName } = await import("./products");

  const groups: SidebarSubscriptionGroup[] = subs.map((sub: Record<string, unknown>) => ({
    subscriptionId: sub.id as number,
    product: sub.product as string,
    productDisplayName: productDisplayName(sub.product as import("./products").Product),
    ruleName: (sub.propfirm_rules as { name: string } | null)?.name ?? null,
    status: sub.status as string,
    liveSlot: licBySub.get(sub.id as number)?.live ?? null,
    demoSlot: licBySub.get(sub.id as number)?.demo ?? null,
  }));

  groups.sort((a, b) => (STATUS_ORDER[a.status] ?? 9) - (STATUS_ORDER[b.status] ?? 9));

  const active = groups.filter((g) => g.status === "active" || g.status === "pending");
  const past = groups.filter((g) => g.status !== "active" && g.status !== "pending");

  return { active, past };
}
```

- [ ] **Step 2: Verify it compiles**

```bash
npx tsc --noEmit --pretty 2>&1 | head -20
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add lib/sidebar-data.ts
git commit -m "feat(sidebar): add getSidebarData query for account switcher"
```

---

### Task 4: Create AccountSwitcher component

**Files:**
- Create: `components/sidebar/account-switcher.tsx`

Popover anchored to the sidebar account card. Groups accounts by subscription. Supports search (≥4 accounts), past subscriptions toggle, empty slot → claim dialog, and "Manage Subscriptions" footer link.

- [ ] **Step 1: Create the component**

Create `components/sidebar/account-switcher.tsx`. This is a client component:

```tsx
// components/sidebar/account-switcher.tsx
"use client";

import { useState, useMemo } from "react";
import { useRouter, usePathname } from "next/navigation";
import { CaretUpDown, MagnifyingGlass, Check } from "@phosphor-icons/react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import Link from "next/link";
import type { SidebarData, SidebarSubscriptionGroup, SidebarAccount } from "@/lib/sidebar-data";

interface Props {
  data: SidebarData;
  activeLicenseId: number | null;
}

export function AccountSwitcher({ data, activeLicenseId }: Props) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [showPast, setShowPast] = useState(false);
  const router = useRouter();

  const totalAccounts = useMemo(() => {
    let count = 0;
    for (const g of [...data.active, ...data.past]) {
      if (g.liveSlot) count++;
      if (g.demoSlot) count++;
    }
    return count;
  }, [data]);

  const activeAccount = useMemo(() => {
    if (!activeLicenseId) return null;
    for (const g of [...data.active, ...data.past]) {
      if (g.liveSlot?.licenseId === activeLicenseId) return { group: g, slot: g.liveSlot };
      if (g.demoSlot?.licenseId === activeLicenseId) return { group: g, slot: g.demoSlot };
    }
    return null;
  }, [data, activeLicenseId]);

  function matchesSearch(group: SidebarSubscriptionGroup): boolean {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      group.productDisplayName.toLowerCase().includes(q) ||
      (group.ruleName?.toLowerCase().includes(q) ?? false) ||
      (group.liveSlot?.mt5Account.toString().includes(q) ?? false) ||
      (group.demoSlot?.mt5Account.toString().includes(q) ?? false)
    );
  }

  function handleSelect(acct: SidebarAccount) {
    setOpen(false);
    localStorage.setItem("ctx.activeAccountId", String(acct.licenseId));
    router.push(`/dashboard/${acct.licenseId}`);
  }

  const filteredActive = data.active.filter(matchesSearch);
  const filteredPast = data.past.filter(matchesSearch);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button className="mx-3 mb-2 w-[calc(100%-1.5rem)] rounded-lg border border-white/[0.08] bg-white/[0.04] p-2.5 text-left transition-colors hover:bg-white/[0.08]">
          {activeAccount ? (
            <>
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                  Active Account
                </span>
                <CaretUpDown className="h-3.5 w-3.5 text-slate-500" />
              </div>
              <div className="mt-1 text-xs font-medium text-white truncate">
                {activeAccount.group.ruleName ?? activeAccount.group.productDisplayName}
              </div>
              <div className="text-[10px] text-slate-500">
                MT5 #{activeAccount.slot.mt5Account} · {activeAccount.slot.slotType === "live" ? "Live" : "Demo"}
              </div>
            </>
          ) : (
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-400">Select an account</span>
              <CaretUpDown className="h-3.5 w-3.5 text-slate-500" />
            </div>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent
        side="right"
        align="start"
        sideOffset={8}
        className="w-72 border-slate-700 bg-[#111827] p-0 text-white shadow-xl"
      >
        {/* Search (only if 4+ accounts) */}
        {totalAccounts >= 4 && (
          <div className="border-b border-white/[0.06] p-2">
            <div className="flex items-center gap-2 rounded-md bg-white/[0.04] px-2.5 py-1.5">
              <MagnifyingGlass className="h-3.5 w-3.5 text-slate-500" />
              <input
                className="flex-1 bg-transparent text-xs text-white placeholder:text-slate-500 outline-none"
                placeholder="Search accounts..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>
        )}

        <div className="max-h-80 overflow-y-auto p-2 space-y-1">
          {/* Active subscriptions */}
          {filteredActive.map((group) => (
            <SubscriptionGroup
              key={group.subscriptionId}
              group={group}
              activeLicenseId={activeLicenseId}
              onSelect={handleSelect}
            />
          ))}

          {/* Past subscriptions */}
          {filteredPast.length > 0 && (
            <>
              <div className="border-t border-white/[0.06] my-1" />
              <button
                onClick={() => setShowPast(!showPast)}
                className="flex w-full items-center justify-between px-2 py-1.5 text-[10px] text-slate-500 hover:text-slate-400"
              >
                <span>Past subscriptions ({filteredPast.length})</span>
                <span>{showPast ? "▲" : "▼"}</span>
              </button>
              {showPast && filteredPast.map((group) => (
                <SubscriptionGroup
                  key={group.subscriptionId}
                  group={group}
                  activeLicenseId={activeLicenseId}
                  onSelect={handleSelect}
                  dimmed
                />
              ))}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-white/[0.06] p-2">
          <Link
            href="/dashboard/settings/subscriptions"
            onClick={() => setOpen(false)}
            className="block text-center text-xs font-medium text-[#2DAA47] hover:text-emerald-400"
          >
            Manage Subscriptions
          </Link>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function SubscriptionGroup({
  group, activeLicenseId, onSelect, dimmed,
}: {
  group: SidebarSubscriptionGroup;
  activeLicenseId: number | null;
  onSelect: (acct: SidebarAccount) => void;
  dimmed?: boolean;
}) {
  const label = group.ruleName
    ? `${group.productDisplayName} · ${group.ruleName}`
    : group.productDisplayName;

  return (
    <div className={dimmed ? "opacity-50" : undefined}>
      <div className="px-2 pt-2 pb-0.5 text-[9px] font-semibold uppercase tracking-[0.5px] text-slate-500 truncate">
        {label}
      </div>
      {group.liveSlot && (
        <SlotRow
          slot={group.liveSlot}
          isActive={group.liveSlot.licenseId === activeLicenseId}
          onSelect={onSelect}
        />
      )}
      {group.demoSlot && (
        <SlotRow
          slot={group.demoSlot}
          isActive={group.demoSlot.licenseId === activeLicenseId}
          onSelect={onSelect}
        />
      )}
      {!group.liveSlot && !group.demoSlot && (
        <div className="px-2 py-1.5 text-[11px] italic text-slate-600">No slots claimed</div>
      )}
    </div>
  );
}

function SlotRow({
  slot, isActive, onSelect,
}: {
  slot: SidebarAccount;
  isActive: boolean;
  onSelect: (acct: SidebarAccount) => void;
}) {
  return (
    <button
      onClick={() => onSelect(slot)}
      className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[11px] transition-colors ${
        isActive
          ? "border-l-[3px] border-[#2DAA47] bg-[rgba(45,170,71,0.08)] pl-[5px]"
          : "hover:bg-white/[0.04]"
      }`}
    >
      <span
        className={`h-[6px] w-[6px] rounded-full shrink-0 ${
          slot.mt5Account ? "bg-[#2DAA47]" : "border border-dashed border-slate-500"
        }`}
      />
      <span className={isActive ? "text-white font-medium" : "text-slate-300"}>
        {slot.slotType === "live" ? "Live" : "Demo"} · MT5 #{slot.mt5Account}
      </span>
      {isActive && <Check className="ml-auto h-3.5 w-3.5 text-slate-500 shrink-0" />}
    </button>
  );
}
```

- [ ] **Step 2: Verify it compiles**

```bash
npx tsc --noEmit --pretty 2>&1 | head -20
```

- [ ] **Step 3: Commit**

```bash
git add components/sidebar/account-switcher.tsx
git commit -m "feat(sidebar): add AccountSwitcher popover component"
```

---

### Task 5: Create AppSidebar component

**Files:**
- Create: `components/sidebar/app-sidebar.tsx`

The main sidebar shell. Server component wrapper that passes data to client sub-components. Logo block, account switcher, two nav sections (Main + Account), footer with user email, theme toggle, logout.

- [ ] **Step 1: Create the component**

```tsx
// components/sidebar/app-sidebar.tsx
"use client";

import { usePathname } from "next/navigation";
import {
  ChartLineUp, Notebook, CalendarBlank, TrendUp, Target,
  Buildings, Scales, GearSix, SignOut,
} from "@phosphor-icons/react";
import { ThemeToggle } from "@/components/theme-toggle";
import { AccountSwitcher } from "./account-switcher";
import { SidebarNavItem } from "./sidebar-nav-item";
import type { SidebarData } from "@/lib/sidebar-data";

interface Props {
  sidebarData: SidebarData;
  activeLicenseId: number | null;
  userEmail: string;
}

export function AppSidebar({ sidebarData, activeLicenseId, userEmail }: Props) {
  const hasAccount = activeLicenseId !== null;
  const accountPrefix = hasAccount ? `/dashboard/${activeLicenseId}` : "#";

  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-[220px] flex-col border-r border-white/[0.06] bg-[#111827] lg:flex">
      {/* Logo */}
      <div className="flex items-center gap-2.5 border-b border-white/[0.06] px-4 py-4">
        <div className="flex h-8 w-8 items-center justify-content-center rounded-lg bg-gradient-to-br from-[#2DAA47] to-[#1B8A37] text-center text-xs font-extrabold text-white leading-8">
          CT
        </div>
        <div>
          <div className="text-[13px] font-semibold text-white">CopyTraderX</div>
          <div className="text-[10px] text-slate-500">License Manager</div>
        </div>
      </div>

      {/* Account Switcher */}
      <div className="pt-3">
        <AccountSwitcher data={sidebarData} activeLicenseId={activeLicenseId} />
      </div>

      {/* Nav: Main */}
      <nav className="flex-1 overflow-y-auto px-3 pt-2">
        <div className="mb-1 px-3 pt-3 text-[9px] font-semibold uppercase tracking-[1px] text-slate-500">
          Main
        </div>
        <SidebarNavItem href={`${accountPrefix}`} label="Dashboard" icon={ChartLineUp} disabled={!hasAccount} exact />
        <SidebarNavItem href={`${accountPrefix}/journal`} label="Journal" icon={Notebook} disabled={!hasAccount} />
        <SidebarNavItem href={`${accountPrefix}/calendar`} label="Calendar" icon={CalendarBlank} disabled={!hasAccount} />
        <SidebarNavItem href={`${accountPrefix}/performance`} label="Performance" icon={TrendUp} disabled={!hasAccount} />

        <div className="mb-1 mt-4 px-3 pt-3 text-[9px] font-semibold uppercase tracking-[1px] text-slate-500">
          Account
        </div>
        <SidebarNavItem href={`${accountPrefix}/objectives`} label="Objectives" icon={Target} disabled={!hasAccount} />
        <SidebarNavItem href="/dashboard/prop-firms" label="Prop Firms" icon={Buildings} />
        <SidebarNavItem href="/dashboard/propfirm-rules" label="Propfirm Rules" icon={Scales} />
        <SidebarNavItem href="/dashboard/settings" label="Settings" icon={GearSix} />
      </nav>

      {/* Footer */}
      <div className="border-t border-white/[0.06] px-4 py-3">
        <div className="mb-2 truncate text-[11px] text-slate-400" title={userEmail}>
          {userEmail}
        </div>
        <div className="flex items-center justify-between">
          <ThemeToggle />
          <form action="/auth/logout" method="POST">
            <button
              type="submit"
              className="flex items-center gap-1.5 text-[11px] text-slate-500 hover:text-slate-300 transition-colors"
            >
              <SignOut className="h-3.5 w-3.5" />
              Logout
            </button>
          </form>
        </div>
      </div>
    </aside>
  );
}
```

- [ ] **Step 2: Verify it compiles**

```bash
npx tsc --noEmit --pretty 2>&1 | head -20
```

- [ ] **Step 3: Commit**

```bash
git add components/sidebar/app-sidebar.tsx
git commit -m "feat(sidebar): add AppSidebar shell with nav sections and footer"
```

---

### Task 6: Create MobileTopBar component

**Files:**
- Create: `components/sidebar/mobile-top-bar.tsx`

Thin top bar for <768px screens. Hamburger (left), logo (center), account MT5 chip (right). Hamburger opens a Sheet with the full sidebar.

- [ ] **Step 1: Create the component**

```tsx
// components/sidebar/mobile-top-bar.tsx
"use client";

import { useState } from "react";
import { List } from "@phosphor-icons/react";
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from "@/components/ui/sheet";
import { AppSidebar } from "./app-sidebar";
import type { SidebarData } from "@/lib/sidebar-data";

interface Props {
  sidebarData: SidebarData;
  activeLicenseId: number | null;
  userEmail: string;
}

export function MobileTopBar({ sidebarData, activeLicenseId, userEmail }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <div className="fixed inset-x-0 top-0 z-40 flex h-12 items-center justify-between border-b border-white/[0.06] bg-[#111827] px-3 lg:hidden">
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>
          <button className="rounded-md p-1.5 text-slate-400 hover:bg-white/[0.06] hover:text-white">
            <List className="h-5 w-5" />
          </button>
        </SheetTrigger>
        <SheetContent side="left" className="w-[220px] border-r border-white/[0.06] bg-[#111827] p-0">
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <div onClick={() => setOpen(false)}>
            <AppSidebar sidebarData={sidebarData} activeLicenseId={activeLicenseId} userEmail={userEmail} />
          </div>
        </SheetContent>
      </Sheet>

      <div className="text-sm font-semibold text-white">
        <span className="text-[#2DAA47]">CTX</span> CopyTraderX
      </div>

      <div className="text-[10px] text-slate-400">
        {activeLicenseId ? `#${activeLicenseId}` : "—"}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify it compiles**

```bash
npx tsc --noEmit --pretty 2>&1 | head -20
```

- [ ] **Step 3: Commit**

```bash
git add components/sidebar/mobile-top-bar.tsx
git commit -m "feat(sidebar): add MobileTopBar with Sheet drawer"
```

---

### Task 7: Rewire dashboard layout with sidebar

**Files:**
- Modify: `app/dashboard/layout.tsx`
- Modify: `app/dashboard/page.tsx`

Replace `DashboardNav` with the new sidebar layout. The layout fetches sidebar data server-side, reads `activeLicenseId` from a cookie (since localStorage isn't available server-side — we'll use a cookie synced from localStorage). The landing page redirects to the last-used account or shows an empty state.

- [ ] **Step 1: Update the dashboard layout**

Replace `app/dashboard/layout.tsx` with:

```tsx
// app/dashboard/layout.tsx
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { getSupabaseSSR } from "@/lib/supabase/ssr";
import { getSidebarData } from "@/lib/sidebar-data";
import { AppSidebar } from "@/components/sidebar/app-sidebar";
import { MobileTopBar } from "@/components/sidebar/mobile-top-bar";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const sb = await getSupabaseSSR();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect("/login");

  const sidebarData = await getSidebarData(user.id);

  const cookieStore = await cookies();
  const activeIdRaw = cookieStore.get("ctx.activeAccountId")?.value;
  const activeLicenseId = activeIdRaw ? Number(activeIdRaw) : null;

  return (
    <div className="min-h-screen bg-background">
      <AppSidebar
        sidebarData={sidebarData}
        activeLicenseId={activeLicenseId}
        userEmail={user.email ?? ""}
      />
      <MobileTopBar
        sidebarData={sidebarData}
        activeLicenseId={activeLicenseId}
        userEmail={user.email ?? ""}
      />
      <main className="lg:pl-[220px] pt-12 lg:pt-0">
        <div className="mx-auto max-w-6xl p-4 md:p-6">{children}</div>
      </main>
    </div>
  );
}
```

- [ ] **Step 2: Add cookie sync to AccountSwitcher**

In `components/sidebar/account-switcher.tsx`, update the `handleSelect` function to also set a cookie so the server can read the active account:

```typescript
function handleSelect(acct: SidebarAccount) {
  setOpen(false);
  const id = String(acct.licenseId);
  localStorage.setItem("ctx.activeAccountId", id);
  document.cookie = `ctx.activeAccountId=${id};path=/;max-age=${60 * 60 * 24 * 365};SameSite=Lax`;
  router.push(`/dashboard/${acct.licenseId}`);
}
```

- [ ] **Step 3: Update the landing page**

Replace `app/dashboard/page.tsx` with:

```tsx
// app/dashboard/page.tsx
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { getSupabaseSSR } from "@/lib/supabase/ssr";
import { getSidebarData } from "@/lib/sidebar-data";

export default async function DashboardPage() {
  const sb = await getSupabaseSSR();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect("/login");

  const cookieStore = await cookies();
  const activeIdRaw = cookieStore.get("ctx.activeAccountId")?.value;

  if (activeIdRaw) {
    redirect(`/dashboard/${activeIdRaw}`);
  }

  // No active account — check if user has any accounts to suggest
  const sidebar = await getSidebarData(user.id);
  const firstAccount = sidebar.active[0]?.liveSlot ?? sidebar.active[0]?.demoSlot;
  if (firstAccount) {
    redirect(`/dashboard/${firstAccount.licenseId}`);
  }

  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="text-center">
        <h2 className="text-lg font-semibold">Select an account to get started</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Use the account switcher in the sidebar to choose an account, or request a new license from your admin.
        </p>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run the dev server and verify the sidebar renders**

```bash
npm run dev
```

Open `http://localhost:3000/dashboard` in the browser. Verify:
- Sidebar renders on the left with logo, account switcher, nav items
- Mobile top bar appears at <768px (resize browser)
- Content area takes remaining space
- If no active account, the "select an account" prompt shows

- [ ] **Step 5: Commit**

```bash
git add app/dashboard/layout.tsx app/dashboard/page.tsx components/sidebar/account-switcher.tsx
git commit -m "feat(shell): rewire dashboard layout with sidebar + mobile top bar"
```

---

## Phase 2: Account-Scoped Routes + Data Provider

### Task 8: Create account data context provider

**Files:**
- Create: `lib/hooks/use-account-context.tsx`

Extract the polling logic from `journal-shell.tsx` into a reusable context provider. This wraps all `/dashboard/[id]/*` routes so dashboard, journal, calendar, performance, and objectives all share the same live-polled data.

- [ ] **Step 1: Create the context**

```tsx
// lib/hooks/use-account-context.tsx
"use client";

import { createContext, useContext, type ReactNode } from "react";
import { useJournalPoll } from "@/lib/hooks/use-journal-poll";
import { fetchJson } from "@/lib/utils";
import type {
  AccountSnapshotCurrent, AccountSnapshotDaily,
  Deal, License, OrderRow, Position, PropfirmRule,
} from "@/lib/types";
import type { BaselineResult } from "@/lib/journal/baseline";
import type { PnlDisplay } from "@/lib/preferences/server";
import { JournalChromeProvider, useRangeScope } from "@/components/journal/preferences/journal-chrome-context";

interface AccountContextValue {
  license: License;
  snapshot: AccountSnapshotCurrent | null;
  positions: Position[];
  deals: Deal[];
  orders: OrderRow[];
  daily: AccountSnapshotDaily[];
  rule: PropfirmRule | null;
  ownerRules: PropfirmRule[];
  baseline: BaselineResult;
  currency: string;
  subscriptionId: number;
  ownerUserId: string;
}

const AccountContext = createContext<AccountContextValue | null>(null);

export function useAccountContext(): AccountContextValue {
  const ctx = useContext(AccountContext);
  if (!ctx) throw new Error("useAccountContext must be used inside AccountProvider");
  return ctx;
}

interface ProviderProps {
  license: License;
  initialSnapshot: AccountSnapshotCurrent | null;
  initialDaily: AccountSnapshotDaily[];
  initialPositions: Position[];
  initialDeals: Deal[];
  initialOrders: OrderRow[];
  rule: PropfirmRule | null;
  pushIntervalSeconds: number;
  baseline: BaselineResult;
  initialPnlDisplay: PnlDisplay;
  ownerRules: PropfirmRule[];
  subscriptionId: number;
  ownerUserId: string;
  children: ReactNode;
}

export function AccountProvider(props: ProviderProps) {
  return (
    <JournalChromeProvider
      licenseId={props.license.id}
      initialPnlDisplay={props.baseline.source === null ? "dollar" : props.initialPnlDisplay}
      initialRangeDays={30}
    >
      <InnerProvider {...props} />
    </JournalChromeProvider>
  );
}

function InnerProvider({ children, ...props }: ProviderProps) {
  const pushIntervalMs = props.pushIntervalSeconds * 1000;
  const acct = props.license.mt5_account;
  const { range } = useRangeScope();
  const days = range === 0 ? 0 : range;

  const snapshot = useJournalPoll<AccountSnapshotCurrent | null>({
    fetcher: () => fetchJson(`/api/journal/${acct}/snapshot`),
    initialData: props.initialSnapshot, pushIntervalMs,
  });
  const positions = useJournalPoll<Position[]>({
    fetcher: () => fetchJson(`/api/journal/${acct}/positions`),
    initialData: props.initialPositions, pushIntervalMs,
  });
  const deals = useJournalPoll<Deal[]>({
    fetcher: () => fetchJson(`/api/journal/${acct}/deals?days=${days}`),
    initialData: props.initialDeals, pushIntervalMs, fixedIntervalMs: 30_000,
    deps: [days],
  });
  const orders = useJournalPoll<OrderRow[]>({
    fetcher: () => fetchJson(`/api/journal/${acct}/orders?days=${days}`),
    initialData: props.initialOrders, pushIntervalMs, fixedIntervalMs: 30_000,
    deps: [days],
  });
  const daily = useJournalPoll<AccountSnapshotDaily[]>({
    fetcher: () => fetchJson(`/api/journal/${acct}/snapshots-daily?days=0`),
    initialData: props.initialDaily, pushIntervalMs, fixedIntervalMs: 5 * 60_000,
  });

  const value: AccountContextValue = {
    license: props.license,
    snapshot: snapshot.data,
    positions: positions.data,
    deals: deals.data,
    orders: orders.data,
    daily: daily.data,
    rule: props.rule,
    ownerRules: props.ownerRules,
    baseline: props.baseline,
    currency: snapshot.data?.currency ?? "USD",
    subscriptionId: props.subscriptionId,
    ownerUserId: props.ownerUserId,
  };

  return <AccountContext value={value}>{children}</AccountContext>;
}
```

- [ ] **Step 2: Verify it compiles**

```bash
npx tsc --noEmit --pretty 2>&1 | head -20
```

- [ ] **Step 3: Commit**

```bash
git add lib/hooks/use-account-context.tsx
git commit -m "feat(journal): extract polling logic into AccountProvider context"
```

---

### Task 9: Create account-scoped layout and dashboard route

**Files:**
- Create: `app/dashboard/[id]/layout.tsx`
- Create: `app/dashboard/[id]/page.tsx`

The `[id]` layout loads license data (same as current `licenses/[id]/page.tsx`) and wraps children in `AccountProvider`. The page is the adaptive dashboard.

- [ ] **Step 1: Create the layout**

```tsx
// app/dashboard/[id]/layout.tsx
import { notFound, redirect } from "next/navigation";
import { getSupabaseSSR } from "@/lib/supabase/ssr";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import {
  getAccountSnapshotCurrent, getAccountSnapshotsDaily,
  getDeals, getOpenPositions, getOrders, listPropfirmRules,
} from "@/lib/journal/queries";
import { resolveBaseline } from "@/lib/journal/baseline";
import { getPnlDisplay } from "@/lib/preferences/server";
import { AccountProvider } from "@/lib/hooks/use-account-context";
import type { License, PropfirmRule } from "@/lib/types";

export const dynamic = "force-dynamic";

interface LicenseWithSubscription extends License {
  subscriptions: { push_interval_seconds: number; propfirm_rule_id: number | null } | null;
}

async function loadLicense(id: number): Promise<LicenseWithSubscription | null> {
  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .from("licenses")
    .select("*, subscriptions(push_interval_seconds, propfirm_rule_id)")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return (data as LicenseWithSubscription | null) ?? null;
}

async function loadPropfirmRule(ruleId: number): Promise<PropfirmRule | null> {
  const sb = getSupabaseAdmin();
  const { data, error } = await sb.from("propfirm_rules").select("*").eq("id", ruleId).maybeSingle();
  if (error) return null;
  return (data as PropfirmRule | null) ?? null;
}

export default async function AccountLayout({
  params, children,
}: {
  params: Promise<{ id: string }>;
  children: React.ReactNode;
}) {
  const { id: idRaw } = await params;
  const id = Number(idRaw);
  if (!Number.isFinite(id) || id <= 0) notFound();

  const ssr = await getSupabaseSSR();
  const { data: { user } } = await ssr.auth.getUser();
  if (!user) redirect("/login");

  const license = await loadLicense(id);
  if (!license) notFound();

  const role = (user.app_metadata?.role as "admin" | "user" | undefined) ?? null;
  if (role !== "admin" && license.user_id !== user.id) notFound();

  const sub = license.subscriptions;
  const pushIntervalSeconds = sub?.push_interval_seconds ?? 10;
  const ruleId = sub?.propfirm_rule_id ?? null;

  const [snapshot, positions, deals, orders, daily, rule] = await Promise.all([
    getAccountSnapshotCurrent(license.mt5_account),
    getOpenPositions(license.mt5_account),
    getDeals(license.mt5_account),
    getOrders(license.mt5_account),
    getAccountSnapshotsDaily(license.mt5_account),
    ruleId ? loadPropfirmRule(ruleId) : Promise.resolve(null),
  ]);

  const baseline = resolveBaseline(rule, daily, snapshot);
  const pnlDisplay = await getPnlDisplay(user.id);

  const ownerRules = license.product === "ctx-prop-passer"
    ? await listPropfirmRules(license.user_id)
    : [];

  return (
    <AccountProvider
      license={license}
      initialSnapshot={snapshot}
      initialDaily={daily}
      initialPositions={positions}
      initialDeals={deals}
      initialOrders={orders}
      rule={rule}
      pushIntervalSeconds={pushIntervalSeconds}
      baseline={baseline}
      initialPnlDisplay={pnlDisplay}
      ownerRules={ownerRules}
      subscriptionId={license.subscription_id}
      ownerUserId={license.user_id}
    >
      {children}
    </AccountProvider>
  );
}
```

- [ ] **Step 2: Create the adaptive dashboard page**

```tsx
// app/dashboard/[id]/page.tsx
"use client";

import { useAccountContext } from "@/lib/hooks/use-account-context";
import { DashboardKpiGrid } from "@/components/dashboard/dashboard-kpi-grid";
import { DashboardObjective } from "@/components/dashboard/dashboard-objective";

export default function AccountDashboardPage() {
  const { rule } = useAccountContext();
  const hasPropfirmRule = rule !== null;

  return hasPropfirmRule ? <DashboardObjective /> : <DashboardKpiGrid />;
}
```

Note: `DashboardKpiGrid` and `DashboardObjective` will be created in Phase 3 (Tasks 12-14). For now, create placeholder components so the route compiles:

```tsx
// components/dashboard/dashboard-kpi-grid.tsx
"use client";
export function DashboardKpiGrid() {
  return <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">KPI Dashboard — coming in Phase 3</div>;
}

// components/dashboard/dashboard-objective.tsx
"use client";
export function DashboardObjective() {
  return <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">Objective Dashboard — coming in Phase 3</div>;
}
```

- [ ] **Step 3: Verify the route works**

```bash
npm run dev
```

Navigate to `/dashboard/[any-valid-license-id]`. Verify:
- Account layout loads, sidebar shows the account as active
- Placeholder dashboard content renders
- No console errors

- [ ] **Step 4: Commit**

```bash
git add app/dashboard/\[id\]/layout.tsx app/dashboard/\[id\]/page.tsx components/dashboard/dashboard-kpi-grid.tsx components/dashboard/dashboard-objective.tsx
git commit -m "feat(routes): add account-scoped layout with polling + adaptive dashboard stub"
```

---

### Task 10: Create sub-page routes (Journal, Calendar, Performance, Objectives)

**Files:**
- Create: `app/dashboard/[id]/journal/page.tsx`
- Create: `app/dashboard/[id]/calendar/page.tsx`
- Create: `app/dashboard/[id]/performance/page.tsx`
- Create: `app/dashboard/[id]/objectives/page.tsx`

Each route consumes data from `useAccountContext()` and renders the existing tab components. Journal merges Trades + Positions + Orders.

- [ ] **Step 1: Create the Journal page (merged)**

```tsx
// app/dashboard/[id]/journal/page.tsx
"use client";

import { useAccountContext } from "@/lib/hooks/use-account-context";
import { TradesTable } from "@/components/journal/tables/trades-table";
import { PositionsTable } from "@/components/journal/tables/positions-table";
import { OrdersTable } from "@/components/journal/tables/orders-table";
import { usePnlDisplay } from "@/components/journal/preferences/journal-chrome-context";
import { fmtPctOrCash } from "@/lib/journal/format-pnl";

export default function JournalPage() {
  const { deals, positions, orders, license, snapshot, baseline, currency } = useAccountContext();
  const { mode } = usePnlDisplay();

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Journal</h1>

      {/* Open Positions (if any) */}
      {positions.length > 0 && (
        <section>
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Open Positions · <span className="text-foreground">{positions.length}</span>
            </h2>
            <span className="text-[11px] text-muted-foreground">
              Floating {fmtPctOrCash(snapshot?.floating_pnl ?? 0, mode, baseline.baseline, currency)}
            </span>
          </div>
          <div className="rounded-xl border bg-card p-4">
            <PositionsTable positions={positions} currency={currency} baseline={baseline.baseline} />
          </div>
        </section>
      )}

      {/* Closed Trades */}
      <section>
        <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Closed Trades · <span className="text-foreground">{deals.length}</span>
        </h2>
        <TradesTable deals={deals} currency={currency} baseline={baseline.baseline} mt5Account={license.mt5_account} />
      </section>

      {/* Orders */}
      {orders.length > 0 && (
        <details className="group">
          <summary className="cursor-pointer text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Orders · <span className="text-foreground">{orders.length}</span>
            <span className="ml-1 text-xs group-open:hidden">▸</span>
            <span className="ml-1 text-xs hidden group-open:inline">▾</span>
          </summary>
          <div className="mt-2">
            <OrdersTable orders={orders} mt5Account={license.mt5_account} />
          </div>
        </details>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Create Calendar, Performance, Objectives pages**

```tsx
// app/dashboard/[id]/calendar/page.tsx
"use client";

import { useAccountContext } from "@/lib/hooks/use-account-context";
import { CalendarTab } from "@/components/journal/tabs/calendar-tab";

export default function CalendarPage() {
  const { deals, currency, baseline } = useAccountContext();
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Calendar</h1>
      <CalendarTab deals={deals} currency={currency} baseline={baseline.baseline} />
    </div>
  );
}
```

```tsx
// app/dashboard/[id]/performance/page.tsx
"use client";

import { useAccountContext } from "@/lib/hooks/use-account-context";
import { PerformanceTab } from "@/components/journal/tabs/performance-tab";

export default function PerformancePage() {
  const { deals, daily, currency, baseline } = useAccountContext();
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Performance</h1>
      <PerformanceTab deals={deals} daily={daily} currency={currency} baseline={baseline.baseline} />
    </div>
  );
}
```

```tsx
// app/dashboard/[id]/objectives/page.tsx
"use client";

import { useAccountContext } from "@/lib/hooks/use-account-context";
import { ObjectivesTab } from "@/components/journal/tabs/objectives-tab";

export default function ObjectivesPage() {
  const { license, rule, snapshot, daily, currency, baseline } = useAccountContext();
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Objectives</h1>
      <ObjectivesTab license={license} rule={rule} snapshot={snapshot} daily={daily} currency={currency} baseline={baseline.baseline} />
    </div>
  );
}
```

- [ ] **Step 3: Verify all routes work**

```bash
npm run dev
```

Test each route with a valid license ID:
- `/dashboard/[id]/journal` — shows trades table, positions (if any), orders
- `/dashboard/[id]/calendar` — shows calendar view
- `/dashboard/[id]/performance` — shows performance charts
- `/dashboard/[id]/objectives` — shows objectives

- [ ] **Step 4: Commit**

```bash
git add app/dashboard/\[id\]/journal/page.tsx app/dashboard/\[id\]/calendar/page.tsx app/dashboard/\[id\]/performance/page.tsx app/dashboard/\[id\]/objectives/page.tsx
git commit -m "feat(routes): add journal, calendar, performance, objectives sub-pages"
```

---

## Phase 3: Dashboard Components

### Task 11: Create shared dashboard widgets

**Files:**
- Create: `components/dashboard/date-range-selector.tsx`
- Create: `components/dashboard/recent-trades-list.tsx`
- Create: `components/dashboard/weekly-calendar-mini.tsx`

These are used by both dashboard layouts (KPI and Objective-First).

- [ ] **Step 1: Create DateRangeSelector**

```tsx
// components/dashboard/date-range-selector.tsx
"use client";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useRangeScope } from "@/components/journal/preferences/journal-chrome-context";

const RANGES = [
  { label: "Today", days: 1 },
  { label: "Last 7 days", days: 7 },
  { label: "Last 30 days", days: 30 },
  { label: "This month", days: -1 },
  { label: "All time", days: 0 },
] as const;

export function DateRangeSelector() {
  const { range, setRange } = useRangeScope();

  return (
    <Select value={String(range)} onValueChange={(v) => setRange(Number(v))}>
      <SelectTrigger className="h-8 w-[140px] text-xs">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {RANGES.map((r) => (
          <SelectItem key={r.days} value={String(r.days)} className="text-xs">
            {r.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
```

- [ ] **Step 2: Create RecentTradesList**

A compact version of the existing `RecentTrades` component, using `useAccountContext()`.

```tsx
// components/dashboard/recent-trades-list.tsx
"use client";

import { useMemo } from "react";
import { format, parseISO } from "date-fns";
import Link from "next/link";
import { useAccountContext } from "@/lib/hooks/use-account-context";
import { usePnlDisplay } from "@/components/journal/preferences/journal-chrome-context";
import { fmtPctOrCash } from "@/lib/journal/format-pnl";
import { cn } from "@/lib/utils";

export function RecentTradesList() {
  const { deals, currency, baseline, license } = useAccountContext();
  const { mode } = usePnlDisplay();

  const last5 = useMemo(() =>
    [...deals].sort((a, b) => (a.close_time < b.close_time ? 1 : -1)).slice(0, 5),
    [deals],
  );

  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="mb-2 flex items-center justify-between">
        <h4 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Recent Trades
        </h4>
        <Link
          href={`/dashboard/${license.id}/journal`}
          className="text-[11px] text-muted-foreground hover:text-foreground"
        >
          View all ({deals.length}) →
        </Link>
      </div>
      {last5.length === 0 ? (
        <div className="rounded-md border border-dashed py-6 text-center text-xs text-muted-foreground">
          No trades yet.
        </div>
      ) : (
        <div className="divide-y">
          {last5.map((d) => (
            <div key={d.ticket} className="flex items-center justify-between py-2">
              <div className="flex items-center gap-2">
                <span className={cn("h-5 w-[3px] rounded-sm", d.side === "buy" ? "bg-emerald-500" : "bg-red-500")} />
                <div>
                  <span className="text-xs font-semibold">{d.symbol}</span>
                  <span className={cn("ml-1.5 text-[10px] uppercase", d.side === "buy" ? "text-emerald-500" : "text-red-500")}>
                    {d.side}
                  </span>
                </div>
              </div>
              <span className={cn("text-xs font-bold tabular-nums",
                d.profit > 0 && "text-emerald-600 dark:text-emerald-400",
                d.profit < 0 && "text-red-600 dark:text-red-400",
              )}>
                {fmtPctOrCash(d.profit, mode, baseline.baseline, currency)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Create WeeklyCalendarMini**

```tsx
// components/dashboard/weekly-calendar-mini.tsx
"use client";

import { useMemo } from "react";
import { useAccountContext } from "@/lib/hooks/use-account-context";
import { cn } from "@/lib/utils";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri"];

export function WeeklyCalendarMini() {
  const { daily } = useAccountContext();

  const weekData = useMemo(() => {
    const now = new Date();
    const dayOfWeek = now.getDay();
    const monday = new Date(now);
    monday.setDate(now.getDate() - ((dayOfWeek + 6) % 7));

    return WEEKDAYS.map((label, i) => {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      const dateStr = d.toISOString().slice(0, 10);
      const snap = daily.find((s) => s.trade_date === dateStr);
      return { label, pnl: snap?.daily_pnl ?? null };
    });
  }, [daily]);

  const maxAbs = useMemo(() => {
    let m = 0;
    for (const d of weekData) if (d.pnl !== null) m = Math.max(m, Math.abs(d.pnl));
    return m || 1;
  }, [weekData]);

  return (
    <div className="rounded-xl border bg-card p-4">
      <h4 className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        This Week
      </h4>
      <div className="grid grid-cols-5 gap-2">
        {weekData.map((d) => {
          const intensity = d.pnl !== null ? Math.min(1, Math.abs(d.pnl) / maxAbs) : 0;
          const isProfit = d.pnl !== null && d.pnl > 0;
          const isLoss = d.pnl !== null && d.pnl < 0;
          const opacity = 0.15 + intensity * 0.45;

          return (
            <div key={d.label} className="text-center">
              <div className="text-[9px] text-muted-foreground">{d.label}</div>
              <div
                className={cn(
                  "mt-1 flex aspect-square items-center justify-center rounded-md text-[10px] font-semibold",
                  d.pnl === null && "bg-muted/30 text-muted-foreground",
                  isProfit && "text-emerald-500",
                  isLoss && "text-red-500",
                )}
                style={d.pnl !== null ? {
                  backgroundColor: isProfit
                    ? `rgba(45, 170, 71, ${opacity})`
                    : `rgba(239, 68, 68, ${opacity})`,
                } : undefined}
              >
                {d.pnl === null ? "—" : isProfit ? "+" : "−"}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Verify all compile**

```bash
npx tsc --noEmit --pretty 2>&1 | head -20
```

- [ ] **Step 5: Commit**

```bash
git add components/dashboard/date-range-selector.tsx components/dashboard/recent-trades-list.tsx components/dashboard/weekly-calendar-mini.tsx
git commit -m "feat(dashboard): add DateRangeSelector, RecentTradesList, WeeklyCalendarMini"
```

---

### Task 12: Create ChallengeProgressHero component

**Files:**
- Create: `components/dashboard/challenge-progress-hero.tsx`

The hero card for prop firm dashboards. Shows challenge name, status badge, three progress bars (profit target, daily loss, total loss), trading days counter, and days remaining.

- [ ] **Step 1: Create the component**

```tsx
// components/dashboard/challenge-progress-hero.tsx
"use client";

import { useMemo } from "react";
import { useAccountContext } from "@/lib/hooks/use-account-context";
import { evaluateObjectives } from "@/lib/journal/objectives";
import { fmtCash } from "@/lib/journal/format-pnl";
import { cn } from "@/lib/utils";

type ChallengeStatus = "on_track" | "watch" | "breach";

export function ChallengeProgressHero() {
  const { rule, snapshot, daily, currency } = useAccountContext();

  const evaluation = useMemo(() => {
    if (!rule || !snapshot) return null;
    const todayUtc = new Date().toISOString().slice(0, 10);
    return evaluateObjectives({ rule, currentSnapshot: snapshot, dailySnapshots: daily, todayUtc });
  }, [rule, snapshot, daily]);

  if (!rule || !evaluation) return null;

  const status: ChallengeStatus =
    evaluation.dailyLossBreached || evaluation.totalLossBreached ? "breach"
    : (evaluation.todaysPnl < 0 && Math.abs(evaluation.todaysPnl) >= evaluation.dailyLossThreshold * 0.7)
      || evaluation.totalDrawdown >= evaluation.totalLossThreshold * 0.7 ? "watch"
    : "on_track";

  const statusLabel = { on_track: "ON TRACK", watch: "WATCH", breach: "BREACH" }[status];
  const statusColor = {
    on_track: "bg-emerald-500/15 text-emerald-500",
    watch: "bg-amber-500/15 text-amber-500",
    breach: "bg-red-500/15 text-red-500",
  }[status];

  const profitPct = evaluation.profitTargetThreshold > 0
    ? Math.min(100, (evaluation.netProfit / evaluation.profitTargetThreshold) * 100) : 0;
  const dailyPct = evaluation.dailyLossThreshold > 0
    ? Math.min(100, (Math.abs(evaluation.todaysPnl) / evaluation.dailyLossThreshold) * 100) : 0;
  const totalPct = evaluation.totalLossThreshold > 0
    ? Math.min(100, (evaluation.totalDrawdown / evaluation.totalLossThreshold) * 100) : 0;

  const daysRemaining = rule.max_trading_days
    ? Math.max(0, rule.max_trading_days - evaluation.tradingDaysCount)
    : null;

  const cur = currency;

  return (
    <div className="rounded-xl border bg-gradient-to-br from-card to-muted/20 p-5">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-wider text-[#2DAA47]">
            Challenge Progress
          </div>
          <div className="mt-0.5 text-base font-bold">{rule.name}</div>
        </div>
        <span className={cn("rounded-md px-2.5 py-1 text-[10px] font-semibold", statusColor)}>
          {statusLabel}
        </span>
      </div>

      <div className="space-y-3">
        <ProgressRow
          label="Profit Target"
          current={fmtCash(evaluation.netProfit, cur)}
          limit={fmtCash(evaluation.profitTargetThreshold, cur)}
          pct={profitPct}
          tone="green"
        />
        <ProgressRow
          label="Daily Loss"
          current={fmtCash(-Math.abs(evaluation.todaysPnl), cur)}
          limit={fmtCash(-evaluation.dailyLossThreshold, cur)}
          pct={dailyPct}
          tone={dailyPct >= 70 ? "amber" : "green"}
        />
        <ProgressRow
          label="Total Loss"
          current={fmtCash(-evaluation.totalDrawdown, cur)}
          limit={fmtCash(-evaluation.totalLossThreshold, cur)}
          pct={totalPct}
          tone={totalPct >= 70 ? "amber" : "green"}
        />
      </div>

      <div className="mt-4 flex gap-6 text-[11px] text-muted-foreground">
        <span>Trading Days: {evaluation.tradingDaysCount} / {rule.min_trading_days} min</span>
        {daysRemaining !== null && <span>Days Left: {daysRemaining}</span>}
      </div>
    </div>
  );
}

function ProgressRow({ label, current, limit, pct, tone }: {
  label: string; current: string; limit: string; pct: number;
  tone: "green" | "amber";
}) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-[11px]">
        <span className="text-muted-foreground">{label}</span>
        <span className={tone === "amber" ? "text-amber-500" : "text-emerald-500"}>
          {current} / {limit}
        </span>
      </div>
      <div className="h-[6px] overflow-hidden rounded-full bg-muted">
        <div
          className={cn("h-full rounded-full transition-all", tone === "amber" ? "bg-amber-500" : "bg-emerald-500")}
          style={{ width: `${Math.max(0, Math.min(100, pct))}%` }}
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify it compiles**

```bash
npx tsc --noEmit --pretty 2>&1 | head -20
```

- [ ] **Step 3: Commit**

```bash
git add components/dashboard/challenge-progress-hero.tsx
git commit -m "feat(dashboard): add ChallengeProgressHero with objective progress bars"
```

---

### Task 13: Implement DashboardKpiGrid (Layout A) and DashboardObjective (Layout B)

**Files:**
- Modify: `components/dashboard/dashboard-kpi-grid.tsx` (replace placeholder)
- Modify: `components/dashboard/dashboard-objective.tsx` (replace placeholder)

- [ ] **Step 1: Implement Layout A (KPI + Chart)**

Replace the placeholder in `components/dashboard/dashboard-kpi-grid.tsx`:

```tsx
// components/dashboard/dashboard-kpi-grid.tsx
"use client";

import { useMemo } from "react";
import { useAccountContext } from "@/lib/hooks/use-account-context";
import { KpiCard } from "@/components/journal/kpi-card";
import { EquityChart } from "@/components/journal/equity-chart";
import { RecentTradesList } from "./recent-trades-list";
import { WeeklyCalendarMini } from "./weekly-calendar-mini";
import { DateRangeSelector } from "./date-range-selector";
import { computeTradeEquity } from "@/lib/journal/trade-equity";
import { fmtCash, fmtPct } from "@/lib/journal/format-pnl";
import { usePnlDisplay } from "@/components/journal/preferences/journal-chrome-context";

export function DashboardKpiGrid() {
  const { deals, daily, snapshot, baseline, currency } = useAccountContext();
  const { mode } = usePnlDisplay();

  const trade = useMemo(() => computeTradeEquity(deals), [deals]);
  const cumPnlSeries = useMemo(() => trade.curve.map((p) => p.cumPnl), [trade.curve]);
  const drawdownSeries = useMemo(() => trade.curve.map((p) => p.drawdown), [trade.curve]);
  const balanceSeries = useMemo(() => daily.map((d) => d.balance_close), [daily]);

  const showPct = mode === "percent" && baseline.baseline > 0;
  const fmtVal = (cash: number) => showPct ? fmtPct((cash / baseline.baseline) * 100) : fmtCash(cash, currency);

  const winCount = deals.filter((d) => d.profit > 0).length;
  const lossCount = deals.filter((d) => d.profit < 0).length;
  const beCount = deals.filter((d) => d.profit === 0).length;
  const winRate = deals.length > 0 ? (winCount / deals.length) * 100 : 0;
  const hasHistory = trade.curve.length > 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Dashboard</h1>
        <DateRangeSelector />
      </div>

      {/* 4 KPI cards */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          featured
          label="Net P&L"
          tone={!hasHistory ? "neutral" : trade.netPnl > 0 ? "positive" : "negative"}
          value={!hasHistory ? "—" : fmtVal(trade.netPnl)}
          sub={!hasHistory ? "no closed trades" : `${trade.curve.length} trades`}
          series={cumPnlSeries}
          seriesTone={trade.netPnl < 0 ? "negative" : "positive"}
        />
        <KpiCard
          label="Win Rate"
          value={deals.length === 0 ? "—" : `${winRate.toFixed(1)}%`}
          sub={deals.length === 0 ? "no trades" : `${winCount}W · ${lossCount}L · ${beCount}BE`}
        />
        <KpiCard
          label="Max Drawdown"
          tone={trade.maxDrawdownCash > 0 ? "negative" : "neutral"}
          value={!hasHistory ? "—" : fmtVal(-trade.maxDrawdownCash)}
          sub={!hasHistory ? "no trades" : `current ${fmtVal(-trade.currentDrawdownCash)}`}
          series={drawdownSeries}
          seriesTone="negative"
        />
        <KpiCard
          label="Equity"
          value={fmtCash(snapshot?.equity ?? 0, currency)}
          sub={`balance ${fmtCash(snapshot?.balance ?? 0, currency)}`}
          series={balanceSeries}
          seriesTone="neutral"
        />
      </div>

      {/* Equity curve */}
      <div className="rounded-xl border bg-card p-4">
        <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Equity Curve</h3>
        <EquityChart deals={deals} currency={currency} baseline={baseline.baseline} />
      </div>

      {/* Bottom row: Recent trades + Weekly calendar */}
      <div className="grid gap-4 md:grid-cols-[1.5fr_1fr]">
        <RecentTradesList />
        <WeeklyCalendarMini />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Implement Layout B (Objective-First)**

Replace the placeholder in `components/dashboard/dashboard-objective.tsx`:

```tsx
// components/dashboard/dashboard-objective.tsx
"use client";

import { useMemo } from "react";
import { useAccountContext } from "@/lib/hooks/use-account-context";
import { KpiCard } from "@/components/journal/kpi-card";
import { EquityChart } from "@/components/journal/equity-chart";
import { ChallengeProgressHero } from "./challenge-progress-hero";
import { RecentTradesList } from "./recent-trades-list";
import { computeTradeEquity } from "@/lib/journal/trade-equity";
import { fmtCash, fmtPct } from "@/lib/journal/format-pnl";
import { usePnlDisplay } from "@/components/journal/preferences/journal-chrome-context";

export function DashboardObjective() {
  const { deals, daily, snapshot, baseline, currency } = useAccountContext();
  const { mode } = usePnlDisplay();

  const trade = useMemo(() => computeTradeEquity(deals), [deals]);

  const showPct = mode === "percent" && baseline.baseline > 0;
  const fmtVal = (cash: number) => showPct ? fmtPct((cash / baseline.baseline) * 100) : fmtCash(cash, currency);

  const winCount = deals.filter((d) => d.profit > 0).length;
  const winRate = deals.length > 0 ? (winCount / deals.length) * 100 : 0;
  const hasHistory = trade.curve.length > 0;

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Dashboard</h1>

      {/* Challenge hero */}
      <ChallengeProgressHero />

      {/* KPIs + Equity curve */}
      <div className="grid gap-4 md:grid-cols-[auto_1fr]">
        <div className="flex flex-col gap-3 md:w-48">
          <KpiCard
            featured
            label="Net P&L"
            tone={!hasHistory ? "neutral" : trade.netPnl > 0 ? "positive" : "negative"}
            value={!hasHistory ? "—" : fmtVal(trade.netPnl)}
            sub={!hasHistory ? "no trades" : `${trade.curve.length} trades`}
          />
          <KpiCard
            label="Win Rate"
            value={deals.length === 0 ? "—" : `${winRate.toFixed(1)}%`}
            sub={deals.length === 0 ? "no trades" : `${winCount}W / ${deals.length}`}
          />
          <KpiCard
            label="Equity"
            value={fmtCash(snapshot?.equity ?? 0, currency)}
            sub={`balance ${fmtCash(snapshot?.balance ?? 0, currency)}`}
          />
        </div>
        <div className="rounded-xl border bg-card p-4">
          <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Equity Curve</h3>
          <EquityChart deals={deals} currency={currency} baseline={baseline.baseline} />
        </div>
      </div>

      {/* Recent trades */}
      <RecentTradesList />
    </div>
  );
}
```

- [ ] **Step 3: Test both dashboard variants**

```bash
npm run dev
```

Test with a license that has a propfirm rule → should see Objective-First layout.
Test with a license that has no propfirm rule → should see KPI + Chart layout.

- [ ] **Step 4: Commit**

```bash
git add components/dashboard/dashboard-kpi-grid.tsx components/dashboard/dashboard-objective.tsx
git commit -m "feat(dashboard): implement adaptive dashboard layouts (KPI grid + Objective-first)"
```

---

## Phase 4: Prop Firm Management Page

### Task 14: Create prop firm data query

**Files:**
- Create: `lib/prop-firm-data.ts`

Server-side function that fetches all prop firm licenses for a user, joins account snapshots and daily data, and evaluates objectives for each to derive status.

- [ ] **Step 1: Create the query module**

```typescript
// lib/prop-firm-data.ts
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { getAccountSnapshotCurrent, getAccountSnapshotsDaily } from "@/lib/journal/queries";
import { evaluateObjectives, type ObjectivesResult } from "@/lib/journal/objectives";
import { productDisplayName, type Product } from "./products";
import type { License, PropfirmRule, Subscription } from "./types";

export type PropFirmStatus = "on_track" | "watch" | "funded" | "breached";

export interface PropFirmRow {
  licenseId: number;
  mt5Account: number;
  name: string;
  product: Product;
  productDisplay: string;
  status: PropFirmStatus;
  pnl: number;
  drawdownPct: number;
  profitProgressPct: number;
  tradingDays: number;
  maxTradingDays: number | null;
  minTradingDays: number;
  currency: string;
}

export interface PropFirmOverview {
  rows: PropFirmRow[];
  totalPnl: number;
  avgWinRate: number;
  activeCount: number;
  fundedCount: number;
}

export async function getPropFirmOverview(userId: string): Promise<PropFirmOverview> {
  const sb = getSupabaseAdmin();

  const { data: subs } = await sb
    .from("subscriptions")
    .select("*, propfirm_rules(*)")
    .eq("user_id", userId)
    .in("product", ["ctx-prop-passer", "ctx-prop-funded"]);

  if (!subs || subs.length === 0) {
    return { rows: [], totalPnl: 0, avgWinRate: 0, activeCount: 0, fundedCount: 0 };
  }

  const subIds = subs.map((s: { id: number }) => s.id);
  const { data: lics } = await sb
    .from("licenses")
    .select("*")
    .in("subscription_id", subIds)
    .eq("intended_account_type", "live");

  const rows: PropFirmRow[] = [];
  let totalPnl = 0;
  let activeCount = 0;
  let fundedCount = 0;

  for (const lic of (lics ?? []) as License[]) {
    const sub = subs.find((s: { id: number }) => s.id === lic.subscription_id) as
      Subscription & { propfirm_rules: PropfirmRule | null } | undefined;
    if (!sub) continue;

    const rule = sub.propfirm_rules;
    const [snapshot, daily] = await Promise.all([
      getAccountSnapshotCurrent(lic.mt5_account),
      getAccountSnapshotsDaily(lic.mt5_account),
    ]);

    let status: PropFirmStatus;
    let pnl = 0;
    let drawdownPct = 0;
    let profitProgressPct = 0;
    let tradingDays = 0;
    const currency = snapshot?.currency ?? "USD";

    if (sub.product === "ctx-prop-funded") {
      status = "funded";
      fundedCount++;
      if (snapshot && rule) {
        pnl = snapshot.balance - rule.account_size;
        drawdownPct = snapshot.drawdown_pct;
      }
    } else if (rule && snapshot) {
      const todayUtc = new Date().toISOString().slice(0, 10);
      const result = evaluateObjectives({ rule, currentSnapshot: snapshot, dailySnapshots: daily, todayUtc });
      pnl = result.netProfit;
      tradingDays = result.tradingDaysCount;
      drawdownPct = rule.account_size > 0 ? (result.totalDrawdown / rule.account_size) * 100 : 0;
      profitProgressPct = result.profitTargetThreshold > 0
        ? Math.min(100, (result.netProfit / result.profitTargetThreshold) * 100) : 0;

      if (result.dailyLossBreached || result.totalLossBreached || sub.status === "revoked" || sub.status === "expired") {
        status = "breached";
      } else if (
        (Math.abs(result.todaysPnl) >= result.dailyLossThreshold * 0.7) ||
        (result.totalDrawdown >= result.totalLossThreshold * 0.7)
      ) {
        status = "watch";
      } else {
        status = "on_track";
        activeCount++;
      }
      if (status === "watch") activeCount++;
    } else {
      status = sub.status === "active" ? "on_track" : "breached";
      if (status === "on_track") activeCount++;
    }

    if (status !== "breached") totalPnl += pnl;

    rows.push({
      licenseId: lic.id,
      mt5Account: lic.mt5_account,
      name: rule?.name ?? productDisplayName(lic.product),
      product: lic.product,
      productDisplay: productDisplayName(lic.product),
      status,
      pnl,
      drawdownPct,
      profitProgressPct,
      tradingDays,
      maxTradingDays: rule?.max_trading_days ?? null,
      minTradingDays: rule?.min_trading_days ?? 0,
      currency,
    });
  }

  // Sort: watch first, then on_track, funded, breached
  const ORDER: Record<PropFirmStatus, number> = { watch: 0, on_track: 1, funded: 2, breached: 3 };
  rows.sort((a, b) => ORDER[a.status] - ORDER[b.status]);

  return { rows, totalPnl, avgWinRate: 0, activeCount, fundedCount };
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/prop-firm-data.ts
git commit -m "feat(prop-firms): add getPropFirmOverview server query"
```

---

### Task 15: Create PropFirmTable and PropFirmSummaryStrip

**Files:**
- Create: `components/prop-firms/prop-firm-summary-strip.tsx`
- Create: `components/prop-firms/prop-firm-table.tsx`

- [ ] **Step 1: Create PropFirmSummaryStrip**

```tsx
// components/prop-firms/prop-firm-summary-strip.tsx
import { KpiCard } from "@/components/journal/kpi-card";
import { fmtCash } from "@/lib/journal/format-pnl";
import type { PropFirmOverview } from "@/lib/prop-firm-data";

export function PropFirmSummaryStrip({ data }: { data: PropFirmOverview }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <KpiCard
        label="Total P&L"
        tone={data.totalPnl > 0 ? "positive" : data.totalPnl < 0 ? "negative" : "neutral"}
        value={fmtCash(data.totalPnl, "USD")}
        sub="active + funded accounts"
      />
      <KpiCard
        label="Avg Win Rate"
        value="—"
        sub="across active accounts"
      />
      <KpiCard label="Active" value={String(data.activeCount)} sub="on track + watch" />
      <KpiCard label="Funded" value={String(data.fundedCount)} sub="funded accounts" tone={data.fundedCount > 0 ? "positive" : "neutral"} />
    </div>
  );
}
```

- [ ] **Step 2: Create PropFirmTable**

```tsx
// components/prop-firms/prop-firm-table.tsx
"use client";

import { useRouter } from "next/navigation";
import { fmtCash } from "@/lib/journal/format-pnl";
import { cn } from "@/lib/utils";
import type { PropFirmRow, PropFirmStatus } from "@/lib/prop-firm-data";

const STATUS_STYLE: Record<PropFirmStatus, string> = {
  on_track: "bg-emerald-500/15 text-emerald-500",
  watch: "bg-amber-500/15 text-amber-500",
  funded: "bg-blue-500/15 text-blue-500",
  breached: "bg-red-500/15 text-red-500",
};

const STATUS_LABEL: Record<PropFirmStatus, string> = {
  on_track: "ON TRACK",
  watch: "WATCH",
  funded: "FUNDED",
  breached: "BREACHED",
};

export function PropFirmTable({ rows }: { rows: PropFirmRow[] }) {
  const router = useRouter();

  if (rows.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
        No prop firm accounts found.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border bg-card">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-muted/30 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            <th className="sticky left-0 bg-muted/30 px-4 py-3 text-left">Account</th>
            <th className="px-4 py-3 text-left">Status</th>
            <th className="px-4 py-3 text-right">P&L</th>
            <th className="px-4 py-3 text-right">Drawdown</th>
            <th className="px-4 py-3 text-left">Progress</th>
            <th className="px-4 py-3 text-right">Days</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.licenseId}
              onClick={() => {
                localStorage.setItem("ctx.activeAccountId", String(row.licenseId));
                document.cookie = `ctx.activeAccountId=${row.licenseId};path=/;max-age=${60 * 60 * 24 * 365};SameSite=Lax`;
                router.push(`/dashboard/${row.licenseId}`);
              }}
              className={cn(
                "cursor-pointer border-b transition-colors hover:bg-muted/20",
                row.status === "breached" && "opacity-40",
              )}
            >
              <td className="sticky left-0 bg-card px-4 py-3">
                <div className="font-medium">{row.name}</div>
                <div className="text-[11px] text-muted-foreground">#{row.mt5Account}</div>
              </td>
              <td className="px-4 py-3">
                <span className={cn("rounded-md px-2 py-0.5 text-[10px] font-semibold", STATUS_STYLE[row.status])}>
                  {STATUS_LABEL[row.status]}
                </span>
              </td>
              <td className={cn("px-4 py-3 text-right font-semibold tabular-nums",
                row.pnl > 0 && "text-emerald-600 dark:text-emerald-400",
                row.pnl < 0 && "text-red-600 dark:text-red-400",
              )}>
                {fmtCash(row.pnl, row.currency)}
              </td>
              <td className={cn("px-4 py-3 text-right tabular-nums",
                row.drawdownPct > 3 ? "text-amber-500" : "text-muted-foreground",
              )}>
                {row.drawdownPct > 0 ? `-${row.drawdownPct.toFixed(1)}%` : "—"}
              </td>
              <td className="px-4 py-3">
                {row.status === "funded" ? (
                  <span className="text-muted-foreground">—</span>
                ) : (
                  <div className="h-[5px] w-16 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-emerald-500"
                      style={{ width: `${Math.max(0, Math.min(100, row.profitProgressPct))}%` }}
                    />
                  </div>
                )}
              </td>
              <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                {row.maxTradingDays ? `${row.tradingDays}/${row.maxTradingDays}` : String(row.tradingDays)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add components/prop-firms/prop-firm-summary-strip.tsx components/prop-firms/prop-firm-table.tsx
git commit -m "feat(prop-firms): add PropFirmSummaryStrip and PropFirmTable"
```

---

### Task 16: Create Prop Firms page

**Files:**
- Create: `app/dashboard/prop-firms/page.tsx`

- [ ] **Step 1: Create the page**

```tsx
// app/dashboard/prop-firms/page.tsx
import { redirect } from "next/navigation";
import { getSupabaseSSR } from "@/lib/supabase/ssr";
import { getPropFirmOverview } from "@/lib/prop-firm-data";
import { PropFirmSummaryStrip } from "@/components/prop-firms/prop-firm-summary-strip";
import { PropFirmTable } from "@/components/prop-firms/prop-firm-table";

export const dynamic = "force-dynamic";

export default async function PropFirmsPage() {
  const sb = await getSupabaseSSR();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect("/login");

  const data = await getPropFirmOverview(user.id);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Prop Firms</h1>
          <p className="text-sm text-muted-foreground">
            {data.activeCount} active · {data.fundedCount} funded
          </p>
        </div>
      </div>

      <PropFirmSummaryStrip data={data} />
      <PropFirmTable rows={data.rows} />
    </div>
  );
}
```

- [ ] **Step 2: Test the page**

```bash
npm run dev
```

Navigate to `/dashboard/prop-firms`. Verify:
- Summary strip shows aggregate KPIs
- Table shows all prop firm accounts with correct statuses
- Clicking a row navigates to that account's dashboard

- [ ] **Step 3: Commit**

```bash
git add app/dashboard/prop-firms/page.tsx
git commit -m "feat(prop-firms): add Prop Firms management page"
```

---

## Phase 5: Settings + Subscription Management

### Task 17: Create settings tabs layout + subscription management

**Files:**
- Create: `app/dashboard/settings/layout.tsx`
- Modify: `app/dashboard/settings/page.tsx`
- Create: `app/dashboard/settings/subscriptions/page.tsx`
- Create: `components/settings/subscription-management-table.tsx`
- Create: `components/settings/settings-tabs.tsx`

- [ ] **Step 1: Create SettingsTabs component**

```tsx
// components/settings/settings-tabs.tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/dashboard/settings", label: "Preferences", exact: true },
  { href: "/dashboard/settings/subscriptions", label: "Subscriptions" },
];

export function SettingsTabs() {
  const pathname = usePathname();

  return (
    <div className="flex gap-1 border-b">
      {TABS.map((tab) => {
        const isActive = tab.exact ? pathname === tab.href : pathname.startsWith(tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={cn(
              "border-b-2 px-4 py-2 text-sm font-medium transition-colors",
              isActive
                ? "border-foreground text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: Create settings layout**

```tsx
// app/dashboard/settings/layout.tsx
import { SettingsTabs } from "@/components/settings/settings-tabs";

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Settings</h1>
        <p className="text-sm text-muted-foreground">Manage preferences and subscriptions.</p>
      </div>
      <SettingsTabs />
      {children}
    </div>
  );
}
```

- [ ] **Step 3: Update the preferences page**

Replace `app/dashboard/settings/page.tsx` — remove the inline `DashboardNav` and header (now handled by settings layout):

```tsx
// app/dashboard/settings/page.tsx
import { redirect } from "next/navigation";
import { getSupabaseSSR } from "@/lib/supabase/ssr";
import { getPnlDisplay } from "@/lib/preferences/server";
import { PreferencesForm } from "@/components/user/preferences-form";

export const dynamic = "force-dynamic";

export default async function PreferencesPage() {
  const ssr = await getSupabaseSSR();
  const { data: { user } } = await ssr.auth.getUser();
  if (!user) redirect("/login");

  const pnlDisplay = await getPnlDisplay(user.id);

  return (
    <section className="rounded-lg border bg-card p-5">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        Preferences
      </h2>
      <div className="mt-4">
        <PreferencesForm initial={pnlDisplay} />
      </div>
    </section>
  );
}
```

- [ ] **Step 4: Create SubscriptionManagementTable**

```tsx
// components/settings/subscription-management-table.tsx
"use client";

import { useState } from "react";
import { format, parseISO, formatDistanceToNow } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ClaimSlotDialog } from "@/components/user/claim-slot-dialog";
import { ExtendDialog } from "@/components/user/extend-dialog";
import { RenewDialog } from "@/components/user/renew-dialog";
import { productDisplayName } from "@/lib/products";
import { cn } from "@/lib/utils";
import type { DashboardSubscription } from "@/lib/types";

const STATUS_STYLE: Record<string, string> = {
  active: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  pending: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  expired: "bg-muted text-muted-foreground",
  revoked: "bg-red-500/15 text-red-600 dark:text-red-400",
  rejected: "bg-red-500/15 text-red-600 dark:text-red-400",
};

export function SubscriptionManagementTable({ items }: { items: DashboardSubscription[] }) {
  const active = items.filter((i) => i.subscription.status === "active" || i.subscription.status === "pending");
  const past = items.filter((i) => i.subscription.status !== "active" && i.subscription.status !== "pending");
  const [showPast, setShowPast] = useState(false);

  return (
    <div className="space-y-4">
      <Table rows={active} />
      {past.length > 0 && (
        <details open={showPast} onToggle={(e) => setShowPast((e.target as HTMLDetailsElement).open)}>
          <summary className="cursor-pointer text-sm text-muted-foreground">
            Past subscriptions ({past.length})
          </summary>
          <div className="mt-2">
            <Table rows={past} />
          </div>
        </details>
      )}
    </div>
  );
}

function Table({ rows }: { rows: DashboardSubscription[] }) {
  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground">None.</p>;
  }

  return (
    <div className="overflow-x-auto rounded-xl border bg-card">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-muted/30 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            <th className="px-4 py-3 text-left">Subscription</th>
            <th className="px-4 py-3 text-left">Status</th>
            <th className="px-4 py-3 text-left">Live Slot</th>
            <th className="px-4 py-3 text-left">Demo Slot</th>
            <th className="px-4 py-3 text-left">Expires</th>
            <th className="px-4 py-3 text-right">Actions</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((item) => {
            const sub = item.subscription;
            return (
              <tr key={sub.id} className="border-b">
                <td className="px-4 py-3 font-medium">
                  {productDisplayName(sub.product)}
                  <div className="text-[11px] text-muted-foreground">{sub.tier}</div>
                </td>
                <td className="px-4 py-3">
                  <span className={cn("rounded-md px-2 py-0.5 text-[10px] font-semibold", STATUS_STYLE[sub.status])}>
                    {sub.status.toUpperCase()}
                  </span>
                </td>
                <td className="px-4 py-3">
                  {item.liveLicense
                    ? <span className="text-xs">MT5 #{item.liveLicense.mt5_account}</span>
                    : sub.status === "active"
                      ? <ClaimSlotDialog subscriptionId={sub.id} slotType="live" />
                      : <span className="text-xs text-muted-foreground">—</span>
                  }
                </td>
                <td className="px-4 py-3">
                  {item.demoLicense
                    ? <span className="text-xs">MT5 #{item.demoLicense.mt5_account}</span>
                    : sub.status === "active"
                      ? <ClaimSlotDialog subscriptionId={sub.id} slotType="demo" />
                      : <span className="text-xs text-muted-foreground">—</span>
                  }
                </td>
                <td className="px-4 py-3 text-xs text-muted-foreground">
                  {sub.expires_at
                    ? <>{format(parseISO(sub.expires_at), "MMM dd, yyyy")} <span className="text-[10px]">({formatDistanceToNow(parseISO(sub.expires_at), { addSuffix: true })})</span></>
                    : "—"
                  }
                </td>
                <td className="px-4 py-3 text-right">
                  {sub.status === "active" && <ExtendDialog subscriptionId={sub.id} currentTier={sub.tier} />}
                  {(sub.status === "expired" || sub.status === "revoked") && <RenewDialog subscriptionId={sub.id} product={sub.product} />}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 5: Create the subscriptions page**

```tsx
// app/dashboard/settings/subscriptions/page.tsx
import { redirect } from "next/navigation";
import { getSupabaseSSR } from "@/lib/supabase/ssr";
import { getDashboardData } from "@/lib/dashboard-data";
import { SubscriptionManagementTable } from "@/components/settings/subscription-management-table";

export const dynamic = "force-dynamic";

export default async function SubscriptionsPage() {
  const sb = await getSupabaseSSR();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect("/login");

  const items = await getDashboardData(user.id);

  return <SubscriptionManagementTable items={items} />;
}
```

- [ ] **Step 6: Test settings pages**

```bash
npm run dev
```

- `/dashboard/settings` — tab nav shows, Preferences tab active, form renders
- `/dashboard/settings/subscriptions` — Subscriptions tab active, table renders
- Claim, Extend, Renew actions work

- [ ] **Step 7: Commit**

```bash
git add app/dashboard/settings/layout.tsx app/dashboard/settings/page.tsx app/dashboard/settings/subscriptions/page.tsx components/settings/settings-tabs.tsx components/settings/subscription-management-table.tsx
git commit -m "feat(settings): add settings tabs layout + subscription management page"
```

---

## Phase 6: Mobile Responsiveness

### Task 18: Add responsive sidebar behavior

**Files:**
- Modify: `components/sidebar/app-sidebar.tsx`
- Modify: `app/dashboard/layout.tsx`

The sidebar is already `hidden lg:flex` (desktop only). The MobileTopBar handles <768px. For tablet (md breakpoint, 768-1023px), we need to show the icon rail.

- [ ] **Step 1: Add tablet icon-rail variant to AppSidebar**

In `components/sidebar/app-sidebar.tsx`, update the `<aside>` to also render a collapsed icon rail for md screens:

Add a second `<aside>` element for the tablet rail:

```tsx
// Inside AppSidebar, after the existing <aside> that's hidden lg:flex, add:

{/* Tablet icon rail */}
<aside className="fixed inset-y-0 left-0 z-30 hidden w-14 flex-col items-center border-r border-white/[0.06] bg-[#111827] py-3 md:flex lg:hidden">
  {/* Logo icon */}
  <div className="mb-4 flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-[#2DAA47] to-[#1B8A37] text-xs font-extrabold text-white">
    CT
  </div>
  {/* Nav icons */}
  <nav className="flex flex-1 flex-col items-center gap-1">
    <IconRailItem href={hasAccount ? `/dashboard/${activeLicenseId}` : "#"} icon={ChartLineUp} label="Dashboard" disabled={!hasAccount} />
    <IconRailItem href={hasAccount ? `/dashboard/${activeLicenseId}/journal` : "#"} icon={Notebook} label="Journal" disabled={!hasAccount} />
    <IconRailItem href={hasAccount ? `/dashboard/${activeLicenseId}/calendar` : "#"} icon={CalendarBlank} label="Calendar" disabled={!hasAccount} />
    <IconRailItem href={hasAccount ? `/dashboard/${activeLicenseId}/performance` : "#"} icon={TrendUp} label="Performance" disabled={!hasAccount} />
    <div className="my-2 h-px w-6 bg-white/[0.06]" />
    <IconRailItem href={hasAccount ? `/dashboard/${activeLicenseId}/objectives` : "#"} icon={Target} label="Objectives" disabled={!hasAccount} />
    <IconRailItem href="/dashboard/prop-firms" icon={Buildings} label="Prop Firms" />
    <IconRailItem href="/dashboard/propfirm-rules" icon={Scales} label="Rules" />
    <IconRailItem href="/dashboard/settings" icon={GearSix} label="Settings" />
  </nav>
</aside>
```

And add the `IconRailItem` component at the bottom of the file:

```tsx
function IconRailItem({ href, icon: IconCmp, label, disabled }: {
  href: string; icon: Icon; label: string; disabled?: boolean;
}) {
  const pathname = usePathname();
  const isActive = pathname === href || pathname.startsWith(href + "/");

  if (disabled) {
    return (
      <span className="flex h-9 w-9 items-center justify-center rounded-md text-slate-600 opacity-40" title={label}>
        <IconCmp className="h-[18px] w-[18px]" />
      </span>
    );
  }

  return (
    <Link
      href={href}
      title={label}
      className={cn(
        "flex h-9 w-9 items-center justify-center rounded-md transition-colors",
        isActive ? "bg-[rgba(45,170,71,0.15)] text-[#2DAA47]" : "text-slate-400 hover:bg-white/5 hover:text-slate-200",
      )}
    >
      <IconCmp className="h-[18px] w-[18px]" weight={isActive ? "fill" : "regular"} />
    </Link>
  );
}
```

- [ ] **Step 2: Update layout content padding**

In `app/dashboard/layout.tsx`, update the main content padding to account for the icon rail at md:

```tsx
<main className="md:pl-14 lg:pl-[220px] pt-12 md:pt-0">
```

- [ ] **Step 3: Add responsive grids to dashboard layouts**

In `components/dashboard/dashboard-kpi-grid.tsx`, the KPI grid already uses `grid-cols-1 sm:grid-cols-2 lg:grid-cols-4`. The bottom row uses `md:grid-cols-[1.5fr_1fr]`. These are already responsive.

In `components/dashboard/dashboard-objective.tsx`, update the KPI + equity grid:

```tsx
<div className="grid gap-4 md:grid-cols-[auto_1fr]">
```

This stacks on mobile, side-by-side on md+. Already correct.

- [ ] **Step 4: Test all breakpoints**

```bash
npm run dev
```

Test at:
- 1200px+ (desktop): full sidebar
- 800px (tablet): icon rail, content full width
- 400px (mobile): hamburger top bar, sheet drawer

- [ ] **Step 5: Commit**

```bash
git add components/sidebar/app-sidebar.tsx app/dashboard/layout.tsx
git commit -m "feat(responsive): add tablet icon rail + mobile-aware content padding"
```

---

## Phase 7: Cleanup

### Task 19: Delete old components and update references

**Files:**
- Delete: `components/user/dashboard-card-grid.tsx`
- Delete: `components/user/subscription-card.tsx`
- Delete: `components/user/subscription-card-slots.tsx`
- Delete: `components/user/dashboard-filter-toolbar.tsx`
- Delete: `components/user/dashboard-filter-product-chip.tsx`
- Delete: `components/user/dashboard-filter-status-chip.tsx`
- Delete: `components/user/dashboard-filter-slots-chip.tsx`
- Delete: `components/user/dashboard-filter-sort-chip.tsx`
- Delete: `components/user/dashboard-pagination.tsx`
- Delete: `components/user/dashboard-nav.tsx`
- Delete: `app/dashboard/licenses/[id]/page.tsx`
- Delete: `app/dashboard/licenses/[id]/loading.tsx`

- [ ] **Step 1: Delete old dashboard components**

```bash
rm components/user/dashboard-card-grid.tsx \
   components/user/subscription-card.tsx \
   components/user/subscription-card-slots.tsx \
   components/user/dashboard-filter-toolbar.tsx \
   components/user/dashboard-filter-product-chip.tsx \
   components/user/dashboard-filter-status-chip.tsx \
   components/user/dashboard-filter-slots-chip.tsx \
   components/user/dashboard-filter-sort-chip.tsx \
   components/user/dashboard-pagination.tsx \
   components/user/dashboard-nav.tsx
```

- [ ] **Step 2: Delete old journal route**

```bash
rm -rf app/dashboard/licenses/
```

- [ ] **Step 3: Check for broken imports**

```bash
npx tsc --noEmit --pretty 2>&1 | grep "error TS"
```

Fix any remaining imports that reference deleted files. Common locations:
- `lib/dashboard-filters.ts` may export `CARDS_PER_PAGE` — check if anything still imports it
- Any component that imported `DashboardNav` needs updating

- [ ] **Step 4: Verify the full app compiles and runs**

```bash
npm run build
```

Expected: no build errors.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore: delete old dashboard components + journal route (replaced by sidebar redesign)"
```

---

### Task 20: End-to-end verification

- [ ] **Step 1: Run the dev server and test the full flow**

```bash
npm run dev
```

Test checklist:
1. Login → redirected to `/dashboard` → auto-redirects to last-used account or first account
2. Sidebar renders with logo, account switcher, nav sections
3. Account switcher opens, shows grouped subscriptions, search works (if 4+ accounts)
4. Clicking a claimed slot navigates to that account's dashboard
5. Dashboard (no rule) → shows KPI + Chart layout with 4 KPI cards, equity curve, recent trades, weekly calendar
6. Dashboard (with rule) → shows Objective-First layout with challenge progress hero
7. `/dashboard/[id]/journal` → merged trades + positions + orders
8. `/dashboard/[id]/calendar` → calendar view
9. `/dashboard/[id]/performance` → performance charts
10. `/dashboard/[id]/objectives` → objectives with progress bars
11. `/dashboard/prop-firms` → summary strip + table, clicking row switches account
12. `/dashboard/settings` → tabs: Preferences and Subscriptions
13. `/dashboard/settings/subscriptions` → subscription table with Claim/Extend/Renew
14. Mobile (<768px): hamburger opens drawer with full sidebar
15. Tablet (768-1023px): icon rail visible, content full width
16. Light/dark toggle works, sidebar stays dark in both modes

- [ ] **Step 2: Commit any final fixes**

```bash
git add -A
git commit -m "fix: address issues found during end-to-end verification"
```

---

## Notes for the Implementing Agent

1. **Existing KpiCard reuse:** The project already has `components/journal/kpi-card.tsx` with sparkline support, progress bars, tones, and featured state. Both dashboard layouts reuse it directly — no need to create a new KPI card component.

2. **Existing EquityChart reuse:** The `components/journal/equity-chart.tsx` Recharts chart is reused as-is. The spec mentions adding a target line for the objective dashboard — this is a stretch goal. The base implementation uses it without the target line.

3. **Cookie + localStorage sync:** The active account ID is stored in both localStorage (for client reads) and a cookie (for server reads in the layout). The `AccountSwitcher` sets both on selection.

4. **Admin UI untouched:** The admin routes (`/admin/*`) still use `SiteNav` (the old header nav). Nothing in `components/site-nav.tsx` or `app/admin/` is modified.

5. **ClaimSlotDialog props:** The existing `claim-slot-dialog.tsx` may need its props checked — it's currently triggered from subscription cards. If its props don't match `{ subscriptionId, slotType }`, the `SubscriptionManagementTable` call site in Task 17 needs adjustment.

6. **JournalShell kept but not used:** After the redesign, `journal-shell.tsx` is no longer rendered by any route. Its polling logic has been extracted into `AccountProvider`. It can be deleted as part of a follow-up cleanup, but is not deleted in this plan to keep changes focused.

7. **`/frontend-design` skill:** Use this skill for all component creation tasks. It ensures production-grade styling, avoids generic AI patterns, and produces polished visual output.
