import {
  filterRows,
  groupByUser,
  paginateGroups,
  summarizeStatuses,
  type AdminSubscriptionRow,
  type AdminUserGroup,
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

function mt5Row(
  overrides: Partial<AdminSubscriptionRow> & { id: number },
): AdminSubscriptionRow {
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
      product: "ctx-core",
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
      filterRows(rows, { search: "", statuses: [], products: ["ctx-core"] }).map(
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
