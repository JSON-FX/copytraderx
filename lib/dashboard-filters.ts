import type { Product } from "./products";
import { PRODUCT_CODES, isProductCode } from "./products";
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

const productRank = new Map<string, number>(
  PRODUCT_CODES.map((p, i) => [p, i]),
);

export function sortItems(
  items: DashboardSubscription[],
  sort: SortKey,
): DashboardSubscription[] {
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
  if (!v.products.every(isProductCode)) return false;
  if (!Array.isArray(v.statuses)) return false;
  if (!v.statuses.every((s) => typeof s === "string" && VALID_STATUS.includes(s as StatusGroup))) return false;
  if (typeof v.slots !== "string" || !VALID_SLOT.includes(v.slots as SlotFilter)) return false;
  if (typeof v.sort !== "string" || !VALID_SORT.includes(v.sort as SortKey)) return false;
  return true;
}

export function loadFilters(): FilterState | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (raw === null) return null;
    const parsed = JSON.parse(raw);
    if (!isFilterState(parsed)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveFilters(state: FilterState): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // swallow quota / privacy-mode errors silently
  }
}
