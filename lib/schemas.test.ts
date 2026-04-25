import {
  createLicenseSchema,
  updateLicenseSchema,
  renewActionSchema,
} from "./schemas";

describe("createLicenseSchema", () => {
  it("accepts a valid monthly license", () => {
    const result = createLicenseSchema.safeParse({
      license_key: "IMPX-AAAA-BBBB-CCCC-DDDD",
      mt5_account: 12345678,
      tier: "monthly",
      customer_email: "test@example.com",
      notes: "first customer",
    });
    expect(result.success).toBe(true);
  });

  it("rejects malformed license_key (wrong prefix)", () => {
    const result = createLicenseSchema.safeParse({
      license_key: "WRONG-AAAA-BBBB-CCCC-DDDD",
      mt5_account: 12345678,
      tier: "monthly",
    });
    expect(result.success).toBe(false);
  });

  it("rejects mt5_account = 0", () => {
    const result = createLicenseSchema.safeParse({
      license_key: "IMPX-AAAA-BBBB-CCCC-DDDD",
      mt5_account: 0,
      tier: "monthly",
    });
    expect(result.success).toBe(false);
  });

  it("rejects negative mt5_account", () => {
    const result = createLicenseSchema.safeParse({
      license_key: "IMPX-AAAA-BBBB-CCCC-DDDD",
      mt5_account: -5,
      tier: "monthly",
    });
    expect(result.success).toBe(false);
  });

  it("rejects unknown tier", () => {
    const result = createLicenseSchema.safeParse({
      license_key: "IMPX-AAAA-BBBB-CCCC-DDDD",
      mt5_account: 1,
      tier: "weekly",
    });
    expect(result.success).toBe(false);
  });

  it("accepts empty/missing customer_email", () => {
    const a = createLicenseSchema.safeParse({
      license_key: "IMPX-AAAA-BBBB-CCCC-DDDD",
      mt5_account: 1,
      tier: "monthly",
    });
    expect(a.success).toBe(true);
    const b = createLicenseSchema.safeParse({
      license_key: "IMPX-AAAA-BBBB-CCCC-DDDD",
      mt5_account: 1,
      tier: "monthly",
      customer_email: "",
    });
    expect(b.success).toBe(true);
  });

  it("rejects invalid customer_email format", () => {
    const result = createLicenseSchema.safeParse({
      license_key: "IMPX-AAAA-BBBB-CCCC-DDDD",
      mt5_account: 1,
      tier: "monthly",
      customer_email: "not-an-email",
    });
    expect(result.success).toBe(false);
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
