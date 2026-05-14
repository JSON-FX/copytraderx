import { groupByProduct } from "./dashboard-data";
import type { DashboardSubscription } from "./types";

function fakeItem(
  id: number,
  product: DashboardSubscription["subscription"]["product"],
  status: DashboardSubscription["subscription"]["status"] = "active",
): DashboardSubscription {
  return {
    subscription: {
      id,
      user_id: "00000000-0000-0000-0000-000000000001",
      product,
      tier: "monthly",
      status,
      requested_at: new Date(2026, 0, id).toISOString(),
      approved_at: status === "active" ? new Date(2026, 0, id).toISOString() : null,
      approved_by: null,
      expires_at: null,
      rejection_reason: null,
      notes: null,
      created_at: new Date(2026, 0, id).toISOString(),
      hidden_at: null,
      push_interval_seconds: 10,
      propfirm_rule_id: null,
    },
    liveLicense: null,
    demoLicense: null,
    pendingExtension: null,
  };
}

describe("groupByProduct", () => {
  it("returns empty array for empty input", () => {
    expect(groupByProduct([])).toEqual([]);
  });

  it("groups multiple subscriptions for the same product into one group", () => {
    const a = fakeItem(1, "impulse");
    const b = fakeItem(2, "impulse", "pending");
    const result = groupByProduct([a, b]);
    expect(result).toHaveLength(1);
    expect(result[0].product).toBe("impulse");
    expect(result[0].subscriptions).toEqual([a, b]); // input order preserved within group
  });

  it("emits groups in canonical PRODUCT_CODES order regardless of input order", () => {
    const live = fakeItem(1, "ctx-live");
    const impulse = fakeItem(2, "impulse");
    const passer = fakeItem(3, "ctx-prop-passer");
    const result = groupByProduct([live, passer, impulse]);
    expect(result.map((g) => g.product)).toEqual([
      "impulse",
      "ctx-live",
      "ctx-prop-passer",
    ]);
  });

  it("does not emit groups for products with no subscriptions", () => {
    const result = groupByProduct([fakeItem(1, "impulse")]);
    expect(result.map((g) => g.product)).toEqual(["impulse"]);
  });
});

describe("groupByProduct preserves pendingExtension", () => {
  test("attaches pendingExtension through the projection", () => {
    const sub: DashboardSubscription = {
      subscription: {
        id: 1,
        user_id: "u",
        product: "impulse",
        tier: "monthly",
        status: "active",
        requested_at: "2026-01-01T00:00:00Z",
        approved_at: "2026-01-01T00:00:00Z",
        approved_by: "a",
        expires_at: "2026-06-01T00:00:00Z",
        rejection_reason: null,
        notes: null,
        created_at: "2026-01-01T00:00:00Z",
        hidden_at: null,
        push_interval_seconds: 10,
        propfirm_rule_id: null,
      },
      liveLicense: null,
      demoLicense: null,
      pendingExtension: {
        id: 99,
        subscription_id: 1,
        user_id: "u",
        requested_tier: "yearly",
        status: "pending",
        requested_at: "2026-05-09T00:00:00Z",
        approved_at: null,
        approved_by: null,
        rejection_code: null,
        rejection_message: null,
        old_tier: null,
        new_tier: null,
        old_expires_at: null,
        new_expires_at: null,
        notes: null,
        created_at: "2026-05-09T00:00:00Z",
      },
    };
    const groups = groupByProduct([sub]);
    expect(groups[0].subscriptions[0].pendingExtension?.id).toBe(99);
  });
});
