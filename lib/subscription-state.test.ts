import {
  canCancel,
  canClaimOn,
  canRenewFrom,
} from "./subscription-state";

describe("canCancel", () => {
  it("allows cancel on pending", () => {
    expect(canCancel({ status: "pending" }).ok).toBe(true);
  });
  it.each(["active", "rejected", "expired", "revoked"] as const)(
    "blocks cancel on %s",
    (status) => {
      const r = canCancel({ status });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.reason).toBe("not_pending");
    },
  );
});

describe("canClaimOn", () => {
  it("allows claim on active", () => {
    expect(canClaimOn({ status: "active" }).ok).toBe(true);
  });
  it.each(["pending", "rejected", "expired", "revoked"] as const)(
    "blocks claim on %s",
    (status) => {
      const r = canClaimOn({ status });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.reason).toBe("subscription_not_active");
    },
  );
});

describe("canRenewFrom", () => {
  it.each(["expired", "revoked"] as const)("allows renew from %s", (status) => {
    expect(canRenewFrom({ status }).ok).toBe(true);
  });
  it.each(["pending", "active", "rejected"] as const)(
    "blocks renew from %s",
    (status) => {
      const r = canRenewFrom({ status });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.reason).toBe("not_renewable");
    },
  );
});
