import { binPnlDistribution } from "./histogram";

describe("binPnlDistribution", () => {
  it("returns an empty result for an empty input", () => {
    expect(binPnlDistribution([], 10)).toEqual({ bins: [], min: 0, max: 0 });
  });
  it("places values into the requested bin count between min and max", () => {
    const result = binPnlDistribution([-2, -1, 0, 1, 5], 5);
    expect(result.bins).toHaveLength(5);
    expect(result.bins.reduce((a, b) => a + b.count, 0)).toBe(5);
    expect(result.min).toBe(-2);
    expect(result.max).toBe(5);
  });
  it("clamps a single-value series into one nonzero bin", () => {
    const r = binPnlDistribution([3], 4);
    expect(r.bins.reduce((a, b) => a + b.count, 0)).toBe(1);
  });
  it("labels each bin with a sign (win / loss / zero)", () => {
    const r = binPnlDistribution([-5, -1, 0, 1, 5], 5);
    const signs = r.bins.map((b) => b.sign);
    expect(signs).toContain("win");
    expect(signs).toContain("loss");
  });
});
