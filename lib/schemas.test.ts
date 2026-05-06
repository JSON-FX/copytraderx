import {
  createLicenseSchema,
  updateLicenseSchema,
  renewActionSchema,
  createSubscriptionRequestSchema,
  renewSubscriptionRequestSchema,
  approveSubscriptionSchema,
  rejectSubscriptionSchema,
  isValidLicenseKey,
} from "./schemas";

describe("createLicenseSchema", () => {
  it("accepts a valid impulse license", () => {
    const result = createLicenseSchema.safeParse({
      license_key: "IMPX-AAAA-BBBB-CCCC-DDDD",
      mt5_account: 12345678,
      product: "impulse",
      tier: "monthly",
      intended_account_type: "demo",
      customer_email: "test@example.com",
      notes: "first customer",
    });
    expect(result.success).toBe(true);
  });

  it("accepts a valid ctx-live license", () => {
    const result = createLicenseSchema.safeParse({
      license_key: "CTXL-AAAA-BBBB-CCCC-DDDD",
      mt5_account: 12345678,
      product: "ctx-live",
      tier: "monthly",
      intended_account_type: "live",
    });
    expect(result.success).toBe(true);
  });

  it("rejects license_key whose prefix mismatches product (IMPX with ctx-live)", () => {
    const result = createLicenseSchema.safeParse({
      license_key: "IMPX-AAAA-BBBB-CCCC-DDDD",
      mt5_account: 12345678,
      product: "ctx-live",
      tier: "monthly",
      intended_account_type: "demo",
    });
    expect(result.success).toBe(false);
  });

  it("rejects license_key with body characters outside the safe alphabet", () => {
    const result = createLicenseSchema.safeParse({
      license_key: "IMPX-AAAA-BBBB-CCC0-DDDD", // contains '0'
      mt5_account: 12345678,
      product: "impulse",
      tier: "monthly",
      intended_account_type: "demo",
    });
    expect(result.success).toBe(false);
  });

  it("rejects malformed license_key (wrong shape)", () => {
    const result = createLicenseSchema.safeParse({
      license_key: "WRONG-AAAA-BBBB-CCCC-DDDD",
      mt5_account: 12345678,
      product: "impulse",
      tier: "monthly",
      intended_account_type: "demo",
    });
    expect(result.success).toBe(false);
  });

  it("rejects unknown product", () => {
    const result = createLicenseSchema.safeParse({
      license_key: "IMPX-AAAA-BBBB-CCCC-DDDD",
      mt5_account: 12345678,
      product: "ctx-banana",
      tier: "monthly",
      intended_account_type: "demo",
    });
    expect(result.success).toBe(false);
  });

  it("rejects mt5_account = 0", () => {
    const result = createLicenseSchema.safeParse({
      license_key: "IMPX-AAAA-BBBB-CCCC-DDDD",
      mt5_account: 0,
      product: "impulse",
      tier: "monthly",
      intended_account_type: "demo",
    });
    expect(result.success).toBe(false);
  });

  it("rejects negative mt5_account", () => {
    const result = createLicenseSchema.safeParse({
      license_key: "IMPX-AAAA-BBBB-CCCC-DDDD",
      mt5_account: -5,
      product: "impulse",
      tier: "monthly",
      intended_account_type: "demo",
    });
    expect(result.success).toBe(false);
  });

  it("rejects unknown tier", () => {
    const result = createLicenseSchema.safeParse({
      license_key: "IMPX-AAAA-BBBB-CCCC-DDDD",
      mt5_account: 1,
      product: "impulse",
      tier: "weekly",
      intended_account_type: "demo",
    });
    expect(result.success).toBe(false);
  });

  it("rejects lifetime tier (no longer supported)", () => {
    const result = createLicenseSchema.safeParse({
      license_key: "IMPX-AAAA-BBBB-CCCC-DDDD",
      mt5_account: 12345678,
      product: "impulse",
      tier: "lifetime",
      intended_account_type: "demo",
    });
    expect(result.success).toBe(false);
  });

  it("accepts empty/missing customer_email", () => {
    const a = createLicenseSchema.safeParse({
      license_key: "IMPX-AAAA-BBBB-CCCC-DDDD",
      mt5_account: 1,
      product: "impulse",
      tier: "monthly",
      intended_account_type: "demo",
    });
    expect(a.success).toBe(true);
    const b = createLicenseSchema.safeParse({
      license_key: "IMPX-AAAA-BBBB-CCCC-DDDD",
      mt5_account: 1,
      product: "impulse",
      tier: "monthly",
      intended_account_type: "live",
      customer_email: "",
    });
    expect(b.success).toBe(true);
  });

  it("rejects invalid customer_email format", () => {
    const result = createLicenseSchema.safeParse({
      license_key: "IMPX-AAAA-BBBB-CCCC-DDDD",
      mt5_account: 1,
      product: "impulse",
      tier: "monthly",
      intended_account_type: "demo",
      customer_email: "not-an-email",
    });
    expect(result.success).toBe(false);
  });
});

