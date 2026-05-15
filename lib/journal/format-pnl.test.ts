import { fmtPct, fmtCash, fmtPctOrCash } from "./format-pnl";

describe("fmtPct", () => {
  it("formats positives with a + and 2 decimals", () => {
    expect(fmtPct(3.51)).toBe("+3.51%");
  });
  it("formats negatives with an en-dash and 2 decimals", () => {
    expect(fmtPct(-3.51)).toBe("−3.51%");
  });
  it("renders zero as 0.00% with no sign", () => {
    expect(fmtPct(0)).toBe("0.00%");
  });
  it("clamps to 2 decimals", () => {
    expect(fmtPct(1.23456)).toBe("+1.23%");
  });
});

describe("fmtCash", () => {
  it("uses the provided currency", () => {
    expect(fmtCash(1234.5, "USD")).toBe("$1,234.50");
  });
  it("formats negative cash with a leading minus", () => {
    expect(fmtCash(-36.41, "USD")).toBe("-$36.41");
  });
});

describe("fmtPctOrCash", () => {
  it("returns formatted % when mode=percent and baseline>0", () => {
    expect(fmtPctOrCash(48.55, "percent", 1037, "USD")).toBe("+4.68%");
  });
  it("falls back to $ when baseline is 0", () => {
    expect(fmtPctOrCash(48.55, "percent", 0, "USD")).toBe("$48.55");
  });
  it("returns $ when mode=dollar regardless of baseline", () => {
    expect(fmtPctOrCash(48.55, "dollar", 1037, "USD")).toBe("$48.55");
  });
});
