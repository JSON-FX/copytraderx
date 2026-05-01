// lib/journal/trade-stats.test.ts
import { computeTradeStats } from "./trade-stats";
import { SAMPLE_DEALS } from "./__fixtures__/sample-deals";

describe("computeTradeStats", () => {
  it("returns zeros for an empty array", () => {
    const s = computeTradeStats([]);
    expect(s.totalTrades).toBe(0);
    expect(s.winRate).toBe(0);
    expect(s.netProfit).toBe(0);
    expect(s.profitFactor).toBe(0);
  });

  it("computes counts and rates from sample fixture", () => {
    const s = computeTradeStats(SAMPLE_DEALS);
    expect(s.totalTrades).toBe(5);
    expect(s.wins).toBe(3);
    expect(s.losses).toBe(2);
    expect(s.winRate).toBeCloseTo(0.6, 5);
  });

  it("computes net profit and gross sums", () => {
    const s = computeTradeStats(SAMPLE_DEALS);
    expect(s.grossProfit).toBe(350);
    expect(s.grossLoss).toBe(80);
    expect(s.netProfit).toBe(270);
  });

  it("computes profit factor", () => {
    const s = computeTradeStats(SAMPLE_DEALS);
    expect(s.profitFactor).toBeCloseTo(4.375, 4);
  });

  it("returns Infinity profit factor when there are no losses", () => {
    const winsOnly = SAMPLE_DEALS.filter((d) => d.profit > 0);
    const s = computeTradeStats(winsOnly);
    expect(s.profitFactor).toBe(Number.POSITIVE_INFINITY);
  });

  it("computes avg win/loss and best/worst", () => {
    const s = computeTradeStats(SAMPLE_DEALS);
    expect(s.avgWin).toBeCloseTo(350 / 3, 4);
    expect(s.avgLoss).toBe(40);
    expect(s.bestTrade).toBe(200);
    expect(s.worstTrade).toBe(-50);
  });

  it("computes expected payoff", () => {
    const s = computeTradeStats(SAMPLE_DEALS);
    expect(s.expectedPayoff).toBeCloseTo(54, 4);
  });
});