describe("isValidLicenseKey", () => {
  it("matches IMPX for impulse", () => {
    expect(isValidLicenseKey("IMPX-AAAA-BBBB-CCCC-DDDD", "impulse")).toBe(true);
  });
  it("rejects IMPX when product is ctx-live", () => {
    expect(isValidLicenseKey("IMPX-AAAA-BBBB-CCCC-DDDD", "ctx-live")).toBe(false);
  });
  it("matches CTXP for ctx-prop-passer", () => {
    expect(isValidLicenseKey("CTXP-AAAA-BBBB-CCCC-DDDD", "ctx-prop-passer")).toBe(true);
  });
});

describe("updateLicenseSchema", () => {
  it("accepts a partial update", () => {
    const result = updateLicenseSchema.safeParse({
      status: "revoked",
    });
    expect(result.success).toBe(true);
  });

  it("rejects empty body", () => {
    const result = updateLicenseSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it("rejects unknown extra fields", () => {
    const result = updateLicenseSchema.safeParse({
      status: "active",
      hacker_field: "evil",
    });
    expect(result.success).toBe(false);
  });
});

describe("renewActionSchema", () => {
  it("accepts a valid renew action", () => {
    const result = renewActionSchema.safeParse({
      action: "renew",
      tier: "yearly",
    });
    expect(result.success).toBe(true);
  });

  it("rejects renew with invalid tier", () => {
    const result = renewActionSchema.safeParse({
      action: "renew",
      tier: "lifetime",
    });
    expect(result.success).toBe(false);
  });
});

describe("createSubscriptionRequestSchema", () => {
  it("accepts each of the 5 products", () => {
    for (const product of [
      "impulse",
      "ctx-core",
      "ctx-live",
      "ctx-prop-passer",
      "ctx-prop-funded",
    ] as const) {
      const result = createSubscriptionRequestSchema.safeParse({
        product,
        tier: "monthly",
      });
      expect(result.success).toBe(true);
    }
  });

  it("rejects unknown product", () => {
    const result = createSubscriptionRequestSchema.safeParse({
      product: "ctx-banana",
      tier: "monthly",
    });
    expect(result.success).toBe(false);
  });

  it("rejects unknown tier", () => {
    const result = createSubscriptionRequestSchema.safeParse({
      product: "impulse",
      tier: "lifetime",
    });
    expect(result.success).toBe(false);
  });
});

describe("renewSubscriptionRequestSchema", () => {
  it("accepts a renew with positive source_subscription_id", () => {
    const result = renewSubscriptionRequestSchema.safeParse({
      source_subscription_id: 42,
      tier: "yearly",
    });
    expect(result.success).toBe(true);
  });

  it("rejects renew with non-positive source_subscription_id", () => {
    const result = renewSubscriptionRequestSchema.safeParse({
      source_subscription_id: 0,
      tier: "yearly",
    });
    expect(result.success).toBe(false);
  });
});

describe("approveSubscriptionSchema", () => {
  it("accepts the approve action", () => {
    const result = approveSubscriptionSchema.safeParse({ action: "approve" });
    expect(result.success).toBe(true);
  });

  it("rejects unknown action literal", () => {
    const result = approveSubscriptionSchema.safeParse({ action: "approve-now" });
    expect(result.success).toBe(false);
  });
});

describe("rejectSubscriptionSchema", () => {
  it("accepts a non-empty rejection_reason", () => {
    const result = rejectSubscriptionSchema.safeParse({
      action: "reject",
      rejection_reason: "duplicate request",
    });
    expect(result.success).toBe(true);
  });

  it("rejects empty rejection_reason", () => {
    const result = rejectSubscriptionSchema.safeParse({
      action: "reject",
      rejection_reason: "",
    });
    expect(result.success).toBe(false);
  });
});

import { createUserSchema, updateUserSchema } from "./schemas";

describe("createUserSchema", () => {
  it("accepts a minimal valid input (email + role only)", () => {
    const result = createUserSchema.safeParse({
      email: "user@example.com",
      role: "user",
    });
    expect(result.success).toBe(true);
  });

  it("accepts an input with an initial subscription", () => {
    const result = createUserSchema.safeParse({
      email: "user@example.com",
      full_name: "User Name",
      role: "user",
      initial_subscription: { product: "impulse", tier: "monthly" },
    });
    expect(result.success).toBe(true);
  });

  it("rejects a bad email", () => {
    const result = createUserSchema.safeParse({
      email: "not-an-email",
      role: "user",
    });
    expect(result.success).toBe(false);
  });

  it("rejects an unknown role", () => {
    const result = createUserSchema.safeParse({
      email: "u@example.com",
      role: "superuser",
    });
    expect(result.success).toBe(false);
  });

  it("rejects an initial_subscription with a bad product", () => {
    const result = createUserSchema.safeParse({
      email: "u@example.com",
      role: "user",
      initial_subscription: { product: "xyz", tier: "monthly" },
    });
    expect(result.success).toBe(false);
  });
});

describe("updateUserSchema", () => {
  it("accepts a role-only update", () => {
    const result = updateUserSchema.safeParse({ role: "admin" });
    expect(result.success).toBe(true);
  });

  it("accepts a full_name update", () => {
    const result = updateUserSchema.safeParse({ full_name: "Real Name" });
    expect(result.success).toBe(true);
  });

  it("rejects an empty body", () => {
    const result = updateUserSchema.safeParse({});
    expect(result.success).toBe(false);
  });
});
