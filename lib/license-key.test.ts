import { generateLicenseKey, LICENSE_KEY_ALPHABET } from "./license-key";
import { PRODUCTS } from "./products";

describe("generateLicenseKey", () => {
  for (const { code, prefix } of PRODUCTS) {
    it(`generates a key with the ${prefix} prefix for product ${code}`, () => {
      const key = generateLicenseKey(code);
      expect(key.startsWith(`${prefix}-`)).toBe(true);
    });
  }

  it("matches the IMPX-XXXX-XXXX-XXXX-XXXX shape for impulse", () => {
    const key = generateLicenseKey("impulse");
    expect(key).toMatch(/^IMPX-[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
  });

  it("matches the CTXL- shape for ctx-live", () => {
    const key = generateLicenseKey("ctx-live");
    expect(key).toMatch(/^CTXL-[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
  });

  it("uses only safe-alphabet characters in the body", () => {
    const key = generateLicenseKey("impulse");
    const body = key.slice(5).replace(/-/g, "");
    for (const ch of body) {
      expect(LICENSE_KEY_ALPHABET).toContain(ch);
    }
  });

  it("excludes ambiguous characters 0/O/1/I/L", () => {
    expect(LICENSE_KEY_ALPHABET).not.toMatch(/[01OIL]/);
  });

  it("generates distinct keys on repeated calls (sanity check)", () => {
    const a = generateLicenseKey("impulse");
    const b = generateLicenseKey("impulse");
    expect(a).not.toBe(b);
  });
});
