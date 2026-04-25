import {
  calculateExpiresAt,
  isExpired,
  computeDisplayStatus,
  formatExpiry,
} from "./expiry";

describe("calculateExpiresAt", () => {
  const from = new Date("2026-04-25T10:00:00Z");

  it("monthly: adds 1 calendar month", () => {
    const result = calculateExpiresAt("monthly", from);
    expect(result.toISOString()).toBe("2026-05-25T10:00:00.000Z");
  });

  it("quarterly: adds 3 calendar months", () => {
    const result = calculateExpiresAt("quarterly", from);
    expect(result.toISOString()).toBe("2026-07-25T10:00:00.000Z");
  });

  it("yearly: adds 1 calendar year", () => {
    const result = calculateExpiresAt("yearly", from);
    expect(result.toISOString()).toBe("2027-04-25T10:00:00.000Z");
  });

  it("monthly handles end-of-month rollover (Jan 31 → Feb 28)", () => {
    const jan31 = new Date("2026-01-31T00:00:00Z");
    const result = calculateExpiresAt("monthly", jan31);
    expect(result.toISOString().slice(0, 10)).toBe("2026-02-28");
  });
});

describe("isExpired", () => {
  it("returns false for null (lifetime)", () => {
    expect(isExpired(null)).toBe(false);
  });

  it("returns false for future date", () => {
    const future = new Date(Date.now() + 86400000).toISOString();
    expect(isExpired(future)).toBe(false);
  });

  it("returns true for past date", () => {
    expect(isExpired("2020-01-01T00:00:00Z")).toBe(true);
  });
});

describe("computeDisplayStatus", () => {
  it("revoked beats everything", () => {
    expect(computeDisplayStatus("revoked", "2099-01-01")).toBe("revoked");
    expect(computeDisplayStatus("revoked", "2020-01-01")).toBe("revoked");
    expect(computeDisplayStatus("revoked", null)).toBe("revoked");
  });

  it("active + past expires_at → expired", () => {
    expect(computeDisplayStatus("active", "2020-01-01")).toBe("expired");
  });

  it("active + future expires_at → active", () => {
    expect(computeDisplayStatus("active", "2099-01-01")).toBe("active");
  });

  it("active + null expires_at → active (lifetime)", () => {
    expect(computeDisplayStatus("active", null)).toBe("active");
  });

  it("explicit expired status → expired", () => {
    expect(computeDisplayStatus("expired", "2099-01-01")).toBe("expired");
  });
});

describe("formatExpiry", () => {
  it("null → 'Not activated'", () => {
    expect(formatExpiry(null)).toBe("Not activated");
  });

  it("ISO string → YYYY-MM-DD", () => {
    expect(formatExpiry("2027-04-25T00:00:00Z")).toBe("2027-04-25");
  });
});
