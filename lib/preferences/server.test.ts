import { resolvePnlDisplay } from "./server";

describe("resolvePnlDisplay", () => {
  it("returns 'percent' when row is null", () => {
    expect(resolvePnlDisplay(null)).toBe("percent");
  });

  it("returns 'percent' when row has invalid value", () => {
    expect(resolvePnlDisplay({ pnl_display: "garbage" } as never)).toBe("percent");
  });

  it("returns the stored value when valid", () => {
    expect(resolvePnlDisplay({ pnl_display: "dollar" })).toBe("dollar");
    expect(resolvePnlDisplay({ pnl_display: "percent" })).toBe("percent");
  });
});
