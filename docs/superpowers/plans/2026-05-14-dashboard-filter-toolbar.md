# Dashboard Filter Toolbar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a filter toolbar (Product · Status · Slots · Sort) above the dashboard card grid with localStorage persistence, plus a refreshed status-badge color palette (Active = green, Revoked/Rejected = red, Pending = amber, No-slots-claimed / Expired = outline).

**Architecture:** Pure frontend on `/dashboard`. Filter state lives in `<DashboardCardGrid>` (client component); a new `<DashboardFilterToolbar>` renders four chip controls that read/write that state through callbacks. Pure-logic helpers (`applyFilters`, `sortItems`, codec) sit in `lib/dashboard-filters.ts` with jest tests. The collapsible Past section continues to render only when the Status filter is at default — once the user opts past cards into the main grid, the section is hidden to avoid duplicate UI. No backend changes.

**Tech Stack:** Next.js 16 App Router, React (client), TypeScript, Tailwind CSS, shadcn UI primitives (`Badge`, `Button`, `Select`, `Popover`, `Checkbox`), `lucide-react`. Tests via `jest` (`pnpm test`).

**Spec:** `docs/superpowers/specs/2026-05-14-dashboard-filter-toolbar-design.md`

**File map:**

| File | Action | Responsibility |
|---|---|---|
| `components/ui/badge.tsx` | Modify | Add `success` / `warning` / `danger` cva variants |
| `components/user/subscription-card.tsx` | Modify | Update `headerStatusVariant` to return new variants per spec §10 mapping |
| `components/ui/popover.tsx` | Create (via shadcn CLI) | Popover primitive for Product/Status chips |
| `components/ui/checkbox.tsx` | Create (via shadcn CLI) | Checkbox primitive for Product/Status popovers |
| `lib/dashboard-filters.ts` | Create | Types, defaults, `applyFilters`, `sortItems`, `statusGroupOf`, `isDefault`, localStorage codec |
| `lib/dashboard-filters.test.ts` | Create | Jest tests covering each filter dimension, each sort key, codec round-trip |
| `components/user/dashboard-filter-sort-chip.tsx` | Create | Single-select `Sort` dropdown |
| `components/user/dashboard-filter-slots-chip.tsx` | Create | Single-select `Slots` dropdown |
| `components/user/dashboard-filter-status-chip.tsx` | Create | Multi-select `Status` popover |
| `components/user/dashboard-filter-product-chip.tsx` | Create | Multi-select `Product` popover with counts |
| `components/user/dashboard-filter-toolbar.tsx` | Create | Composes the four chips + "× Clear all" link |
| `components/user/dashboard-card-grid.tsx` | Modify | Owns filter state, hydrates from localStorage, applies filter+sort, conditionally renders Past section, handles empty-result branches |

---

## Task 1: Add `success` / `warning` / `danger` Badge variants

**Files:**
- Modify: `components/ui/badge.tsx`

The shadcn Badge currently exposes `default`, `secondary`, `destructive`, `outline`, `ghost`, `link`. We need three new filled-color variants for the dashboard status palette (spec §10).

- [ ] **Step 1: Edit `badgeVariants` to add three variants**

Open `components/ui/badge.tsx`. Inside the `cva(..., { variants: { variant: { … } } })` block, immediately after the existing `link` entry and before the closing brace of `variant: {`, add three lines. The full updated `variants.variant` block becomes:

```ts
variant: {
  default: "bg-primary text-primary-foreground [a]:hover:bg-primary/80",
  secondary:
    "bg-secondary text-secondary-foreground [a]:hover:bg-secondary/80",
  destructive:
    "bg-destructive/10 text-destructive focus-visible:ring-destructive/20 dark:bg-destructive/20 dark:focus-visible:ring-destructive/40 [a]:hover:bg-destructive/20",
  outline:
    "border-border text-foreground [a]:hover:bg-muted [a]:hover:text-muted-foreground",
  ghost:
    "hover:bg-muted hover:text-muted-foreground dark:hover:bg-muted/50",
  link: "text-primary underline-offset-4 hover:underline",
  success: "bg-emerald-600 text-white [a]:hover:bg-emerald-600/90",
  warning: "bg-amber-500 text-amber-950 [a]:hover:bg-amber-500/90",
  danger: "bg-red-600 text-white [a]:hover:bg-red-600/90",
},
```

Only those three lines are new; everything else is unchanged.

- [ ] **Step 2: Type-check**

Run: `pnpm tsc --noEmit`
Expected: PASS, zero errors.

- [ ] **Step 3: Commit**

```bash
git add components/ui/badge.tsx
git commit -m "feat(ui): add success/warning/danger Badge variants"
```

---

## Task 2: Update `SubscriptionCard` header badge mapping

**Files:**
- Modify: `components/user/subscription-card.tsx`

Replace the `headerStatusVariant` helper so each `HeaderStatus` maps to the right Badge variant per spec §10.2.

- [ ] **Step 1: Replace `headerStatusVariant`**

Open `components/user/subscription-card.tsx`. Replace the function (currently at lines 55-64) with:

```ts
function headerStatusVariant(s: HeaderStatus):
  | "success"
  | "outline"
  | "warning"
  | "danger" {
  switch (s) {
    case "active":
      return "success";
    case "no-slots":
      return "outline";
    case "pending":
      return "warning";
    case "rejected":
      return "danger";
    case "revoked":
      return "danger";
    case "expired":
      return "outline";
  }
}
```

The function signature now matches the four new return values. The rest of the file is unchanged.

- [ ] **Step 2: Type-check**

Run: `pnpm tsc --noEmit`
Expected: PASS, zero errors.

- [ ] **Step 3: Commit**

```bash
git add components/user/subscription-card.tsx
git commit -m "feat(dashboard): color status badges per design palette"
```

---

## Task 3: Install shadcn `popover` and `checkbox` primitives

