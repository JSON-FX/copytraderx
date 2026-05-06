import { generateTempPassword, tierLabel, productLabel } from "./users";

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
