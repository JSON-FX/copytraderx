import { applyTradeFilters } from "./trade-filters";
import type { Deal } from "@/lib/types";

const D = (over: Partial<Deal>): Deal => ({
  mt5_account: 1, ticket: 1, ea_source: "impulse",
  symbol: "GBPUSD", side: "buy", volume: 0.05,
  open_price: 1.35, close_price: 1.34, sl: null, tp: null,
  open_time: "2026-05-15T00:00:00Z", close_time: "2026-05-15T01:00:00Z",
  profit: 0, commission: 0, swap: 0, comment: null, magic: null,
  ...over,
});

describe("applyTradeFilters", () => {
  const rows: Deal[] = [
    D({ ticket: 1, profit: 48.55, side: "sell", symbol: "GBPUSD", close_time: "2026-05-15T01:00:00Z" }),
    D({ ticket: 2, profit: -13.71, side: "buy", symbol: "GBPUSD", close_time: "2026-05-12T17:00:00Z" }),
    D({ ticket: 3, profit: -15.45, side: "sell", symbol: "EURUSD", close_time: "2026-05-06T16:00:00Z" }),
  ];

  it("returns everything when filters empty", () => {
    const r = applyTradeFilters(rows, { sort: "closed_desc", page: 1, size: 25, filters: {}, search: "" });
    expect(r.total).toBe(3);
    expect(r.rows.map((d) => d.ticket)).toEqual([1, 2, 3]);
  });
  it("filters wins / losses", () => {
    expect(applyTradeFilters(rows, { sort: "closed_desc", page: 1, size: 25, filters: { outcome: "wins" }, search: "" }).total).toBe(1);
    expect(applyTradeFilters(rows, { sort: "closed_desc", page: 1, size: 25, filters: { outcome: "losses" }, search: "" }).total).toBe(2);
  });
  it("filters by symbol", () => {
    expect(applyTradeFilters(rows, { sort: "closed_desc", page: 1, size: 25, filters: { symbol: "EURUSD" }, search: "" }).total).toBe(1);
  });
  it("filters by side", () => {
    expect(applyTradeFilters(rows, { sort: "closed_desc", page: 1, size: 25, filters: { side: "buy" }, search: "" }).total).toBe(1);
  });
  it("searches across ticket / symbol", () => {
    expect(applyTradeFilters(rows, { sort: "closed_desc", page: 1, size: 25, filters: {}, search: "EUR" }).total).toBe(1);
    expect(applyTradeFilters(rows, { sort: "closed_desc", page: 1, size: 25, filters: {}, search: "2" }).total).toBe(1);
  });
  it("sorts and paginates", () => {
    const r = applyTradeFilters(rows, { sort: "closed_asc", page: 1, size: 2, filters: {}, search: "" });
    expect(r.rows.map((d) => d.ticket)).toEqual([3, 2]);
    expect(r.total).toBe(3);
  });
});