**Files:**
- Create: `components/ui/popover.tsx` (via shadcn CLI)
- Create: `components/ui/checkbox.tsx` (via shadcn CLI)
- May modify: `package.json`, `pnpm-lock.yaml` (transitive deps like `@radix-ui/react-popover`, `@radix-ui/react-checkbox`)

The Product and Status chips need a Popover with Checkbox rows. Neither primitive exists in `components/ui/` today.

- [ ] **Step 1: Run shadcn add**

```bash
pnpm dlx shadcn@latest add popover checkbox
```

Answer any prompts with the project defaults (it should detect `components.json` and write to `components/ui/`).

Expected output: two files created at `components/ui/popover.tsx` and `components/ui/checkbox.tsx`. `package.json` may gain `@radix-ui/react-popover` and `@radix-ui/react-checkbox` deps.

- [ ] **Step 2: Verify the files exist and exports look right**

Run: `head -1 components/ui/popover.tsx components/ui/checkbox.tsx`

Expected: both files exist; the popover file exports `Popover`, `PopoverTrigger`, `PopoverContent` (read the file to confirm exact named exports). The checkbox file exports `Checkbox`.

- [ ] **Step 3: Type-check**

Run: `pnpm tsc --noEmit`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add components/ui/popover.tsx components/ui/checkbox.tsx package.json pnpm-lock.yaml
git commit -m "build(ui): add shadcn popover and checkbox primitives"
```

---

## Task 4: Build `lib/dashboard-filters.ts` with jest tests (TDD)

**Files:**
- Create: `lib/dashboard-filters.test.ts`
- Create: `lib/dashboard-filters.ts`

Pure-logic module: types, defaults, filter application, sort, status grouping, equality check, localStorage codec. TDD because this is the load-bearing logic and we want it tested.

- [ ] **Step 1: Write the failing test file**

Create `lib/dashboard-filters.test.ts`:

```ts
import {
  DEFAULT_FILTERS,
  applyFilters,
  sortItems,
  statusGroupOf,
  isDefault,
  loadFilters,
  saveFilters,
  LOCAL_STORAGE_KEY,
  type FilterState,
} from "./dashboard-filters";
import type { DashboardSubscription, Subscription } from "./types";

function mkSub(partial: Partial<Subscription> & { id: number }): DashboardSubscription {
  const base: Subscription = {
    id: partial.id,
    user_id: "u",
    product: "impulse",
    tier: "yearly",
    status: "active",
    requested_at: "2026-01-01T00:00:00Z",
    approved_at: null,
    approved_by: null,
    expires_at: "2027-01-01T00:00:00Z",
    rejection_reason: null,
    notes: null,
    created_at: "2026-01-01T00:00:00Z",
    push_interval_seconds: 10,
    propfirm_rule_id: null,
  };
  return {
    subscription: { ...base, ...partial },
    liveLicense: null,
    demoLicense: null,
    pendingExtension: null,
  };
}

describe("statusGroupOf", () => {
  it.each([
    ["active", "active"],
    ["pending", "pending"],
    ["expired", "past"],
    ["revoked", "past"],
    ["rejected", "past"],
  ] as const)("maps %s -> %s", (status, group) => {
    expect(statusGroupOf(status)).toBe(group);
  });
});

describe("DEFAULT_FILTERS", () => {
  it("has Active + Pending checked and Past unchecked", () => {
    expect(DEFAULT_FILTERS.statuses).toEqual(["active", "pending"]);
  });
  it("has empty products array (means all)", () => {
    expect(DEFAULT_FILTERS.products).toEqual([]);
  });
  it("slots = any, sort = status", () => {
    expect(DEFAULT_FILTERS.slots).toBe("any");
    expect(DEFAULT_FILTERS.sort).toBe("status");
  });
});

describe("isDefault", () => {
  it("returns true for DEFAULT_FILTERS", () => {
    expect(isDefault(DEFAULT_FILTERS)).toBe(true);
  });
  it("returns false when products is non-empty", () => {
    expect(isDefault({ ...DEFAULT_FILTERS, products: ["impulse"] })).toBe(false);
  });
  it("returns false when sort is non-default", () => {
    expect(isDefault({ ...DEFAULT_FILTERS, sort: "expires-soonest" })).toBe(false);
  });
  it("returns false when status set differs", () => {
    expect(isDefault({ ...DEFAULT_FILTERS, statuses: ["active"] })).toBe(false);
  });
});

describe("applyFilters — status", () => {
  const items = [
    mkSub({ id: 1, status: "active" }),
    mkSub({ id: 2, status: "pending" }),
    mkSub({ id: 3, status: "expired" }),
    mkSub({ id: 4, status: "revoked" }),
    mkSub({ id: 5, status: "rejected" }),
  ];
  it("default state keeps Active + Pending", () => {
    const out = applyFilters(items, DEFAULT_FILTERS);
    expect(out.map((i) => i.subscription.id)).toEqual([1, 2]);
  });
  it("Past-only keeps the three terminal statuses", () => {
    const out = applyFilters(items, { ...DEFAULT_FILTERS, statuses: ["past"] });
    expect(out.map((i) => i.subscription.id).sort()).toEqual([3, 4, 5]);
  });
  it("all-checked keeps everything", () => {
    const out = applyFilters(items, {
      ...DEFAULT_FILTERS,
      statuses: ["active", "pending", "past"],
    });
    expect(out).toHaveLength(5);
  });
});

