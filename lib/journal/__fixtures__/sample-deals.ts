// lib/journal/__fixtures__/sample-deals.ts
import type { Deal } from "@/lib/types";

export const SAMPLE_DEALS: Deal[] = [
  // Win, +$100
  { mt5_account: 1, ticket: 1, ea_source: "impulse", symbol: "EURUSD", side: "buy",
    volume: 0.10, open_price: 1.10, close_price: 1.11, sl: null, tp: null,
    open_time: "2026-04-01T10:00:00Z", close_time: "2026-04-01T11:00:00Z",
    profit: 100, commission: -5, swap: 0, comment: null, magic: null },
  // Loss, -$50
  { mt5_account: 1, ticket: 2, ea_source: "impulse", symbol: "EURUSD", side: "sell",
    volume: 0.05, open_price: 1.11, close_price: 1.12, sl: null, tp: null,
    open_time: "2026-04-02T10:00:00Z", close_time: "2026-04-02T11:00:00Z",
    profit: -50, commission: -2, swap: 0, comment: null, magic: null },
  // Win, +$200
  { mt5_account: 1, ticket: 3, ea_source: "impulse", symbol: "GBPUSD", side: "buy",
    volume: 0.20, open_price: 1.25, close_price: 1.26, sl: null, tp: null,
    open_time: "2026-04-03T10:00:00Z", close_time: "2026-04-03T11:00:00Z",
    profit: 200, commission: -8, swap: 0, comment: null, magic: null },
  // Win, +$50
  { mt5_account: 1, ticket: 4, ea_source: "impulse", symbol: "EURUSD", side: "buy",
    volume: 0.05, open_price: 1.10, close_price: 1.105, sl: null, tp: null,
    open_time: "2026-04-04T10:00:00Z", close_time: "2026-04-04T11:00:00Z",
    profit: 50, commission: -2, swap: 0, comment: null, magic: null },
  // Loss, -$30
  { mt5_account: 1, ticket: 5, ea_source: "impulse", symbol: "GBPUSD", side: "sell",
    volume: 0.05, open_price: 1.26, close_price: 1.27, sl: null, tp: null,
    open_time: "2026-04-05T10:00:00Z", close_time: "2026-04-05T11:00:00Z",
    profit: -30, commission: -2, swap: 0, comment: null, magic: null },
];
// Totals: 3 wins ($350), 2 losses (-$80), net $270.
// Win rate = 60%. Profit factor = 350 / 80 = 4.375.
// Avg win = 350/3 ≈ 116.67. Avg loss = 80/2 = 40.
// Expected payoff = (116.67 × 0.6) - (40 × 0.4) = 70 - 16 = 54.
// Best = 200, worst = -50.
