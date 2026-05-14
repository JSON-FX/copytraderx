import { generateTempPassword, tierLabel, productLabel, LEGACY_ADMIN_EMAIL, isLegacyAdmin } from "./users";

describe("generateTempPassword", () => {
  it("returns a 12-character string by default", () => {
    const pw = generateTempPassword();
    expect(pw).toHaveLength(12);
  });

  it("returns the requested length", () => {
    expect(generateTempPassword(16)).toHaveLength(16);
  });

  it("uses only ascii printable, no ambiguous characters", () => {
    const pw = generateTempPassword(64);
    expect(pw).toMatch(/^[A-HJ-NP-Za-hj-np-z2-9!@#$%^&*]+$/);
    // No 0/O/1/I/l/o.
    expect(pw).not.toMatch(/[0OIl1o]/);
  });

  it("produces different values on each call", () => {
    const a = generateTempPassword();
    const b = generateTempPassword();
    expect(a).not.toBe(b);
  });
});

describe("tierLabel", () => {
  it("renders human-readable labels", () => {
    expect(tierLabel("monthly")).toBe("Monthly");
    expect(tierLabel("quarterly")).toBe("Quarterly");
    expect(tierLabel("yearly")).toBe("Yearly");
  });
});

describe("productLabel", () => {
  it("renders the product display name", () => {
    expect(productLabel("impulse")).toBe("Impulse");
    expect(productLabel("ctx-live")).toBe("CTX Live");
  });
});

describe("isLegacyAdmin", () => {
  it("matches the legacy admin email", () => {
    expect(LEGACY_ADMIN_EMAIL).toBe("legacy@copytraderx.local");
    expect(isLegacyAdmin("legacy@copytraderx.local")).toBe(true);
  });
  it("rejects other emails", () => {
    expect(isLegacyAdmin("help.copytraderx@gmail.com")).toBe(false);
    expect(isLegacyAdmin("user@example.com")).toBe(false);
    expect(isLegacyAdmin(null)).toBe(false);
    expect(isLegacyAdmin(undefined)).toBe(false);
  });
});