describe("applyFilters — product", () => {
  const items = [
    mkSub({ id: 1, product: "impulse" }),
    mkSub({ id: 2, product: "ctx-live" }),
    mkSub({ id: 3, product: "ctx-prop-passer" }),
  ];
  it("empty products array means all pass", () => {
    expect(applyFilters(items, DEFAULT_FILTERS)).toHaveLength(3);
  });
  it("single product filters to that product", () => {
    const out = applyFilters(items, { ...DEFAULT_FILTERS, products: ["ctx-live"] });
    expect(out.map((i) => i.subscription.id)).toEqual([2]);
  });
  it("multiple products union", () => {
    const out = applyFilters(items, {
      ...DEFAULT_FILTERS,
      products: ["impulse", "ctx-prop-passer"],
    });
    expect(out.map((i) => i.subscription.id).sort()).toEqual([1, 3]);
  });
});

describe("applyFilters — slots", () => {
  const live = { license_key: "K", mt5_account: 1 } as unknown as DashboardSubscription["liveLicense"];
  const demo = { license_key: "D", mt5_account: 2 } as unknown as DashboardSubscription["demoLicense"];
  const items: DashboardSubscription[] = [
    { ...mkSub({ id: 1 }), liveLicense: live, demoLicense: demo },        // both filled
    { ...mkSub({ id: 2 }), liveLicense: live, demoLicense: null },        // demo empty
    { ...mkSub({ id: 3 }), liveLicense: null, demoLicense: null },        // both empty
  ];
  it("any pass-through", () => {
    expect(applyFilters(items, DEFAULT_FILTERS)).toHaveLength(3);
  });
  it("has-empty filters to subs with at least one empty slot", () => {
    const out = applyFilters(items, { ...DEFAULT_FILTERS, slots: "has-empty" });
    expect(out.map((i) => i.subscription.id).sort()).toEqual([2, 3]);
  });
  it("all-filled keeps only subs with both slots", () => {
    const out = applyFilters(items, { ...DEFAULT_FILTERS, slots: "all-filled" });
    expect(out.map((i) => i.subscription.id)).toEqual([1]);
  });
  it("slot filter does NOT apply to past statuses", () => {
    const pastItems = items.map((i) => ({
      ...i,
      subscription: { ...i.subscription, status: "revoked" as const },
    }));
    const out = applyFilters(pastItems, {
      ...DEFAULT_FILTERS,
      statuses: ["past"],
      slots: "all-filled",
    });
    expect(out).toHaveLength(3);
  });
});

describe("sortItems", () => {
  it("status sort: active before pending", () => {
    const items = [
      mkSub({ id: 1, status: "pending", product: "impulse", created_at: "2026-01-01T00:00:00Z" }),
      mkSub({ id: 2, status: "active", product: "impulse", created_at: "2026-01-01T00:00:00Z" }),
    ];
    const out = sortItems(items, "status");
    expect(out.map((i) => i.subscription.id)).toEqual([2, 1]);
  });
  it("expires-soonest: ascending, null last", () => {
    const items = [
      mkSub({ id: 1, expires_at: "2027-06-01T00:00:00Z" }),
      mkSub({ id: 2, expires_at: null }),
      mkSub({ id: 3, expires_at: "2027-01-01T00:00:00Z" }),
    ];
    const out = sortItems(items, "expires-soonest");
    expect(out.map((i) => i.subscription.id)).toEqual([3, 1, 2]);
  });
  it("recently-created: descending by created_at", () => {
    const items = [
      mkSub({ id: 1, created_at: "2026-01-01T00:00:00Z" }),
      mkSub({ id: 2, created_at: "2026-03-01T00:00:00Z" }),
      mkSub({ id: 3, created_at: "2026-02-01T00:00:00Z" }),
    ];
    const out = sortItems(items, "recently-created");
    expect(out.map((i) => i.subscription.id)).toEqual([2, 3, 1]);
  });
});

describe("loadFilters / saveFilters", () => {
  const store: Record<string, string> = {};
  const ls = {
    getItem: (k: string) => store[k] ?? null,
    setItem: (k: string, v: string) => {
      store[k] = v;
    },
    removeItem: (k: string) => {
      delete store[k];
    },
    clear: () => {
      for (const k of Object.keys(store)) delete store[k];
    },
    key: () => null,
    length: 0,
  };
  beforeEach(() => {
    Object.defineProperty(global, "localStorage", { value: ls, writable: true });
    ls.clear();
  });

  it("returns null when nothing stored", () => {
    expect(loadFilters()).toBeNull();
  });
  it("returns null on invalid JSON", () => {
    store[LOCAL_STORAGE_KEY] = "not json";
    expect(loadFilters()).toBeNull();
  });
  it("returns null when shape is invalid", () => {
    store[LOCAL_STORAGE_KEY] = JSON.stringify({ bogus: true });
    expect(loadFilters()).toBeNull();
  });
  it("round-trips a valid state", () => {
    const state: FilterState = {
      products: ["ctx-live", "impulse"],
      statuses: ["active", "past"],
      slots: "has-empty",
      sort: "expires-soonest",
    };
    saveFilters(state);
    expect(loadFilters()).toEqual(state);
  });
});
```

- [ ] **Step 2: Run tests, confirm they fail**

Run: `pnpm test -- --runTestsByPath lib/dashboard-filters.test.ts`
Expected: FAIL with module-not-found / cannot find `./dashboard-filters`.

- [ ] **Step 3: Create the implementation**

Create `lib/dashboard-filters.ts`:

```ts
import type { Product } from "./products";
import { PRODUCT_CODES } from "./products";
import type { DashboardSubscription, SubscriptionStatus } from "./types";

export type SortKey = "status" | "expires-soonest" | "recently-created";

export type SlotFilter = "any" | "has-empty" | "all-filled";

export type StatusGroup = "active" | "pending" | "past";

export interface FilterState {
  products: Product[];
  statuses: StatusGroup[];
  slots: SlotFilter;
  sort: SortKey;
}

export const DEFAULT_FILTERS: FilterState = {
  products: [],
  statuses: ["active", "pending"],
  slots: "any",
  sort: "status",
};

export const LOCAL_STORAGE_KEY = "dashboard.filters.v1";

