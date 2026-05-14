import {
  canCancel,
  canClaimOn,
  canRenewFrom,
  canApprove,
  canReject,
  canRevoke,
  canExtendFrom,
  canExtendToTier,
  tierRank,
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

describe("canApprove", () => {
  it("allows pending", () => {
    expect(canApprove({ status: "pending" })).toEqual({ ok: true });
  });
  it("rejects active", () => {
    expect(canApprove({ status: "active" })).toEqual({ ok: false, reason: "not_pending" });
  });
  it("rejects rejected", () => {
    expect(canApprove({ status: "rejected" })).toEqual({ ok: false, reason: "not_pending" });
  });
  it("rejects expired", () => {
    expect(canApprove({ status: "expired" })).toEqual({ ok: false, reason: "not_pending" });
  });
  it("rejects revoked", () => {
    expect(canApprove({ status: "revoked" })).toEqual({ ok: false, reason: "not_pending" });
  });
});

describe("canReject", () => {
  it("allows pending", () => {
    expect(canReject({ status: "pending" })).toEqual({ ok: true });
  });
  it("rejects non-pending statuses", () => {
    for (const s of ["active", "rejected", "expired", "revoked"] as const) {
      expect(canReject({ status: s })).toEqual({ ok: false, reason: "not_pending" });
    }
  });
});

describe("canRevoke", () => {
  it("allows active", () => {
    expect(canRevoke({ status: "active" })).toEqual({ ok: true });
  });
  it("rejects non-active statuses", () => {
    for (const s of ["pending", "rejected", "expired", "revoked"] as const) {
      expect(canRevoke({ status: s })).toEqual({ ok: false, reason: "not_active" });
    }
  });
});

describe("canExtendFrom", () => {
  test.each([
    ["pending", false, "subscription_not_active"],
    ["active", true, undefined],
    ["rejected", false, "subscription_not_active"],
    ["expired", false, "subscription_not_active"],
    ["revoked", false, "subscription_not_active"],
  ] as const)("status=%s → ok=%s", (status, ok, reason) => {
    const r = canExtendFrom({ status });
    expect(r.ok).toBe(ok);
    if (!r.ok) expect(r.reason).toBe(reason);
  });
});

describe("tierRank", () => {
  test("orders monthly < quarterly < yearly", () => {
    expect(tierRank.monthly).toBeLessThan(tierRank.quarterly);
    expect(tierRank.quarterly).toBeLessThan(tierRank.yearly);
  });
});

describe("canExtendToTier", () => {
  test.each([
    ["monthly", "monthly", true],
    ["monthly", "quarterly", true],
    ["monthly", "yearly", true],
    ["quarterly", "monthly", false],
    ["quarterly", "quarterly", true],
    ["quarterly", "yearly", true],
    ["yearly", "monthly", false],
    ["yearly", "quarterly", false],
    ["yearly", "yearly", true],
  ] as const)("source=%s requested=%s → ok=%s", (source, requested, ok) => {
    const r = canExtendToTier(source, requested);
    expect(r.ok).toBe(ok);
    if (!r.ok) expect(r.reason).toBe("tier_downgrade_not_allowed");
  });
});
