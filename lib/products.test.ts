import {
  PRODUCTS,
  PRODUCT_CODES,
  productPrefix,
  productByPrefix,
  isProductCode,
  productDisplayName,
} from "./products";

describe("PRODUCTS list", () => {
  it("contains exactly the 5 supported products", () => {
    expect(PRODUCT_CODES).toEqual([
      "impulse",
      "ctx-core",
      "ctx-live",
      "ctx-prop-passer",
      "ctx-prop-funded",
    ]);
  });

  it("each product has a unique 4-character prefix", () => {
    const prefixes = PRODUCTS.map((p) => p.prefix);
    expect(new Set(prefixes).size).toBe(prefixes.length);
    for (const p of prefixes) {
      expect(p).toMatch(/^[A-Z]{4}$/);
    }
  });
});

describe("productPrefix", () => {
  it("returns IMPX for impulse", () => {
    expect(productPrefix("impulse")).toBe("IMPX");
  });
  it("returns CTXL for ctx-live", () => {
    expect(productPrefix("ctx-live")).toBe("CTXL");
  });
  it("returns CTXC for ctx-core", () => {
    expect(productPrefix("ctx-core")).toBe("CTXC");
  });
  it("returns CTXP for ctx-prop-passer", () => {
    expect(productPrefix("ctx-prop-passer")).toBe("CTXP");
  });
  it("returns CTXF for ctx-prop-funded", () => {
    expect(productPrefix("ctx-prop-funded")).toBe("CTXF");
  });
});

describe("productByPrefix", () => {
  it("returns impulse for IMPX", () => {
    expect(productByPrefix("IMPX")).toBe("impulse");
  });
  it("returns ctx-live for CTXL", () => {
    expect(productByPrefix("CTXL")).toBe("ctx-live");
  });
  it("returns null for unknown prefix", () => {
    expect(productByPrefix("ZZZZ")).toBeNull();
  });
});

describe("isProductCode", () => {
  it("accepts known codes", () => {
    expect(isProductCode("impulse")).toBe(true);
    expect(isProductCode("ctx-live")).toBe(true);
  });
  it("rejects unknowns", () => {
    expect(isProductCode("ctx-banana")).toBe(false);
    expect(isProductCode("")).toBe(false);
    expect(isProductCode(undefined as unknown as string)).toBe(false);
  });
});

describe("productDisplayName", () => {
  it("returns 'Impulse' for impulse", () => {
    expect(productDisplayName("impulse")).toBe("Impulse");
  });
  it("returns 'CTX Live' for ctx-live", () => {
    expect(productDisplayName("ctx-live")).toBe("CTX Live");
  });
});