export function statusGroupOf(status: SubscriptionStatus): StatusGroup {
  if (status === "active") return "active";
  if (status === "pending") return "pending";
  return "past";
}

export function isDefault(state: FilterState): boolean {
  if (state.slots !== DEFAULT_FILTERS.slots) return false;
  if (state.sort !== DEFAULT_FILTERS.sort) return false;
  if (state.products.length !== 0) return false;
  if (state.statuses.length !== DEFAULT_FILTERS.statuses.length) return false;
  for (const s of DEFAULT_FILTERS.statuses) {
    if (!state.statuses.includes(s)) return false;
  }
  return true;
}

export function applyFilters(
  items: DashboardSubscription[],
  state: FilterState,
): DashboardSubscription[] {
  return items.filter((item) => {
    const sub = item.subscription;

    // Status
    if (!state.statuses.includes(statusGroupOf(sub.status))) return false;

    // Product
    if (state.products.length > 0 && !state.products.includes(sub.product)) {
      return false;
    }

    // Slots — only applies to non-past statuses (slot state is moot on terminal subs)
    if (state.slots !== "any" && statusGroupOf(sub.status) !== "past") {
      const hasLive = item.liveLicense !== null;
      const hasDemo = item.demoLicense !== null;
      const someEmpty = !hasLive || !hasDemo;
      const allFilled = hasLive && hasDemo;
      if (state.slots === "has-empty" && !someEmpty) return false;
      if (state.slots === "all-filled" && !allFilled) return false;
    }

    return true;
  });
}

const statusRank: Record<SubscriptionStatus, number> = {
  active: 0,
  pending: 1,
  expired: 2,
  revoked: 3,
  rejected: 4,
};

export function sortItems(
  items: DashboardSubscription[],
  sort: SortKey,
): DashboardSubscription[] {
  const productRank = new Map<string, number>(
    PRODUCT_CODES.map((p, i) => [p, i]),
  );
  const sorted = [...items];
  if (sort === "status") {
    sorted.sort((a, b) => {
      const sa = statusRank[a.subscription.status];
      const sb = statusRank[b.subscription.status];
      if (sa !== sb) return sa - sb;
      const pa = productRank.get(a.subscription.product) ?? 99;
      const pb = productRank.get(b.subscription.product) ?? 99;
      if (pa !== pb) return pa - pb;
      return (
        new Date(b.subscription.created_at).getTime() -
        new Date(a.subscription.created_at).getTime()
      );
    });
  } else if (sort === "expires-soonest") {
    sorted.sort((a, b) => {
      const ea = a.subscription.expires_at;
      const eb = b.subscription.expires_at;
      if (ea === null && eb === null) return 0;
      if (ea === null) return 1;
      if (eb === null) return -1;
      return new Date(ea).getTime() - new Date(eb).getTime();
    });
  } else {
    // recently-created
    sorted.sort(
      (a, b) =>
        new Date(b.subscription.created_at).getTime() -
        new Date(a.subscription.created_at).getTime(),
    );
  }
  return sorted;
}

const VALID_SORT: SortKey[] = ["status", "expires-soonest", "recently-created"];
const VALID_SLOT: SlotFilter[] = ["any", "has-empty", "all-filled"];
const VALID_STATUS: StatusGroup[] = ["active", "pending", "past"];

function isFilterState(value: unknown): value is FilterState {
  if (value === null || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  if (!Array.isArray(v.products)) return false;
  if (!v.products.every((p) => typeof p === "string" && (PRODUCT_CODES as readonly string[]).includes(p))) return false;
  if (!Array.isArray(v.statuses)) return false;
  if (!v.statuses.every((s) => typeof s === "string" && VALID_STATUS.includes(s as StatusGroup))) return false;
  if (typeof v.slots !== "string" || !VALID_SLOT.includes(v.slots as SlotFilter)) return false;
  if (typeof v.sort !== "string" || !VALID_SORT.includes(v.sort as SortKey)) return false;
  return true;
}

export function loadFilters(): FilterState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(LOCAL_STORAGE_KEY);
    if (raw === null) return null;
    const parsed = JSON.parse(raw);
    if (!isFilterState(parsed)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveFilters(state: FilterState): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // swallow quota / privacy-mode errors silently
  }
}
```

- [ ] **Step 4: Run tests, confirm they pass**

Run: `pnpm test -- --runTestsByPath lib/dashboard-filters.test.ts`
Expected: PASS, all suites green.

- [ ] **Step 5: Type-check**

Run: `pnpm tsc --noEmit`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/dashboard-filters.ts lib/dashboard-filters.test.ts
git commit -m "feat(dashboard): add filter/sort logic + localStorage codec"
```

---

## Task 5: Sort chip component

**Files:**
- Create: `components/user/dashboard-filter-sort-chip.tsx`

Single-select dropdown using shadcn `Select` styled as a chip-like button.

- [ ] **Step 1: Create the component**

```tsx
"use client";

import { ChevronDown } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { SortKey } from "@/lib/dashboard-filters";

const LABELS: Record<SortKey, string> = {
  status: "Status",
  "expires-soonest": "Expires soonest",
  "recently-created": "Recently created",
};

export function DashboardFilterSortChip({
  value,
  onChange,
}: {
  value: SortKey;
  onChange: (v: SortKey) => void;
}) {
  const isNonDefault = value !== "status";
  return (
    <Select value={value} onValueChange={(v) => onChange(v as SortKey)}>
      <SelectTrigger
        size="sm"
        className="h-8 gap-1.5 border-border bg-background text-xs font-medium"
        aria-label="Sort"
      >
        {isNonDefault ? (
          <span
            className="inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-foreground"
            aria-hidden
          />
        ) : null}
        <span className="text-muted-foreground">Sort:</span>
        <SelectValue placeholder={LABELS.status}>{LABELS[value]}</SelectValue>
        <ChevronDown className="h-3 w-3 opacity-60" aria-hidden />
      </SelectTrigger>
      <SelectContent align="end">
        <SelectItem value="status">Status</SelectItem>
        <SelectItem value="expires-soonest">Expires soonest</SelectItem>
        <SelectItem value="recently-created">Recently created</SelectItem>
      </SelectContent>
    </Select>
  );
}
```

