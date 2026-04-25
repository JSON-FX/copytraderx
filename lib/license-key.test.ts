import { generateLicenseKey, LICENSE_KEY_ALPHABET } from "./license-key";
import { LICENSE_KEY_PATTERN } from "./schemas";

describe("generateLicenseKey", () => {
  it("returns a key matching the IMPX format", () => {
    const key = generateLicenseKey();
    expect(key).toMatch(LICENSE_KEY_PATTERN);
  });

  it("returns a 24-character key", () => {
    expect(generateLicenseKey()).toHaveLength(24);
  });

  it("uses only safe alphabet characters in the random portion", () => {
    const key = generateLicenseKey();
    const groups = key.slice(5).split("-").join("");
    for (const ch of groups) {
      expect(LICENSE_KEY_ALPHABET).toContain(ch);
    }
  });

  it("excludes ambiguous characters 0/O/1/I/L", () => {
    expect(LICENSE_KEY_ALPHABET).not.toMatch(/[01OIL]/);
  });

  it("returns different keys on consecutive calls (probabilistic)", () => {
    const a = generateLicenseKey();
    const b = generateLicenseKey();
    expect(a).not.toBe(b);
  });
});
