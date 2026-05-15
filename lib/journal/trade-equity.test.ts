import { computeTradeEquity } from "./trade-equity";
import { SAMPLE_DEALS } from "./__fixtures__/sample-deals";
import type { Deal } from "@/lib/types";

describe("computeTradeEquity", () => {
  it("returns zeros for an empty array", () => {
    expect(computeTradeEquity([])).toEqual({
      curve: [], netPnl: 0, maxDrawdownCash: 0, currentDrawdownCash: 0, totalFees: 0,
    });
  });

  it("sums profit + commission + swap into netPnl", () => {
    // SAMPLE_DEALS: gross profit 350, gross loss 80, commissions = -19, swaps = 0.
    // Net P/L with fees = 350 - 80 - 19 = 251.
    const r = computeTradeEquity(SAMPLE_DEALS);
    expect(r.netPnl).toBe(251);
    expect(r.totalFees).toBe(-19);
  });

  it("produces one curve point per deal in chronological order", () => {
    const r = computeTradeEquity(SAMPLE_DEALS);
    expect(r.curve).toHaveLength(SAMPLE_DEALS.length);
    for (let i = 1; i < r.curve.length; i++) {
      expect(r.curve[i].ts >= r.curve[i - 1].ts).toBe(true);
    }
  });

  it("re-sorts deals when input arrives out of order", () => {
    const reversed = [...SAMPLE_DEALS].reverse();
    const r = computeTradeEquity(reversed);
    expect(r.curve[0].ts).toBe(SAMPLE_DEALS[0].close_time);
    expect(r.curve[r.curve.length - 1].ts).toBe(SAMPLE_DEALS[SAMPLE_DEALS.length - 1].close_time);
  });

  it("computes max drawdown as the worst peak-to-trough on the cumulative curve", () => {
    // Custom series: +100, +100, -150, +50, -200 (fees=0) ⇒
    // cum:  100, 200,  50, 100, -100
    // peak: 100, 200, 200, 200,  200
    // DD:     0,   0, 150, 100,  300  ⇒ max DD = 300
    const ts = (n: number) => `2026-04-${String(n).padStart(2, "0")}T00:00:00Z`;
    const make = (i: number, profit: number): Deal => ({
      mt5_account: 1, ticket: i, ea_source: "impulse", symbol: "EURUSD", side: "buy",
      volume: 0.1, open_price: 1, close_price: 1, sl: null, tp: null,
      open_time: ts(i), close_time: ts(i), profit, commission: 0, swap: 0,
      comment: null, magic: null,
    });
    const r = computeTradeEquity([
      make(1, 100), make(2, 100), make(3, -150), make(4, 50), make(5, -200),
    ]);
    expect(r.maxDrawdownCash).toBe(300);
    expect(r.currentDrawdownCash).toBe(300);
    expect(r.netPnl).toBe(-100);
  });

  it("reports currentDrawdownCash of zero when ending at a new high", () => {
    const ts = (n: number) => `2026-04-${String(n).padStart(2, "0")}T00:00:00Z`;
    const make = (i: number, profit: number): Deal => ({
      mt5_account: 1, ticket: i, ea_source: "impulse", symbol: "EURUSD", side: "buy",
      volume: 0.1, open_price: 1, close_price: 1, sl: null, tp: null,
      open_time: ts(i), close_time: ts(i), profit, commission: 0, swap: 0,
      comment: null, magic: null,
    });
    // +100, -50, +200 ⇒ cum 100, 50, 250 (new high) ⇒ currentDD = 0
    const r = computeTradeEquity([make(1, 100), make(2, -50), make(3, 200)]);
    expect(r.currentDrawdownCash).toBe(0);
    expect(r.maxDrawdownCash).toBe(50);
  });
});