Note: if `SelectTrigger` doesn't accept `size`, check `components/ui/select.tsx` — replace the `size="sm"` prop with whatever the existing trigger uses, or drop it (the `h-8` class enforces height).

- [ ] **Step 2: Type-check**

Run: `pnpm tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add components/user/dashboard-filter-sort-chip.tsx
git commit -m "feat(dashboard): add Sort filter chip"
```

---

## Task 6: Slots chip component

**Files:**
- Create: `components/user/dashboard-filter-slots-chip.tsx`

Single-select dropdown for the `SlotFilter` value.

- [ ] **Step 1: Create the component**

```tsx
"use client";

import { ChevronDown } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { SlotFilter } from "@/lib/dashboard-filters";

const LABELS: Record<SlotFilter, string> = {
  any: "any",
  "has-empty": "has empty",
  "all-filled": "all filled",
};

export function DashboardFilterSlotsChip({
  value,
  onChange,
}: {
  value: SlotFilter;
  onChange: (v: SlotFilter) => void;
}) {
  const isNonDefault = value !== "any";
  return (
    <Select value={value} onValueChange={(v) => onChange(v as SlotFilter)}>
      <SelectTrigger
        className="h-8 gap-1.5 border-border bg-background text-xs font-medium"
        aria-label="Slots filter"
      >
        {isNonDefault ? (
          <span
            className="inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-foreground"
            aria-hidden
          />
        ) : null}
        <span className="text-muted-foreground">Slots:</span>
        <SelectValue placeholder={LABELS.any}>{LABELS[value]}</SelectValue>
        <ChevronDown className="h-3 w-3 opacity-60" aria-hidden />
      </SelectTrigger>
      <SelectContent align="end">
        <SelectItem value="any">Any</SelectItem>
        <SelectItem value="has-empty">Has empty slot</SelectItem>
        <SelectItem value="all-filled">All slots filled</SelectItem>
      </SelectContent>
    </Select>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `pnpm tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add components/user/dashboard-filter-slots-chip.tsx
git commit -m "feat(dashboard): add Slots filter chip"
```

---

## Task 7: Status chip component

**Files:**
- Create: `components/user/dashboard-filter-status-chip.tsx`

Multi-select Popover with three checkboxes (Active / Pending / Past).

- [ ] **Step 1: Create the component**

```tsx
"use client";

import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import type { StatusGroup } from "@/lib/dashboard-filters";
import { DEFAULT_FILTERS } from "@/lib/dashboard-filters";

const ORDER: StatusGroup[] = ["active", "pending", "past"];
const LABEL: Record<StatusGroup, string> = {
  active: "Active",
  pending: "Pending",
  past: "Past (revoked / expired / rejected)",
};

function isDefaultStatus(value: StatusGroup[]): boolean {
  if (value.length !== DEFAULT_FILTERS.statuses.length) return false;
  for (const s of DEFAULT_FILTERS.statuses) {
    if (!value.includes(s)) return false;
  }
  return true;
}

function summary(value: StatusGroup[]): string {
  if (value.length === 0) return "none";
  if (value.length === ORDER.length) return "All";
  if (value.length === 1) return LABEL[value[0]].split(" ")[0];
  return `${value.length} selected`;
}

