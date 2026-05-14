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
    hidden_at: null,
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
