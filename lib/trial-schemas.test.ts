import { createTrialSchema, convertTrialSchema } from "./schemas";

describe("createTrialSchema", () => {
  const valid = {
    product: "impulse",
    mt5_account: 12345678,
    email: "lead@example.com",
    telegram_handle: "@trader_john",
    discord_handle: "tjohn#1234",
    notes: "from telegram channel",
  };

  it("accepts a fully populated payload", () => {
    const result = createTrialSchema.safeParse(valid);
    expect(result.success).toBe(true);
  });

  it("accepts a payload with only required fields", () => {
    const result = createTrialSchema.safeParse({
      product: "impulse",
      mt5_account: 12345678,
      email: "lead@example.com",
    });
    expect(result.success).toBe(true);
  });

  it("rejects non-positive mt5_account", () => {
    const result = createTrialSchema.safeParse({ ...valid, mt5_account: 0 });
    expect(result.success).toBe(false);
  });

  it("rejects malformed email", () => {
    const result = createTrialSchema.safeParse({ ...valid, email: "not-an-email" });
    expect(result.success).toBe(false);
  });

  it("transforms empty telegram_handle to null", () => {
    const result = createTrialSchema.parse({ ...valid, telegram_handle: "   " });
    expect(result.telegram_handle).toBeNull();
  });

  it("transforms empty discord_handle to null", () => {
    const result = createTrialSchema.parse({ ...valid, discord_handle: "" });
    expect(result.discord_handle).toBeNull();
  });

  it("lowercases the email", () => {
    const result = createTrialSchema.parse({ ...valid, email: "LEAD@Example.COM" });
    expect(result.email).toBe("lead@example.com");
  });
});

describe("convertTrialSchema", () => {
  it("accepts a payload with a valid uuid", () => {
    const result = convertTrialSchema.safeParse({
      converted_user_id: "11111111-2222-3333-4444-555555555555",
    });
    expect(result.success).toBe(true);
  });

  it("accepts an empty payload (converted_user_id optional)", () => {
    const result = convertTrialSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it("rejects a non-uuid converted_user_id", () => {
    const result = convertTrialSchema.safeParse({ converted_user_id: "not-uuid" });
    expect(result.success).toBe(false);
  });
});
