# Subscriptions as the primary admin page — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Promote a new paginated `/admin/subscriptions` page to the top of the admin nav, repurpose `/admin/licenses` as a narrow MT5/liveness ops view, and drop the legacy `licenses.customer_email` column.

**Architecture:** A new server-rendered admin page composes a client-side grouped-table component that paginates by user group. Pure helpers (`groupByUser`, `filterRows`, `paginateGroups`) carry the logic and are unit-tested under jest. The existing `DashboardPagination` is extended with an optional page-size selector and reused. The `License` TypeScript type sheds its `customer_email` field; the column drop ships as a Supabase migration delivered alongside the code.

**Tech Stack:** Next.js 16 (app router), React 19, TypeScript, Tailwind, shadcn/ui, Supabase (admin SDK on the server, no RLS bypass needed since pages are admin-gated), jest + ts-jest for unit tests, Playwright for e2e.

**Spec:** `docs/superpowers/specs/2026-05-14-subscriptions-as-primary-admin-page-design.md`

---

## File Structure

**New files:**
- `lib/admin-subscriptions.ts` — types (`AdminSubscriptionRow`, `AdminUserGroup`, `AdminSubsFilterState`) + pure helpers (`groupByUser`, `filterRows`, `paginateGroups`, `summarizeStatuses`).
- `lib/admin-subscriptions.test.ts` — unit tests for all of the above.
- `lib/admin-settings.ts` — `getAdminSubsPageSize` / `setAdminSubsPageSize` + constant exports. Mirrors the shape of `lib/settings.ts` so the existing pattern is preserved.
- `lib/admin-settings.test.ts` — tests for the getter/setter.
- `app/admin/subscriptions/page.tsx` — server component. Fetches subscriptions with joined user + licenses, hands them to the client table.
- `components/admin/subscription-table.tsx` — client component. Toolbar (search, status, product, page-size), grouped table, row actions, pagination footer.
- `e2e/admin-subscriptions-page.spec.ts` — Playwright smoke: page loads, search filters, page size persists.
- Supabase migration SQL — delivered as a code block in Task 11 (lives in the Supabase repo's `supabase/migrations/`, not this repo).

**Modified files:**
- `lib/types.ts` — remove `customer_email` from `License`.
- `lib/schemas.ts` — remove `customer_email` from `createLicenseSchema` and `updateLicenseSchema`.
- `lib/schemas.test.ts` — remove `customer_email` from fixtures and delete the three customer_email-specific tests.
- `lib/liveness.test.ts` — remove `customer_email` from the license fixture.
- `lib/dashboard-filters.ts` — export `ADMIN_SUBS_PAGE_SIZE_DEFAULT` and `ADMIN_SUBS_PAGE_SIZE_OPTIONS` (kept here next to `CARDS_PER_PAGE` so all pagination constants live in one place).
- `components/user/dashboard-pagination.tsx` — accept optional `pageSize`, `pageSizeOptions`, `onPageSizeChange` props and render a selector when provided.
- `components/license-form.tsx` — remove the `customer_email` form field, label, error display, default value, schema entry.
- `components/license-table.tsx` — remove the "Customer Email" column + search match; add an "Owner" column rendered from a new `ownerEmail` prop on each row.
- `app/admin/licenses/page.tsx` — join `users.email` via the subscription, pass it down, update copy and "Create subscription" button removal.
- `app/api/licenses/route.ts` — return licenses augmented with `owner_email` resolved through the subscription→user join so polling stays in sync.
- `components/site-nav.tsx` — reorder links to lead with **Subscriptions**, swap brand-link target to `/admin/subscriptions`.

---

## Task 1: Pagination constants

**Files:**
- Modify: `lib/dashboard-filters.ts`

- [ ] **Step 1: Add the constants**

Open `lib/dashboard-filters.ts` and below the existing `export const CARDS_PER_PAGE = 6;` line, add:

```ts
export const ADMIN_SUBS_PAGE_SIZE_OPTIONS = [10, 25, 50, 100] as const;
export const ADMIN_SUBS_PAGE_SIZE_DEFAULT = 10;
export type AdminSubsPageSize = (typeof ADMIN_SUBS_PAGE_SIZE_OPTIONS)[number];
```

- [ ] **Step 2: Run typecheck**

Run: `pnpm exec tsc --noEmit`
Expected: PASS with no new errors.

- [ ] **Step 3: Commit**

```bash
git add lib/dashboard-filters.ts
git commit -m "feat(admin): pagination size constants for subscriptions page"
```

---

## Task 2: Page-size persistence (admin-settings.ts)

**Files:**
- Create: `lib/admin-settings.ts`
- Create: `lib/admin-settings.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `lib/admin-settings.test.ts`:

```ts
/**
 * @jest-environment jsdom
 */
import {
  ADMIN_SUBS_PAGE_SIZE_KEY,
  getAdminSubsPageSize,
  setAdminSubsPageSize,
} from "./admin-settings";
import { ADMIN_SUBS_PAGE_SIZE_DEFAULT } from "./dashboard-filters";

beforeEach(() => {
  window.localStorage.clear();
});

describe("getAdminSubsPageSize", () => {
  it("returns the default when nothing is stored", () => {
    expect(getAdminSubsPageSize()).toBe(ADMIN_SUBS_PAGE_SIZE_DEFAULT);
  });

  it("returns the stored value when it is a valid option", () => {
    window.localStorage.setItem(ADMIN_SUBS_PAGE_SIZE_KEY, "50");
    expect(getAdminSubsPageSize()).toBe(50);
  });

  it("falls back to the default when the stored value is not a valid option", () => {
    window.localStorage.setItem(ADMIN_SUBS_PAGE_SIZE_KEY, "37");
    expect(getAdminSubsPageSize()).toBe(ADMIN_SUBS_PAGE_SIZE_DEFAULT);
  });

  it("falls back to the default when the stored value is not numeric", () => {
    window.localStorage.setItem(ADMIN_SUBS_PAGE_SIZE_KEY, "many");
    expect(getAdminSubsPageSize()).toBe(ADMIN_SUBS_PAGE_SIZE_DEFAULT);
  });
});

describe("setAdminSubsPageSize", () => {
  it("writes the value to localStorage", () => {
    setAdminSubsPageSize(25);
    expect(window.localStorage.getItem(ADMIN_SUBS_PAGE_SIZE_KEY)).toBe("25");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test -- admin-settings.test.ts`
Expected: FAIL with "Cannot find module './admin-settings'".

- [ ] **Step 3: Implement the module**

Create `lib/admin-settings.ts`:

```ts
import {
  ADMIN_SUBS_PAGE_SIZE_DEFAULT,
  ADMIN_SUBS_PAGE_SIZE_OPTIONS,
  type AdminSubsPageSize,
} from "./dashboard-filters";

export const ADMIN_SUBS_PAGE_SIZE_KEY = "admin.subs.pageSize";

const OPTION_SET = new Set<number>(ADMIN_SUBS_PAGE_SIZE_OPTIONS);

function isAdminSubsPageSize(value: number): value is AdminSubsPageSize {
  return OPTION_SET.has(value);
}

export function getAdminSubsPageSize(): AdminSubsPageSize {
  if (typeof window === "undefined") return ADMIN_SUBS_PAGE_SIZE_DEFAULT;
  const raw = window.localStorage.getItem(ADMIN_SUBS_PAGE_SIZE_KEY);
  if (raw === null) return ADMIN_SUBS_PAGE_SIZE_DEFAULT;
  const n = Number(raw);
  if (!Number.isFinite(n) || !isAdminSubsPageSize(n)) {
    return ADMIN_SUBS_PAGE_SIZE_DEFAULT;
  }
  return n;
}

export function setAdminSubsPageSize(size: AdminSubsPageSize): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(ADMIN_SUBS_PAGE_SIZE_KEY, String(size));
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test -- admin-settings.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/admin-settings.ts lib/admin-settings.test.ts
git commit -m "feat(admin): persist page-size selector in localStorage"
```

---

## Task 3: Pure helpers for admin subscriptions (types + groupByUser + summarizeStatuses)

**Files:**
- Create: `lib/admin-subscriptions.ts`
- Create: `lib/admin-subscriptions.test.ts`

This task builds only the types and the first two helpers. Filtering and pagination follow in Tasks 4 and 5.

- [ ] **Step 1: Write the failing tests**

Create `lib/admin-subscriptions.test.ts`:

```ts
import {
  groupByUser,
  summarizeStatuses,
  type AdminSubscriptionRow,
} from "./admin-subscriptions";

function mkRow(
  overrides: Partial<AdminSubscriptionRow> & {
    id: number;
    user_id: string;
    user_email: string;
  },
): AdminSubscriptionRow {
  return {
    id: overrides.id,
    user_id: overrides.user_id,
    user_email: overrides.user_email,
    user_full_name: overrides.user_full_name ?? null,
    product: overrides.product ?? "impulse",
    tier: overrides.tier ?? "yearly",
    status: overrides.status ?? "active",
    expires_at: overrides.expires_at ?? "2027-05-14T00:00:00Z",
    created_at: overrides.created_at ?? "2026-01-01T00:00:00Z",
    hidden_at: overrides.hidden_at ?? null,
    propfirm_rule_name: overrides.propfirm_rule_name ?? null,
    live_license: overrides.live_license ?? null,
    demo_license: overrides.demo_license ?? null,
  };
}

describe("groupByUser", () => {
  it("returns an empty array for no rows", () => {
    expect(groupByUser([])).toEqual([]);
  });

  it("groups rows by user_id while preserving first-appearance order", () => {
    const rows: AdminSubscriptionRow[] = [
      mkRow({ id: 1, user_id: "a", user_email: "a@x.com" }),
      mkRow({ id: 2, user_id: "b", user_email: "b@x.com" }),
      mkRow({ id: 3, user_id: "a", user_email: "a@x.com" }),
    ];
    const groups = groupByUser(rows);
    expect(groups.map((g) => g.user_id)).toEqual(["a", "b"]);
    expect(groups[0].subscriptions.map((s) => s.id)).toEqual([1, 3]);
    expect(groups[1].subscriptions.map((s) => s.id)).toEqual([2]);
  });

  it("carries email and full_name onto the group from the first row of that user", () => {
    const rows: AdminSubscriptionRow[] = [
      mkRow({ id: 1, user_id: "a", user_email: "a@x.com", user_full_name: "Alex" }),
      mkRow({ id: 2, user_id: "a", user_email: "a@x.com", user_full_name: "Alex" }),
    ];
    const [group] = groupByUser(rows);
    expect(group.user_email).toBe("a@x.com");
    expect(group.user_full_name).toBe("Alex");
  });
});

describe("summarizeStatuses", () => {
  it("counts each subscription status separately", () => {
    const rows: AdminSubscriptionRow[] = [
      mkRow({ id: 1, user_id: "a", user_email: "a@x.com", status: "active" }),
      mkRow({ id: 2, user_id: "a", user_email: "a@x.com", status: "active" }),
      mkRow({ id: 3, user_id: "a", user_email: "a@x.com", status: "pending" }),
      mkRow({ id: 4, user_id: "a", user_email: "a@x.com", status: "expired" }),
    ];
    expect(summarizeStatuses(rows)).toEqual({
      active: 2,
      pending: 1,
      rejected: 0,
      expired: 1,
      revoked: 0,
    });
  });

  it("returns zero counts for an empty input", () => {
    expect(summarizeStatuses([])).toEqual({
      active: 0,
      pending: 0,
      rejected: 0,
      expired: 0,
      revoked: 0,
    });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test -- admin-subscriptions.test.ts`
Expected: FAIL with "Cannot find module './admin-subscriptions'".

- [ ] **Step 3: Implement the module**

Create `lib/admin-subscriptions.ts`:

```ts
import type { Product } from "./products";
import type {
  LicenseTier,
  SubscriptionStatus,
} from "./types";

export interface AdminLicenseSlot {
  id: number;
  license_key: string;
  mt5_account: number;
  broker_name: string | null;
  intended_account_type: "live" | "demo" | "contest" | null;
  status: "active" | "revoked" | "expired";
  last_validated_at: string | null;
  activated_at: string | null;
}

export interface AdminSubscriptionRow {
  id: number;
  user_id: string;
  user_email: string;
  user_full_name: string | null;
  product: Product;
  tier: LicenseTier;
  status: SubscriptionStatus;
  expires_at: string | null;
  created_at: string;
  hidden_at: string | null;
  propfirm_rule_name: string | null;
  live_license: AdminLicenseSlot | null;
  demo_license: AdminLicenseSlot | null;
}

export interface AdminUserGroup {
  user_id: string;
  user_email: string;
  user_full_name: string | null;
  subscriptions: AdminSubscriptionRow[];
}

export type StatusCounts = Record<SubscriptionStatus, number>;

export function groupByUser(
  rows: AdminSubscriptionRow[],
): AdminUserGroup[] {
  const byId = new Map<string, AdminUserGroup>();
  const order: string[] = [];
  for (const row of rows) {
    let group = byId.get(row.user_id);
    if (!group) {
      group = {
        user_id: row.user_id,
        user_email: row.user_email,
        user_full_name: row.user_full_name,
        subscriptions: [],
      };
      byId.set(row.user_id, group);
      order.push(row.user_id);
    }
    group.subscriptions.push(row);
  }
  return order.map((id) => byId.get(id)!);
}

export function summarizeStatuses(
  rows: AdminSubscriptionRow[],
): StatusCounts {
  const counts: StatusCounts = {
    active: 0,
    pending: 0,
    rejected: 0,
    expired: 0,
    revoked: 0,
  };
  for (const row of rows) {
    counts[row.status]++;
  }
  return counts;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test -- admin-subscriptions.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/admin-subscriptions.ts lib/admin-subscriptions.test.ts
git commit -m "feat(admin): types + groupByUser + summarizeStatuses helpers"
```

---

## Task 4: filterRows helper

**Files:**
- Modify: `lib/admin-subscriptions.ts`
- Modify: `lib/admin-subscriptions.test.ts`

- [ ] **Step 1: Append failing tests**

Append to `lib/admin-subscriptions.test.ts`:

```ts
import { filterRows } from "./admin-subscriptions";

function mt5Row(overrides: Partial<AdminSubscriptionRow> & { id: number }): AdminSubscriptionRow {
  return mkRow({
    user_id: "u",
    user_email: "alex@trader.com",
    user_full_name: "Alex Trader",
    ...overrides,
  });
}

describe("filterRows", () => {
  const rows: AdminSubscriptionRow[] = [
    mt5Row({
      id: 1,
      status: "active",
      product: "impulse",
      live_license: {
        id: 10,
        license_key: "IMPX-AAAA-BBBB-CCCC-DDDD",
        mt5_account: 531290109,
        broker_name: "FTMO",
        intended_account_type: "live",
        status: "active",
        last_validated_at: null,
        activated_at: "2026-01-01T00:00:00Z",
      },
    }),
    mt5Row({
      id: 2,
      status: "pending",
      product: "scalper",
      live_license: null,
    }),
  ];

  it("returns all rows when the filter is empty", () => {
    expect(
      filterRows(rows, { search: "", statuses: [], products: [] }).map((r) => r.id),
    ).toEqual([1, 2]);
  });

  it("filters by status", () => {
    expect(
      filterRows(rows, { search: "", statuses: ["active"], products: [] }).map(
        (r) => r.id,
      ),
    ).toEqual([1]);
  });

  it("filters by product", () => {
    expect(
      filterRows(rows, { search: "", statuses: [], products: ["scalper"] }).map(
        (r) => r.id,
      ),
    ).toEqual([2]);
  });

  it("matches search against email", () => {
    expect(
      filterRows(rows, { search: "alex@", statuses: [], products: [] }).map(
        (r) => r.id,
      ),
    ).toEqual([1, 2]);
  });

  it("matches search against license key (case-insensitive)", () => {
    expect(
      filterRows(rows, { search: "impx", statuses: [], products: [] }).map(
        (r) => r.id,
      ),
    ).toEqual([1]);
  });

  it("matches search against MT5 account number", () => {
    expect(
      filterRows(rows, { search: "531290109", statuses: [], products: [] }).map(
        (r) => r.id,
      ),
    ).toEqual([1]);
  });

  it("matches search against full_name", () => {
    expect(
      filterRows(rows, { search: "Trader", statuses: [], products: [] }).map(
        (r) => r.id,
      ),
    ).toEqual([1, 2]);
  });

  it("AND-combines status and search", () => {
    expect(
      filterRows(rows, { search: "alex@", statuses: ["pending"], products: [] }).map(
        (r) => r.id,
      ),
    ).toEqual([2]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test -- admin-subscriptions.test.ts`
Expected: FAIL with `filterRows` undefined / no export.

- [ ] **Step 3: Implement filterRows**

Append to `lib/admin-subscriptions.ts`:

```ts
export interface AdminSubsFilterState {
  search: string;
  statuses: SubscriptionStatus[];
  products: Product[];
}

function matchesSearch(row: AdminSubscriptionRow, q: string): boolean {
  if (q.length === 0) return true;
  const needle = q.toLowerCase();
  const haystacks: string[] = [
    row.user_email,
    row.user_full_name ?? "",
    row.product,
    row.tier,
    row.status,
    row.live_license?.license_key ?? "",
    row.demo_license?.license_key ?? "",
    row.live_license ? String(row.live_license.mt5_account) : "",
    row.demo_license ? String(row.demo_license.mt5_account) : "",
    row.live_license?.broker_name ?? "",
    row.demo_license?.broker_name ?? "",
  ];
  return haystacks.some((h) => h.toLowerCase().includes(needle));
}

export function filterRows(
  rows: AdminSubscriptionRow[],
  state: AdminSubsFilterState,
): AdminSubscriptionRow[] {
  return rows.filter((row) => {
    if (state.statuses.length > 0 && !state.statuses.includes(row.status)) {
      return false;
    }
    if (state.products.length > 0 && !state.products.includes(row.product)) {
      return false;
    }
    if (!matchesSearch(row, state.search.trim())) return false;
    return true;
  });
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test -- admin-subscriptions.test.ts`
Expected: PASS, 13 tests (5 from Task 3 + 8 new).

- [ ] **Step 5: Commit**

```bash
git add lib/admin-subscriptions.ts lib/admin-subscriptions.test.ts
git commit -m "feat(admin): filterRows helper with status/product/search matching"
```

---

## Task 5: paginateGroups helper

**Files:**
- Modify: `lib/admin-subscriptions.ts`
- Modify: `lib/admin-subscriptions.test.ts`

- [ ] **Step 1: Append failing tests**

Append to `lib/admin-subscriptions.test.ts`:

```ts
import { paginateGroups } from "./admin-subscriptions";

describe("paginateGroups", () => {
  const groups: AdminUserGroup[] = Array.from({ length: 23 }, (_, i) => ({
    user_id: `u${i + 1}`,
    user_email: `u${i + 1}@x.com`,
    user_full_name: null,
    subscriptions: [
      mkRow({ id: 1000 + i, user_id: `u${i + 1}`, user_email: `u${i + 1}@x.com` }),
    ],
  }));

  it("returns the first N groups on page 1", () => {
    const result = paginateGroups(groups, { page: 1, pageSize: 10 });
    expect(result.groups.map((g) => g.user_id)).toEqual(
      Array.from({ length: 10 }, (_, i) => `u${i + 1}`),
    );
    expect(result.page).toBe(1);
    expect(result.totalPages).toBe(3);
    expect(result.totalGroups).toBe(23);
  });

  it("returns the second page", () => {
    const result = paginateGroups(groups, { page: 2, pageSize: 10 });
    expect(result.groups.map((g) => g.user_id)).toEqual(
      Array.from({ length: 10 }, (_, i) => `u${i + 11}`),
    );
  });

  it("returns the partial last page", () => {
    const result = paginateGroups(groups, { page: 3, pageSize: 10 });
    expect(result.groups.map((g) => g.user_id)).toEqual(["u21", "u22", "u23"]);
  });

  it("clamps requested page above totalPages to the last page", () => {
    const result = paginateGroups(groups, { page: 99, pageSize: 10 });
    expect(result.page).toBe(3);
    expect(result.groups.map((g) => g.user_id)).toEqual(["u21", "u22", "u23"]);
  });

  it("clamps requested page below 1 to page 1", () => {
    const result = paginateGroups(groups, { page: 0, pageSize: 10 });
    expect(result.page).toBe(1);
  });

  it("totalPages is 1 when there are zero groups", () => {
    const result = paginateGroups([], { page: 1, pageSize: 10 });
    expect(result).toEqual({
      groups: [],
      page: 1,
      totalPages: 1,
      totalGroups: 0,
    });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test -- admin-subscriptions.test.ts`
Expected: FAIL with `paginateGroups` undefined.

- [ ] **Step 3: Implement paginateGroups**

Append to `lib/admin-subscriptions.ts`:

```ts
export interface PaginatedGroups {
  groups: AdminUserGroup[];
  page: number;
  totalPages: number;
  totalGroups: number;
}

export function paginateGroups(
  groups: AdminUserGroup[],
  opts: { page: number; pageSize: number },
): PaginatedGroups {
  const totalGroups = groups.length;
  const totalPages = Math.max(1, Math.ceil(totalGroups / opts.pageSize));
  const clamped = Math.min(Math.max(1, opts.page), totalPages);
  const start = (clamped - 1) * opts.pageSize;
  const end = start + opts.pageSize;
  return {
    groups: groups.slice(start, end),
    page: clamped,
    totalPages,
    totalGroups,
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test -- admin-subscriptions.test.ts`
Expected: PASS, 19 tests (13 prior + 6 new).

- [ ] **Step 5: Commit**

```bash
git add lib/admin-subscriptions.ts lib/admin-subscriptions.test.ts
git commit -m "feat(admin): paginateGroups helper with clamping + totals"
```

---

## Task 6: Extend DashboardPagination with page-size selector

**Files:**
- Modify: `components/user/dashboard-pagination.tsx`

The component stays backwards-compatible: existing callers pass only `page`, `totalPages`, `onChange` and see no UI change. Admin callers additionally pass `pageSize`, `pageSizeOptions`, and `onPageSizeChange`.

- [ ] **Step 1: Replace the component body**

Replace the entire contents of `components/user/dashboard-pagination.tsx` with:

```tsx
"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface Props {
  page: number;
  totalPages: number;
  onChange: (p: number) => void;
  pageSize?: number;
  pageSizeOptions?: readonly number[];
  onPageSizeChange?: (size: number) => void;
}

export function DashboardPagination({
  page,
  totalPages,
  onChange,
  pageSize,
  pageSizeOptions,
  onPageSizeChange,
}: Props) {
  const showSelector =
    pageSize !== undefined &&
    pageSizeOptions !== undefined &&
    onPageSizeChange !== undefined;

  if (totalPages <= 1 && !showSelector) return null;

  return (
    <div className="flex items-center justify-center gap-3 pt-2 text-sm text-muted-foreground">
      {showSelector && (
        <div className="mr-auto flex items-center gap-2">
          <span>Show</span>
          <Select
            value={String(pageSize)}
            onValueChange={(v) => onPageSizeChange(Number(v))}
          >
            <SelectTrigger className="h-8 w-[80px]" aria-label="Rows per page">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {pageSizeOptions.map((opt) => (
                <SelectItem key={opt} value={String(opt)}>
                  {opt}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span>per page</span>
        </div>
      )}
      <Button
        type="button"
        size="sm"
        variant="ghost"
        className="h-8 gap-1"
        onClick={() => onChange(page - 1)}
        disabled={page <= 1}
        aria-label="Previous page"
      >
        <ChevronLeft className="h-4 w-4" aria-hidden />
        Prev
      </Button>
      <span>
        Page <span className="font-medium text-foreground">{page}</span> of{" "}
        {totalPages}
      </span>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        className="h-8 gap-1"
        onClick={() => onChange(page + 1)}
        disabled={page >= totalPages}
        aria-label="Next page"
      >
        Next
        <ChevronRight className="h-4 w-4" aria-hidden />
      </Button>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm exec tsc --noEmit`
Expected: PASS — no new errors. Existing `DashboardCardGrid` callers omit the new props and keep working.

- [ ] **Step 3: Run the existing test suite**

Run: `pnpm test`
Expected: PASS — all tests green.

- [ ] **Step 4: Commit**

```bash
git add components/user/dashboard-pagination.tsx
git commit -m "feat(ui): DashboardPagination supports optional page-size selector"
```

---

## Task 7: Server data fetcher for /admin/subscriptions

**Files:**
- Modify: `lib/admin-subscriptions.ts`

The page component will call this from the server. It returns rows shaped exactly like `AdminSubscriptionRow`, with all joins resolved.

- [ ] **Step 1: Append the fetcher**

Append to `lib/admin-subscriptions.ts`:

```ts
import "server-only";
import { getSupabaseAdmin } from "./supabase/server";

interface RawSubscriptionRow {
  id: number;
  user_id: string;
  product: Product;
  tier: LicenseTier;
  status: SubscriptionStatus;
  expires_at: string | null;
  created_at: string;
  hidden_at: string | null;
  users: { email: string; full_name: string | null } | null;
  propfirm_rules: { name: string } | null;
  licenses: {
    id: number;
    license_key: string;
    mt5_account: number;
    broker_name: string | null;
    intended_account_type: "live" | "demo" | "contest" | null;
    status: "active" | "revoked" | "expired";
    last_validated_at: string | null;
    activated_at: string | null;
  }[];
}

function rawToRow(raw: RawSubscriptionRow): AdminSubscriptionRow {
  const live =
    raw.licenses.find((l) => l.intended_account_type === "live") ?? null;
  const demo =
    raw.licenses.find((l) => l.intended_account_type === "demo") ?? null;
  return {
    id: raw.id,
    user_id: raw.user_id,
    user_email: raw.users?.email ?? "(unknown)",
    user_full_name: raw.users?.full_name ?? null,
    product: raw.product,
    tier: raw.tier,
    status: raw.status,
    expires_at: raw.expires_at,
    created_at: raw.created_at,
    hidden_at: raw.hidden_at,
    propfirm_rule_name: raw.propfirm_rules?.name ?? null,
    live_license: live,
    demo_license: demo,
  };
}

export async function fetchAdminSubscriptions(): Promise<AdminSubscriptionRow[]> {
  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .from("subscriptions")
    .select(
      `
      id, user_id, product, tier, status, expires_at, created_at, hidden_at,
      users:users!subscriptions_user_id_fkey ( email, full_name ),
      propfirm_rules:propfirm_rules!subscriptions_propfirm_rule_id_fkey ( name ),
      licenses:licenses!licenses_subscription_id_fkey (
        id, license_key, mt5_account, broker_name, intended_account_type,
        status, last_validated_at, activated_at
      )
      `,
    )
    .order("created_at", { ascending: false });
  if (error) {
    console.error("fetchAdminSubscriptions failed:", error);
    return [];
  }
  return (data as unknown as RawSubscriptionRow[]).map(rawToRow);
}
```

> Foreign-key alias names follow the existing schema's naming. If `select(...)` returns shape errors at runtime, confirm constraint names by running `select conname from pg_constraint where conrelid = 'subscriptions'::regclass;` against the Supabase project, then adjust the alias strings. The expected aliases are `subscriptions_user_id_fkey`, `subscriptions_propfirm_rule_id_fkey`, and `licenses_subscription_id_fkey`.

- [ ] **Step 2: Typecheck**

Run: `pnpm exec tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add lib/admin-subscriptions.ts
git commit -m "feat(admin): fetchAdminSubscriptions server query with joins"
```

---

## Task 8: New /admin/subscriptions page (server component)

**Files:**
- Create: `app/admin/subscriptions/page.tsx`

- [ ] **Step 1: Create the server page**

Create `app/admin/subscriptions/page.tsx`:

```tsx
import Link from "next/link";
import { AdminSiteNav } from "@/components/admin/admin-site-nav";
import { Button } from "@/components/ui/button";
import { SubscriptionTable } from "@/components/admin/subscription-table";
import { fetchAdminSubscriptions } from "@/lib/admin-subscriptions";

export const dynamic = "force-dynamic";

export default async function AdminSubscriptionsPage() {
  const rows = await fetchAdminSubscriptions();
  const userCount = new Set(rows.map((r) => r.user_id)).size;

  return (
    <div className="min-h-screen">
      <AdminSiteNav />
      <main className="mx-auto max-w-6xl px-6 py-8">
        <div className="mb-6 flex items-end justify-between">
          <div>
            <h1 className="text-2xl font-semibold">Subscriptions</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {rows.length} {rows.length === 1 ? "subscription" : "subscriptions"} · {userCount}{" "}
              {userCount === 1 ? "user" : "users"}
            </p>
          </div>
          <Button asChild>
            <Link href="/admin/subscriptions/new">+ Create subscription</Link>
          </Button>
        </div>
        <SubscriptionTable rows={rows} />
      </main>
    </div>
  );
}
```

- [ ] **Step 2: Verify the page route compiles even though the component is missing**

Run: `pnpm exec tsc --noEmit`
Expected: ERROR — "Cannot find module '@/components/admin/subscription-table'". Expected; we build it next.

- [ ] **Step 3: Commit (failing build is OK at this checkpoint — next task fixes it)**

```bash
git add app/admin/subscriptions/page.tsx
git commit -m "feat(admin): /admin/subscriptions server page (wires table component next)"
```

---

## Task 9: SubscriptionTable client component

**Files:**
- Create: `components/admin/subscription-table.tsx`

This is a large component; it is broken into one big write step for readability. No new logic — it only composes the helpers and constants built in Tasks 1–7.

**Row actions deferred:** The spec mentions a per-row ⋯ menu mirroring `UserSubscriptionsPanel` actions (approve / reject / revoke / edit). In this iteration, rows are read-only and the path to actions is **group header → user detail page**, which already wires those actions via `UserSubscriptionsPanel`. This keeps the new page focused on listing/discovery. A follow-up plan can add inline actions once usage shows it's worth duplicating the dialog wiring.

- [ ] **Step 1: Create the component**

Create `components/admin/subscription-table.tsx`:

```tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { format, parseISO } from "date-fns";
import { ChevronDown, ChevronRight, EyeOff } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DashboardPagination } from "@/components/user/dashboard-pagination";
import {
  ADMIN_SUBS_PAGE_SIZE_DEFAULT,
  ADMIN_SUBS_PAGE_SIZE_OPTIONS,
  type AdminSubsPageSize,
} from "@/lib/dashboard-filters";
import {
  getAdminSubsPageSize,
  setAdminSubsPageSize,
} from "@/lib/admin-settings";
import {
  filterRows,
  groupByUser,
  paginateGroups,
  summarizeStatuses,
  type AdminLicenseSlot,
  type AdminSubscriptionRow,
  type AdminSubsFilterState,
} from "@/lib/admin-subscriptions";
import { PRODUCT_CODES } from "@/lib/products";
import { productLabel, tierLabel } from "@/lib/users";
import type { SubscriptionStatus } from "@/lib/types";

const STATUS_OPTIONS: SubscriptionStatus[] = [
  "active",
  "pending",
  "expired",
  "rejected",
  "revoked",
];

const STATUS_BADGE: Record<SubscriptionStatus, string> = {
  active: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  pending: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  expired: "bg-muted text-muted-foreground",
  rejected: "bg-rose-500/15 text-rose-700 dark:text-rose-300",
  revoked: "bg-rose-500/15 text-rose-700 dark:text-rose-300",
};

function SlotCell({ slot, kind }: { slot: AdminLicenseSlot | null; kind: "LIVE" | "DEMO" }) {
  if (!slot) {
    return <span className="text-xs text-muted-foreground">— no {kind.toLowerCase()} slot —</span>;
  }
  return (
    <Link
      href={`/admin/licenses/${slot.id}`}
      className="flex items-center gap-2 font-mono text-xs hover:underline"
    >
      <span
        className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
          kind === "LIVE"
            ? "bg-sky-500/15 text-sky-700 dark:text-sky-300"
            : "bg-muted text-muted-foreground"
        }`}
      >
        {kind}
      </span>
      <span>{slot.mt5_account}</span>
      {slot.broker_name && <span className="text-muted-foreground">· {slot.broker_name}</span>}
    </Link>
  );
}

export function SubscriptionTable({ rows }: { rows: AdminSubscriptionRow[] }) {
  const [filter, setFilter] = useState<AdminSubsFilterState>({
    search: "",
    statuses: [],
    products: [],
  });
  const [pageSize, setPageSize] = useState<number>(ADMIN_SUBS_PAGE_SIZE_DEFAULT);
  const [page, setPage] = useState(1);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  useEffect(() => {
    setPageSize(getAdminSubsPageSize());
  }, []);

  // Reset to page 1 whenever filters change.
  useEffect(() => {
    setPage(1);
  }, [filter.search, filter.statuses, filter.products, pageSize]);

  const filtered = useMemo(() => filterRows(rows, filter), [rows, filter]);
  const groups = useMemo(() => groupByUser(filtered), [filtered]);
  const paged = useMemo(
    () => paginateGroups(groups, { page, pageSize }),
    [groups, page, pageSize],
  );
  const subsOnPage = useMemo(
    () => paged.groups.reduce((sum, g) => sum + g.subscriptions.length, 0),
    [paged],
  );

  function toggleStatus(s: SubscriptionStatus) {
    setFilter((f) => ({
      ...f,
      statuses: f.statuses.includes(s) ? f.statuses.filter((x) => x !== s) : [...f.statuses, s],
    }));
  }

  function toggleCollapsed(userId: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  }

  function onPageSizeChange(size: number) {
    setPageSize(size);
    setAdminSubsPageSize(size as AdminSubsPageSize);
  }

  const rangeStart = paged.totalGroups === 0 ? 0 : (paged.page - 1) * pageSize + 1;
  const rangeEnd = Math.min(paged.page * pageSize, paged.totalGroups);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          placeholder="Search by email, name, product, or MT5…"
          className="flex-1 min-w-[240px]"
          value={filter.search}
          onChange={(e) => setFilter({ ...filter, search: e.target.value })}
        />
        <Select
          value={filter.statuses[0] ?? "all"}
          onValueChange={(v) =>
            setFilter({ ...filter, statuses: v === "all" ? [] : [v as SubscriptionStatus] })
          }
        >
          <SelectTrigger className="w-[140px]" aria-label="Status filter">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {STATUS_OPTIONS.map((s) => (
              <SelectItem key={s} value={s} onClick={() => toggleStatus(s)}>
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={filter.products[0] ?? "all"}
          onValueChange={(v) =>
            setFilter({
              ...filter,
              products: v === "all" ? [] : [v as (typeof PRODUCT_CODES)[number]],
            })
          }
        >
          <SelectTrigger className="w-[160px]" aria-label="Product filter">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All products</SelectItem>
            {PRODUCT_CODES.map((p) => (
              <SelectItem key={p} value={p}>
                {productLabel(p)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="rounded-md border">
        <table className="w-full text-sm">
          <thead className="border-b text-xs text-muted-foreground">
            <tr>
              <th className="w-8 px-2 py-2"></th>
              <th className="px-2 py-2 text-left">Status</th>
              <th className="px-2 py-2 text-left">Product · Tier</th>
              <th className="px-2 py-2 text-left">MT5 slots</th>
              <th className="px-2 py-2 text-left">Expires</th>
            </tr>
          </thead>
          <tbody>
            {paged.groups.length === 0 && (
              <tr>
                <td colSpan={5} className="px-2 py-6 text-center text-muted-foreground">
                  No subscriptions match the current filters.
                </td>
              </tr>
            )}
            {paged.groups.map((group) => {
              const isCollapsed = collapsed.has(group.user_id);
              const counts = summarizeStatuses(group.subscriptions);
              return (
                <GroupRows
                  key={group.user_id}
                  group={group}
                  isCollapsed={isCollapsed}
                  counts={counts}
                  onToggle={() => toggleCollapsed(group.user_id)}
                />
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between gap-3 pt-2 text-xs text-muted-foreground">
        <span>
          {paged.totalGroups === 0
            ? "No users to show"
            : `Showing users ${rangeStart}–${rangeEnd} of ${paged.totalGroups} · ${subsOnPage} subscription${
                subsOnPage === 1 ? "" : "s"
              } on this page`}
        </span>
        <DashboardPagination
          page={paged.page}
          totalPages={paged.totalPages}
          onChange={setPage}
          pageSize={pageSize}
          pageSizeOptions={ADMIN_SUBS_PAGE_SIZE_OPTIONS}
          onPageSizeChange={onPageSizeChange}
        />
      </div>
    </div>
  );
}

function GroupRows({
  group,
  isCollapsed,
  counts,
  onToggle,
}: {
  group: ReturnType<typeof groupByUser>[number];
  isCollapsed: boolean;
  counts: ReturnType<typeof summarizeStatuses>;
  onToggle: () => void;
}) {
  const chips: { label: string; n: number; cls: string }[] = [
    { label: "active", n: counts.active, cls: STATUS_BADGE.active },
    { label: "pending", n: counts.pending, cls: STATUS_BADGE.pending },
    { label: "expired", n: counts.expired, cls: STATUS_BADGE.expired },
    { label: "rejected", n: counts.rejected, cls: STATUS_BADGE.rejected },
    { label: "revoked", n: counts.revoked, cls: STATUS_BADGE.revoked },
  ].filter((c) => c.n > 0);

  return (
    <>
      <tr className="border-t bg-muted/40">
        <td className="px-2 py-2">
          <button
            type="button"
            onClick={onToggle}
            aria-label={isCollapsed ? "Expand group" : "Collapse group"}
            className="text-muted-foreground hover:text-foreground"
          >
            {isCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
        </td>
        <td colSpan={4} className="px-2 py-2">
          <div className="flex items-center justify-between gap-2">
            <div>
              <Link href={`/admin/users/${group.user_id}`} className="font-medium hover:underline">
                {group.user_email}
              </Link>
              <span className="ml-2 text-xs text-muted-foreground">
                {group.user_full_name ? `${group.user_full_name} · ` : ""}
                {group.subscriptions.length}{" "}
                {group.subscriptions.length === 1 ? "subscription" : "subscriptions"}
              </span>
            </div>
            <div className="flex items-center gap-1">
              {chips.map((c) => (
                <span key={c.label} className={`rounded-full px-2 py-0.5 text-[11px] ${c.cls}`}>
                  {c.n} {c.label}
                </span>
              ))}
            </div>
          </div>
        </td>
      </tr>
      {!isCollapsed &&
        group.subscriptions.map((sub) => (
          <tr key={sub.id} className="border-t">
            <td className="px-2 py-2"></td>
            <td className="px-2 py-2">
              <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_BADGE[sub.status]}`}>
                {sub.status}
              </span>
              {sub.hidden_at && (
                <EyeOff className="ml-1 inline h-3 w-3 text-muted-foreground" aria-label="Hidden by user" />
              )}
            </td>
            <td className="px-2 py-2">
              <span className="font-medium">{productLabel(sub.product)}</span>{" "}
              <span className="text-xs text-muted-foreground">· {tierLabel(sub.tier)}</span>
            </td>
            <td className="px-2 py-2 space-y-1">
              <SlotCell slot={sub.live_license} kind="LIVE" />
              <SlotCell slot={sub.demo_license} kind="DEMO" />
            </td>
            <td className="px-2 py-2 text-xs">
              {sub.expires_at ? format(parseISO(sub.expires_at), "yyyy-MM-dd") : "—"}
            </td>
          </tr>
        ))}
    </>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm exec tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Lint**

Run: `pnpm lint`
Expected: PASS.

- [ ] **Step 4: Visual smoke test**

Run: `pnpm dev`
Navigate to `http://localhost:3000/admin/subscriptions` (sign in as admin first if needed).
Expected: page renders with one group header per user, expand/collapse works, status filter applies, page-size dropdown shows 10/25/50/100, refreshing the page preserves the last-selected page size.

Quit dev server before continuing.

- [ ] **Step 5: Commit**

```bash
git add components/admin/subscription-table.tsx
git commit -m "feat(admin): SubscriptionTable client component (grouped + paginated)"
```

---

## Task 10: Swap admin nav order and brand link

**Files:**
- Modify: `components/site-nav.tsx`

- [ ] **Step 1: Edit the brand link target**

In `components/site-nav.tsx`, change the brand `<Link href="/admin/licenses">` near the top of the header to:

```tsx
<Link
  href="/admin/subscriptions"
  className="flex items-center gap-3 transition-opacity hover:opacity-80"
>
```

- [ ] **Step 2: Reorder the nav links**

Inside the `<nav className="ml-auto flex items-center gap-5 text-sm">` block, replace the entire ordered list of `<Link>` entries with this order — Subscriptions first, then Users, Requests, Licenses, Settings, Propfirm Rules:

```tsx
<Link
  href="/admin/subscriptions"
  className={linkClass("/admin/subscriptions")}
  aria-current={pathname?.startsWith("/admin/subscriptions") ? "page" : undefined}
>
  Subscriptions
</Link>
<Link
  href="/admin/users"
  className={linkClass("/admin/users")}
  aria-current={pathname?.startsWith("/admin/users") ? "page" : undefined}
>
  Users
</Link>
<Link
  href="/admin/requests"
  className={linkClass("/admin/requests")}
  aria-current={pathname?.startsWith("/admin/requests") ? "page" : undefined}
>
  Requests
  {pendingRequestsCount > 0 && (
    <span className="ml-1 inline-flex items-center justify-center rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400 text-xs px-1.5 py-0.5">
      {pendingRequestsCount}
    </span>
  )}
</Link>
<Link
  href="/admin/licenses"
  className={linkClass("/admin/licenses")}
  aria-current={pathname?.startsWith("/admin/licenses") ? "page" : undefined}
>
  Licenses
</Link>
<Link
  href="/admin/settings"
  className={linkClass("/admin/settings")}
  aria-current={pathname?.startsWith("/admin/settings") ? "page" : undefined}
>
  Settings
</Link>
<Link
  href="/admin/propfirm-rules"
  className={linkClass("/admin/propfirm-rules")}
  aria-current={pathname?.startsWith("/admin/propfirm-rules") ? "page" : undefined}
>
  Propfirm Rules
</Link>
```

- [ ] **Step 3: Visual smoke test**

Run: `pnpm dev`. Visit `/admin/anything` and confirm the nav reads **Subscriptions · Users · Requests · Licenses · Settings · Propfirm Rules**, and that clicking the brand logo lands on `/admin/subscriptions`. Quit dev server.

- [ ] **Step 4: Commit**

```bash
git add components/site-nav.tsx
git commit -m "feat(admin): make Subscriptions the primary nav entry"
```

---

## Task 11: Resolve owner email on the Licenses ops page

**Files:**
- Modify: `app/admin/licenses/page.tsx`
- Modify: `app/api/licenses/route.ts`
- Modify: `components/license-table.tsx`

This task does NOT yet remove the `License.customer_email` TypeScript field — that comes in Task 12 so each step stays atomic. Here we just add an `ownerEmail` field projected through the subscription→user join and switch the table to display it.

- [ ] **Step 1: Update the server page**

Replace the contents of `app/admin/licenses/page.tsx` with:

```tsx
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { LicenseTable, type LicenseRow } from "@/components/license-table";
import { AdminSiteNav } from "@/components/admin/admin-site-nav";

export const dynamic = "force-dynamic";

interface RawLicenseWithOwner {
  id: number;
  license_key: string;
  mt5_account: number;
  product: string;
  subscription_id: number | null;
  user_id: string | null;
  status: "active" | "revoked" | "expired";
  tier: string | null;
  expires_at: string | null;
  activated_at: string | null;
  purchase_date: string | null;
  last_validated_at: string | null;
  broker_name: string | null;
  account_type: string | null;
  intended_account_type: string | null;
  notes: string | null;
  created_at: string;
  subscriptions:
    | { users: { email: string } | null }
    | null;
}

async function fetchLicensesWithOwner(): Promise<LicenseRow[]> {
  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .from("licenses")
    .select(
      `
      *,
      subscriptions:subscriptions!licenses_subscription_id_fkey (
        users:users!subscriptions_user_id_fkey ( email )
      )
      `,
    )
    .order("created_at", { ascending: false });
  if (error) {
    console.error("Failed to fetch licenses:", error);
    return [];
  }
  return (data as unknown as RawLicenseWithOwner[]).map((r) => ({
    ...r,
    owner_email: r.subscriptions?.users?.email ?? null,
  })) as LicenseRow[];
}

export default async function LicensesPage() {
  const licenses = await fetchLicensesWithOwner();
  return (
    <div className="min-h-screen">
      <AdminSiteNav />
      <main className="mx-auto max-w-6xl px-6 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold">Licenses <span className="text-muted-foreground text-base font-normal">(ops)</span></h1>
          <p className="mt-1 text-sm text-muted-foreground">
            EA-side view — use <a className="underline" href="/admin/subscriptions">Subscriptions</a> to manage entitlements.
            {" "}{licenses.length} {licenses.length === 1 ? "license" : "licenses"} total.
          </p>
        </div>
        <LicenseTable initialLicenses={licenses} />
      </main>
    </div>
  );
}
```

- [ ] **Step 2: Update the polling endpoint**

Replace the body of `app/api/licenses/route.ts` with:

```ts
import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/server";

export async function GET() {
  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .from("licenses")
    .select(
      `
      *,
      subscriptions:subscriptions!licenses_subscription_id_fkey (
        users:users!subscriptions_user_id_fkey ( email )
      )
      `,
    )
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json(
      { error: "lookup_failed", details: error.message },
      { status: 500 },
    );
  }
  const licenses = (data ?? []).map((r) => {
    const owner_email =
      (r as { subscriptions: { users: { email: string } | null } | null }).subscriptions?.users
        ?.email ?? null;
    const { subscriptions: _drop, ...rest } = r as Record<string, unknown> & {
      subscriptions?: unknown;
    };
    return { ...rest, owner_email };
  });
  return NextResponse.json({ licenses });
}
```

- [ ] **Step 3: Update the LicenseTable component**

Open `components/license-table.tsx` and apply these three changes:

(a) At the top of the file, just below the existing imports for `License` and `LivenessState`, export a row type that extends `License` with the joined field. Replace this import block:

```tsx
import type { License, LivenessState } from "@/lib/types";
```

with:

```tsx
import type { License, LivenessState } from "@/lib/types";

export type LicenseRow = License & { owner_email: string | null };
```

(b) Change the component's prop and state types from `License` to `LicenseRow`. Wherever you see `License[]` in this file's typing (component prop `initialLicenses: License[]`, `useState<License[]>(initialLicenses)`, the `setLicenses` callback's parameter, and the `json.licenses` cast inside `refetch`), use `LicenseRow[]` instead. Also replace `useState<License | null>` (for `revokeTarget` and `deleteTarget`) with `useState<LicenseRow | null>`.

(c) In the search filter (around line 122 today, inside `rows = useMemo(...)`), replace:

```tsx
(license.customer_email ?? "").toLowerCase().includes(q)
```

with:

```tsx
(license.owner_email ?? "").toLowerCase().includes(q)
```

And in the rendered row (around line 290 today), find the cell that renders `{l.customer_email ?? (` and replace `l.customer_email` with `l.owner_email`. Update the column header text from "Customer Email" to "Owner".

(d) Remove the "Create subscription" button from the toolbar. Search the file for `Create subscription` and delete the surrounding `<Button>` / `<Link>` block plus the `Plus` icon import if it becomes unused.

- [ ] **Step 4: Typecheck**

Run: `pnpm exec tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Run all tests**

Run: `pnpm test`
Expected: PASS — existing tests still pass; `customer_email` is still present on the `License` type so `liveness.test.ts` and `schemas.test.ts` continue to compile.

- [ ] **Step 6: Visual smoke**

Run `pnpm dev`, navigate to `/admin/licenses`. Expected: title reads "Licenses (ops)", the "Create subscription" button is gone, the Owner column shows the email joined through the subscription instead of the old `customer_email`. Quit dev.

- [ ] **Step 7: Commit**

```bash
git add app/admin/licenses/page.tsx app/api/licenses/route.ts components/license-table.tsx
git commit -m "feat(admin): resolve license Owner via subscription join + reframe ops view"
```

---

## Task 12: Drop `customer_email` from TypeScript surface

**Files:**
- Modify: `lib/types.ts`
- Modify: `lib/schemas.ts`
- Modify: `lib/schemas.test.ts`
- Modify: `lib/liveness.test.ts`
- Modify: `components/license-form.tsx`

This task drops the field from app code so it is no longer read or written. The DB column is dropped in Task 13. Order matters: once the column is gone, anything still referencing `customer_email` would 500 — that is why the code change comes first.

- [ ] **Step 1: Remove `customer_email` from the `License` type**

In `lib/types.ts`, delete the line:

```ts
  customer_email: string | null;
```

- [ ] **Step 2: Remove from create/update schemas**

In `lib/schemas.ts`, delete the line `customer_email: optionalEmail,` from both `createLicenseSchema` and `updateLicenseSchema`. If `optionalEmail` is now unused (search the file), remove its import/definition too.

- [ ] **Step 3: Remove from schema tests**

In `lib/schemas.test.ts`, do the following:
- Delete the line `customer_email: "test@example.com",` from any fixture object.
- Delete the entire `it("accepts empty/missing customer_email", ...)` test (around line 133).
- Delete the entire `it("rejects invalid customer_email format", ...)` test (around line 153).

- [ ] **Step 4: Remove from liveness fixture**

In `lib/liveness.test.ts`, delete the line `customer_email: null,` from the License fixture (around line 16).

- [ ] **Step 5: Remove from the license form**

In `components/license-form.tsx`:
- Remove the `customer_email` zod field from the form schema (around line 50).
- Remove `customer_email: initial?.customer_email ?? "",` from the `defaultValues` (around line 88).
- Remove the two outbound `customer_email: values.customer_email || null,` lines from the POST and PATCH bodies (around lines 122 and 131).
- Delete the JSX block rendering the field (the `<Label htmlFor="customer_email">` through the error message — around lines 389–404).

- [ ] **Step 6: Typecheck**

Run: `pnpm exec tsc --noEmit`
Expected: PASS.

- [ ] **Step 7: Test**

Run: `pnpm test`
Expected: PASS. All references to `customer_email` are gone from app code and tests.

- [ ] **Step 8: Sanity grep**

Run: `grep -rn "customer_email" lib components app 2>/dev/null`
Expected: no output (zero matches).

- [ ] **Step 9: Commit**

```bash
git add lib/types.ts lib/schemas.ts lib/schemas.test.ts lib/liveness.test.ts components/license-form.tsx
git commit -m "feat(licenses): drop customer_email from TypeScript surface"
```

---

## Task 13: Supabase migration (database column drop + orphan cleanup)

**Files:**
- Deliverable: SQL file to add to the **Supabase repo**, not this one. Filename pattern: `supabase/migrations/YYYYMMDDHHMMSS_drop_license_customer_email.sql`.

- [ ] **Step 1: Write the migration**

In the Supabase repo (where the existing `intended_account_type` migration lives), create a new file `supabase/migrations/<timestamp>_drop_license_customer_email.sql` with:

```sql
begin;

-- Delete pre-users-era orphan licenses: rows with no owner path at all.
-- Half-orphans (one of user_id / subscription_id null) are retained.
delete from public.licenses
where user_id is null
  and subscription_id is null;

-- Drop the legacy column.
alter table public.licenses
  drop column customer_email;

commit;
```

- [ ] **Step 2: Dry-run the deletion**

Before deploying, in a Supabase SQL editor against staging:

```sql
select count(*) from public.licenses
where user_id is null and subscription_id is null;
```

Expected: a small number (likely 0–3 based on the screenshot you shared during brainstorming). If the count is unexpectedly large, stop and investigate before running the migration.

- [ ] **Step 3: Deploy together with the code changes from Tasks 1–12**

The migration MUST land in the same release as Tasks 1–12. If the column is dropped while older code that reads `customer_email` is still running, the API will 500. Conversely, if the code is shipped without the migration, runtime is fine but database has a dead column.

Recommended order on deploy day:
1. Merge and deploy the application code (Tasks 1–12) to staging.
2. Run the migration on staging.
3. Smoke `/admin/subscriptions`, `/admin/licenses`, `/admin/licenses/[id]` edit form.
4. Repeat in production.

- [ ] **Step 4: Commit the migration in the Supabase repo**

```bash
# in the Supabase repo, not this one
git add supabase/migrations/<timestamp>_drop_license_customer_email.sql
git commit -m "chore(db): drop licenses.customer_email and prune pre-users orphans"
```

(No commit happens in this repo for this task.)

---

## Task 14: E2E smoke test for the new page

**Files:**
- Create: `e2e/admin-subscriptions-page.spec.ts`

This task is a thin Playwright smoke that catches gross regressions on the new page. It mirrors the style of `e2e/admin-revokes-subscription.spec.ts`.

- [ ] **Step 1: Write the failing test**

Create `e2e/admin-subscriptions-page.spec.ts`:

```ts
import { test, expect } from "@playwright/test";
import { loginAs } from "./helpers/auth";

test("admin can open the Subscriptions page and see at least one group", async ({ browser }) => {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await loginAs(ctx, page, "admin");
  await page.goto("/admin/subscriptions");

  await expect(page.getByRole("heading", { name: "Subscriptions" })).toBeVisible();
  // At least one user-group header row exists (links to /admin/users/<id>).
  const groupLink = page.locator('a[href^="/admin/users/"]').first();
  await expect(groupLink).toBeVisible();
});

test("page-size selector persists across reloads", async ({ browser }) => {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await loginAs(ctx, page, "admin");
  await page.goto("/admin/subscriptions");

  // Pick 25 from the page-size selector.
  await page.getByRole("combobox", { name: /rows per page/i }).click();
  await page.getByRole("option", { name: "25" }).click();

  // Reload — the selection should persist via localStorage.
  await page.reload();
  await expect(page.getByRole("combobox", { name: /rows per page/i })).toContainText("25");
});

test("nav lists Subscriptions before Licenses", async ({ browser }) => {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await loginAs(ctx, page, "admin");
  await page.goto("/admin/users");
  const navLinks = await page.locator("header nav a").allTextContents();
  const subsIdx = navLinks.findIndex((t) => t.trim() === "Subscriptions");
  const licIdx = navLinks.findIndex((t) => t.trim() === "Licenses");
  expect(subsIdx).toBeGreaterThanOrEqual(0);
  expect(licIdx).toBeGreaterThan(subsIdx);
});
```

- [ ] **Step 2: Run it**

Run: `pnpm e2e -- admin-subscriptions-page.spec.ts`
Expected: PASS. If the seed has no subscriptions, the first test should still pass because the seed in `e2e/helpers/seed.ts` creates at least one subscription for the admin-revoke flow.

- [ ] **Step 3: Commit**

```bash
git add e2e/admin-subscriptions-page.spec.ts
git commit -m "test(e2e): smoke /admin/subscriptions page + nav ordering"
```

---

## Verification checklist

After all tasks land:

- [ ] `pnpm test` — green
- [ ] `pnpm exec tsc --noEmit` — green
- [ ] `pnpm lint` — green
- [ ] `pnpm e2e` — green
- [ ] Visual check: `/admin/subscriptions` renders groups, pagination works, page-size persists across reloads
- [ ] Visual check: `/admin/licenses` reads "Licenses (ops)", Owner column is populated, no "Create subscription" button
- [ ] Brand link in the header navigates to `/admin/subscriptions`
- [ ] `grep -rn "customer_email" lib components app` returns no results
- [ ] Supabase migration deployed; `select column_name from information_schema.columns where table_name='licenses';` confirms `customer_email` is gone

## Out of scope (reaffirmed from spec)

- Server-side pagination / virtualization
- Bulk-action toolbar on subscriptions
- A dedicated `/admin/subscriptions/[id]` detail page (row click stays on the user detail)
- Custom sort orders beyond `created_at desc`
- Per-row ⋯ action menu — deferred to a follow-up plan; actions remain available on `/admin/users/[id]` via `UserSubscriptionsPanel`
