import { computeStreaks } from "./streaks";
import { SAMPLE_DEALS } from "./__fixtures__/sample-deals";
import type { Deal } from "@/lib/types";

const W = (id: number, when: string): Deal => ({
  mt5_account: 1, ticket: id, ea_source: "impulse", symbol: "X", side: "buy",
  volume: 0.1, open_price: 1, close_price: 1, sl: null, tp: null,
  open_time: when, close_time: when, profit: 10, commission: 0, swap: 0,
  comment: null, magic: null,
});
const L = (id: number, when: string): Deal => ({ ...W(id, when), profit: -10 });

describe("computeStreaks", () => {
  it("returns zeros on empty input", () => {
    const s = computeStreaks([]);
    expect(s.maxWinStreak).toBe(0);
    expect(s.maxLossStreak).toBe(0);
    expect(s.currentStreak).toBe(0);
    expect(s.currentStreakKind).toBe("none");
  });

  it("treats a single win as currentStreak=1 of kind 'win'", () => {
    const s = computeStreaks([W(1, "2026-04-01T00:00:00Z")]);
    expect(s.maxWinStreak).toBe(1);
    expect(s.currentStreak).toBe(1);
    expect(s.currentStreakKind).toBe("win");
  });

  it("computes max and current from sample fixture", () => {
    // SAMPLE_DEALS = W,L,W,W,L  → win streaks: 1, 2 (max=2). loss streaks: 1, 1 (max=1).
    // current = -1 (loss).
    const s = computeStreaks(SAMPLE_DEALS);
    expect(s.maxWinStreak).toBe(2);
    expect(s.maxLossStreak).toBe(1);
    expect(s.currentStreak).toBe(1);
    expect(s.currentStreakKind).toBe("loss");
  });

  it("orders by close_time ascending before counting", () => {
    const out = [
      W(2, "2026-04-02T00:00:00Z"),
      W(1, "2026-04-01T00:00:00Z"),
      W(3, "2026-04-03T00:00:00Z"),
    ];
    const s = computeStreaks(out);
    expect(s.maxWinStreak).toBe(3);
  });

  it("ignores zero-profit trades from streak counting", () => {
    const breakeven: Deal = { ...W(99, "2026-04-06T00:00:00Z"), profit: 0 };
    const s = computeStreaks([W(1, "2026-04-01T00:00:00Z"), breakeven, W(2, "2026-04-07T00:00:00Z")]);
    expect(s.maxWinStreak).toBe(2);
    expect(s.currentStreakKind).toBe("win");
  });
});
