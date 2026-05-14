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