export function DashboardFilterStatusChip({
  value,
  onChange,
}: {
  value: StatusGroup[];
  onChange: (v: StatusGroup[]) => void;
}) {
  const nonDefault = !isDefaultStatus(value);
  function toggle(s: StatusGroup) {
    if (value.includes(s)) onChange(value.filter((x) => x !== s));
    else onChange([...value, s]);
  }
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          size="sm"
          variant="outline"
          className="h-8 gap-1.5 text-xs font-medium"
          aria-label="Status filter"
        >
          {nonDefault ? (
            <span
              className="inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-foreground"
              aria-hidden
            />
          ) : null}
          <span className="text-muted-foreground">Status:</span>
          <span>{summary(value)}</span>
          <ChevronDown className="h-3 w-3 opacity-60" aria-hidden />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-56 p-2">
        <div className="flex flex-col gap-1">
          {ORDER.map((s) => (
            <label
              key={s}
              className="flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-muted"
            >
              <Checkbox
                checked={value.includes(s)}
                onCheckedChange={() => toggle(s)}
              />
              <span>{LABEL[s]}</span>
            </label>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `pnpm tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add components/user/dashboard-filter-status-chip.tsx
git commit -m "feat(dashboard): add Status filter chip"
```

---

## Task 8: Product chip component

**Files:**
- Create: `components/user/dashboard-filter-product-chip.tsx`

Multi-select Popover with checkboxes for each product the user has at least one subscription in, plus `Select all` / `Clear` shortcut buttons.

- [ ] **Step 1: Create the component**

```tsx
"use client";

import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { productDisplayName } from "@/lib/products";
import type { Product } from "@/lib/products";

export interface ProductOption {
  product: Product;
  count: number;
}

function summary(
  value: Product[],
  options: ProductOption[],
): string {
  if (value.length === 0) return "All";
  if (value.length === 1) return productDisplayName(value[0]);
  if (value.length === options.length) return "All";
  return `${value.length} products`;
}

export function DashboardFilterProductChip({
  value,
  onChange,
  options,
}: {
  value: Product[];
  onChange: (v: Product[]) => void;
  options: ProductOption[];
}) {
  // value === [] semantically means "all"; chip is non-default when the user
  // has narrowed to a strict subset of the available products.
  const nonDefault = value.length > 0 && value.length < options.length;
  function toggle(p: Product) {
    if (value.includes(p)) onChange(value.filter((x) => x !== p));
    else onChange([...value, p]);
  }
  function selectAll() {
    onChange([]);
  }
  function clearAll() {
    onChange(options.map((o) => o.product));
    // Note: clearAll selects ALL options so the visible chip says "All";
    // semantic empty array would mean the same thing. Either is fine.
    // We use the explicit array to keep counts in the popover correct.
  }
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          size="sm"
          variant="outline"
          className="h-8 gap-1.5 text-xs font-medium"
          aria-label="Product filter"
        >
          {nonDefault ? (
            <span
              className="inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-foreground"
              aria-hidden
            />
          ) : null}
          <span className="text-muted-foreground">Product:</span>
          <span>{summary(value, options)}</span>
          <ChevronDown className="h-3 w-3 opacity-60" aria-hidden />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 p-2">
        <div className="mb-1 flex items-center justify-between gap-2 border-b pb-1">
          <button
            type="button"
            className="text-xs text-muted-foreground hover:text-foreground"
            onClick={selectAll}
          >
            Select all
          </button>
          <button
            type="button"
            className="text-xs text-muted-foreground hover:text-foreground"
            onClick={clearAll}
          >
            Clear
          </button>
        </div>
        <div className="flex flex-col gap-1">
          {options.map((opt) => {
            const checked = value.length === 0 || value.includes(opt.product);
            return (
              <label
                key={opt.product}
                className="flex cursor-pointer items-center justify-between gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-muted"
              >
                <span className="flex items-center gap-2">
                  <Checkbox
                    checked={checked}
                    onCheckedChange={() => toggle(opt.product)}
                  />
                  <span>{productDisplayName(opt.product)}</span>
                </span>
                <span className="text-xs text-muted-foreground">
                  ({opt.count})
                </span>
              </label>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
```

Note: the semantics of `value === []` meaning "all products" requires that the chip pre-checks every option when the array is empty. The `toggle` handler then transitions from "all" to "all minus this one" when the user unchecks a product.

Refine: when the user clicks `Clear`, intent is probably "deselect all" → nothing selected → empty grid. We use explicit `options.map(o => o.product)` here so visually nothing changes, but `applyFilters` treats this as "all". The Clear button is rarely useful; this is acceptable. The Select-all button (which sets `[]`) is the canonical reset.

- [ ] **Step 2: Type-check**

Run: `pnpm tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add components/user/dashboard-filter-product-chip.tsx
git commit -m "feat(dashboard): add Product filter chip with counts"
```

---

## Task 9: Toolbar composition

**Files:**
- Create: `components/user/dashboard-filter-toolbar.tsx`

Composes the four chips horizontally and renders the `× Clear all` link when filter state is non-default.

- [ ] **Step 1: Create the component**

```tsx
"use client";

import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DEFAULT_FILTERS,
  isDefault,
  type FilterState,
} from "@/lib/dashboard-filters";
import {
  DashboardFilterProductChip,
  type ProductOption,
} from "./dashboard-filter-product-chip";
import { DashboardFilterStatusChip } from "./dashboard-filter-status-chip";
import { DashboardFilterSlotsChip } from "./dashboard-filter-slots-chip";
import { DashboardFilterSortChip } from "./dashboard-filter-sort-chip";

export function DashboardFilterToolbar({
  state,
  onChange,
  products,
}: {
  state: FilterState;
  onChange: (s: FilterState) => void;
  products: ProductOption[];
}) {
  const nonDefault = !isDefault(state);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <DashboardFilterProductChip
        value={state.products}
        onChange={(products) => onChange({ ...state, products })}
        options={products}
      />
      <DashboardFilterStatusChip
        value={state.statuses}
        onChange={(statuses) => onChange({ ...state, statuses })}
      />
      <DashboardFilterSlotsChip
        value={state.slots}
        onChange={(slots) => onChange({ ...state, slots })}
      />
      <div className="hidden flex-1 sm:block" />
      <DashboardFilterSortChip
        value={state.sort}
        onChange={(sort) => onChange({ ...state, sort })}
      />
      {nonDefault ? (
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-8 gap-1 text-xs text-muted-foreground"
          onClick={() => onChange(DEFAULT_FILTERS)}
        >
          <X className="h-3 w-3" aria-hidden />
          Clear all
        </Button>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `pnpm tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add components/user/dashboard-filter-toolbar.tsx
git commit -m "feat(dashboard): compose filter chips into toolbar"
```

---

## Task 10: Wire toolbar into `DashboardCardGrid`

**Files:**
- Modify: `components/user/dashboard-card-grid.tsx`

This is the final glue: owns filter state, hydrates from localStorage post-mount, computes Product options with counts, applies filter+sort, conditionally renders the Past section, and handles the three empty-state branches per spec §4.8.

- [ ] **Step 1: Rewrite the file**

Replace the entire contents of `components/user/dashboard-card-grid.tsx` with:

```tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { PRODUCT_CODES } from "@/lib/products";
import type { Product } from "@/lib/products";
import { SubscriptionCard } from "./subscription-card";
import { ExpiredBanner } from "@/components/shared/expired-banner";
import { DashboardFilterToolbar } from "./dashboard-filter-toolbar";
import type { ProductOption } from "./dashboard-filter-product-chip";
import {
  DEFAULT_FILTERS,
  applyFilters,
  isDefault,
  loadFilters,
  saveFilters,
  sortItems,
  statusGroupOf,
  type FilterState,
} from "@/lib/dashboard-filters";
import { Button } from "@/components/ui/button";
import type { DashboardSubscription } from "@/lib/types";

function pastSortedByCreated(
  items: DashboardSubscription[],
): DashboardSubscription[] {
  return [...items].sort(
    (a, b) =>
      new Date(b.subscription.created_at).getTime() -
      new Date(a.subscription.created_at).getTime(),
  );
}

export function DashboardCardGrid({
  items,
}: {
  items: DashboardSubscription[];
}) {
  const [state, setState] = useState<FilterState>(DEFAULT_FILTERS);

  // Hydrate from localStorage after first client render to avoid SSR mismatch.
  useEffect(() => {
    const loaded = loadFilters();
    if (loaded !== null) setState(loaded);
  }, []);

  // Persist on every change.
  useEffect(() => {
    saveFilters(state);
  }, [state]);

  // Compute product options with counts, ordered by canonical product order.
  const productOptions = useMemo<ProductOption[]>(() => {
    const counts = new Map<Product, number>();
    for (const item of items) {
      const p = item.subscription.product;
      counts.set(p, (counts.get(p) ?? 0) + 1);
    }
    return PRODUCT_CODES.filter((p) => counts.has(p)).map((p) => ({
      product: p,
      count: counts.get(p)!,
    }));
  }, [items]);

  // Show the collapsible Past section only when Status filter is at its
  // default (Active + Pending). Once user opts Past into the main grid the
  // collapsible section would be redundant.
  const statusAtDefault =
    state.statuses.length === DEFAULT_FILTERS.statuses.length &&
    DEFAULT_FILTERS.statuses.every((s) => state.statuses.includes(s));

  const filtered = useMemo(
    () => applyFilters(items, state),
    [items, state],
  );
  const sortedMain = useMemo(
    () => sortItems(filtered, state.sort),
    [filtered, state.sort],
  );

  // Past items (used only when statusAtDefault is true).
  const pastUnfiltered = useMemo(
    () =>
      pastSortedByCreated(
        items.filter((i) => statusGroupOf(i.subscription.status) === "past"),
      ),
    [items],
  );
  const renewableCount = pastUnfiltered.filter(
    (i) =>
      i.subscription.status === "expired" ||
      i.subscription.status === "revoked",
  ).length;

  // Past expansion state — only relevant when statusAtDefault.
  const [pastOpen, setPastOpen] = useState(
    () => sortedMain.length === 0 && pastUnfiltered.length > 0,
  );
  const pastRef = useRef<HTMLDetailsElement | null>(null);

  function openPastFromBanner() {
    setPastOpen(true);
    requestAnimationFrame(() => {
      pastRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  const mainGridEmpty = sortedMain.length === 0;
  const filterIsDefault = isDefault(state);

  return (
    <div className="space-y-4">
      <DashboardFilterToolbar
        state={state}
        onChange={setState}
        products={productOptions}
      />

      {statusAtDefault && renewableCount > 0 ? (
        <ExpiredBanner
          count={renewableCount}
          onOpenPast={openPastFromBanner}
        />
      ) : null}

      {/* Main grid OR empty-state messages */}
      {!mainGridEmpty ? (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {sortedMain.map((item) => (
            <SubscriptionCard
              key={item.subscription.id}
              item={item}
              mode={
                statusGroupOf(item.subscription.status) === "past"
                  ? "past"
                  : "current"
              }
            />
          ))}
        </div>
      ) : filterIsDefault && pastUnfiltered.length > 0 ? (
        <p className="text-sm text-muted-foreground">No active subscriptions.</p>
      ) : (
        <div className="flex flex-col items-start gap-2 rounded-md border border-dashed p-6">
          <p className="text-sm text-muted-foreground">
            No subscriptions match these filters.
          </p>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => setState(DEFAULT_FILTERS)}
          >
            Clear filters
          </Button>
        </div>
      )}

      {/* Past section — only when Status filter is at default */}
      {statusAtDefault && pastUnfiltered.length > 0 ? (
        <details
          ref={pastRef}
          open={pastOpen}
          onToggle={(e) => setPastOpen(e.currentTarget.open)}
          id="past-subscriptions"
          className="group"
        >
          <summary className="flex cursor-pointer list-none items-center gap-3 py-2 text-sm font-semibold text-foreground/80 hover:text-foreground">
            <span>Past subscriptions</span>
            <span className="inline-flex h-5 items-center justify-center rounded-full bg-muted px-2 text-xs font-semibold text-foreground/70">
              {pastUnfiltered.length}
            </span>
            <span className="h-px flex-1 bg-border" aria-hidden />
            <ChevronDown
              className="h-4 w-4 transition-transform group-open:rotate-180"
              aria-hidden
            />
          </summary>
          <p className="mb-3 mt-1 text-xs text-muted-foreground">
            Revoked, expired, or rejected. You can still renew expired or
            revoked subs, or re-open the journal of historic licenses.
          </p>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {pastUnfiltered.map((item) => (
              <SubscriptionCard
                key={item.subscription.id}
                item={item}
                mode="past"
              />
            ))}
          </div>
        </details>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 2: Type-check + build**

Run: `pnpm tsc --noEmit`
Expected: PASS.

Run: `pnpm next build`
Expected: build succeeds. (Optional but strongly recommended on this task — confirms the App Router page assembles cleanly with the new client component.)

- [ ] **Step 3: Commit**

```bash
git add components/user/dashboard-card-grid.tsx
git commit -m "feat(dashboard): wire filter toolbar + past-section coexistence"
```

---

## Task 11: Manual verification

**Files:** none modified.

The spec defers UI test coverage to manual walkthrough.

- [ ] **Step 1: Rebuild and restart the container**

```bash
docker compose up -d --build copytraderx-license
```

Wait for `✓ Ready in …`.

- [ ] **Step 2: Sign in as `json.alanano@gmail.com`**

Open `copytraderx.lan/dashboard` in your browser.

- [ ] **Step 3: Verify badge palette**

- Active card → green filled badge (`emerald-600`, white text).
- A revoked past card → red filled badge.
- A pending card (if any in this account; if not, submit a request → admin pending list) → amber filled badge.
- "No slots claimed" card (active sub with both slots empty) → white outlined badge.
- Expired card (if any) → gray/outline badge.

- [ ] **Step 4: Verify filter toolbar exists and chips render**

Above the card grid you should see four chips left-to-right: `Product: All`, `Status: 2 selected`, `Slots: any`, then on the right `Sort: Status`. No "Clear all" link yet (state is default).

- [ ] **Step 5: Verify Product filter**

- Click `Product`. Popover opens with one row per product the user has subs for, each with a count (e.g. `Impulse (2)`).
- Uncheck `Impulse`. Cards for Impulse vanish from the main grid; chip becomes `Product: 2 products` (or similar) with a dot indicator; `× Clear all` appears in the toolbar.
- Click `Select all` in the popover. Chip returns to `Product: All`.

- [ ] **Step 6: Verify Status filter**

- Click `Status`. Three checkboxes: Active (✓), Pending (✓), Past (✗).
- Check `Past`. Past cards now appear in the main grid (no separate collapsible section); yellow banner is gone; chip says `Status: 3 selected`.
- Uncheck `Active` and `Pending` so only `Past` is checked. Main grid shows only past cards; banner gone; collapsible section gone.
- Re-check `Active` and `Pending`, uncheck `Past`. Layout returns to today's default: main grid + collapsible Past + banner.

- [ ] **Step 7: Verify Slots filter**

With default Status filter, click `Slots` and pick `Has empty slot`. Main grid filters to active subs with at least one empty slot. Pick `All slots filled` — only fully-filled subs remain. Reset to `Any`.

- [ ] **Step 8: Verify Sort**

Pick `Sort: Expires soonest`. Cards reorder by `expires_at` ascending; the sub closest to expiring is first. Pick `Recently created`. Cards reorder by `created_at` descending. Pick `Status`. Cards return to today's default ordering.

- [ ] **Step 9: Verify persistence**

Set a non-default filter (e.g., Product = CTX Live only). Reload the page. The filter should still be applied; the toolbar chips reflect it.

Open DevTools → Application → Local Storage → `copytraderx.lan` → key `dashboard.filters.v1` should contain the JSON state.

- [ ] **Step 10: Verify Clear all + empty-state**

With a non-default filter active, click `× Clear all`. State resets; all subs reappear.

Now narrow filter so result is empty (e.g., Product = CTX Live, Slots = All slots filled — if that yields nothing for this account). You should see the bordered "No subscriptions match these filters." message with a `Clear filters` button. Click it; filter resets.

- [ ] **Step 11: Verify responsive layout**

Resize to <768px. The toolbar should wrap chips onto multiple lines. Card grid drops to 1 column. Past section still works.

- [ ] **Step 12: Run the full test suite**

```bash
pnpm test
```

Expected: all suites green, including the new `lib/dashboard-filters.test.ts`.

- [ ] **Step 13: Commit polish if any was needed**

If steps 3-11 surfaced visual issues that you fixed (e.g., spacing, chip overflow), commit them now:

```bash
git add components/user/
git commit -m "fix(dashboard): visual polish from manual verification"
```

If no changes were needed, skip this step.

---

## Self-review

- **Spec coverage:**
  - §2 toolbar layout + chip types (Product, Status, Slots, Sort) → Tasks 5-9.
  - §2 chip default/non-default label rules → implemented in each chip's `summary` helper (Tasks 5-8) + toolbar `× Clear all` (Task 9).
  - §2 Past section coexistence rule → Task 10 (`statusAtDefault` branch).
  - §2 banner conditional on Status default → Task 10.
  - §2 localStorage persistence → Task 4 (codec) + Task 10 (useEffect hydration/save).
  - §2 empty results 3-case branching → Task 10.
  - §3 non-goals: none of search/presets/URL params are introduced.
  - §4.2 FilterState shape with `products: Product[]`, `statuses: StatusGroup[]`, `slots: SlotFilter`, `sort: SortKey` → Task 4.
  - §4.3 applyFilters → Task 4 (with tests covering each branch).
  - §4.4 sortItems with three sort keys → Task 4 (with tests).
  - §4.5 Past coexistence → Task 10.
  - §4.6 persistence (read on mount, write on change) → Task 10.
  - §4.7 chip label table → individual chip `summary` functions (Tasks 5-8).
  - §4.8 empty results → Task 10 three-branch render.
  - §5 UI: chip height (`h-8`), Popover widths (`w-56` / `w-64`), Clear-all link → Tasks 5-9.
  - §6 immediate apply (no Apply button) → setState fires onChange immediately in toolbar.
  - §10 badge palette (Active=success, No-slots=outline, Pending=warning, Rejected=danger, Revoked=danger, Expired=outline) → Tasks 1-2.

- **Placeholder scan:** none — every code block is complete; the only "see file to confirm" note is the optional `size="sm"` prop on `SelectTrigger` in Task 5, which has a fallback documented.

- **Type consistency:**
  - `FilterState`, `SortKey`, `SlotFilter`, `StatusGroup` defined in Task 4 (`lib/dashboard-filters.ts`) and imported with the exact same names in Tasks 5-10.
  - `ProductOption` defined in Task 8 (`dashboard-filter-product-chip.tsx`) and re-exported / consumed in Tasks 9-10.
  - `DEFAULT_FILTERS`, `isDefault`, `applyFilters`, `sortItems`, `statusGroupOf`, `loadFilters`, `saveFilters`, `LOCAL_STORAGE_KEY` exported from Task 4 and consumed in Tasks 9-10 with matching signatures.
  - Badge variant strings `"success"`, `"warning"`, `"danger"` introduced in Task 1, returned by `headerStatusVariant` in Task 2 — names match exactly.
