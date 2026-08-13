import { applyTradeFilters, filterByRangeDays } from "./trade-filters";
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

describe("filterByRangeDays", () => {
  const NOW = Date.parse("2026-08-13T12:00:00Z");
  const at = (iso: string) => ({ t: iso });
  const rows = [
    at("2026-08-10T22:45:00Z"), // 3d
    at("2026-07-15T23:54:00Z"), // 29d — inside a 30d window
    at("2026-07-13T22:16:00Z"), // 31d — outside it
    at("2026-05-20T22:55:00Z"), // 85d
  ];
  const days = (n: number) => filterByRangeDays(rows, n, (r) => r.t, NOW).map((r) => r.t);

  it("keeps every row when days is 0 (all history)", () => {
    expect(days(0)).toHaveLength(4);
  });
  it("keeps every row for a negative or non-finite window", () => {
    expect(days(-1)).toHaveLength(4);
    expect(days(NaN)).toHaveLength(4);
  });
  it("keeps only rows at or after the cutoff", () => {
    expect(days(30)).toEqual(["2026-08-10T22:45:00Z", "2026-07-15T23:54:00Z"]);
    expect(days(7)).toEqual(["2026-08-10T22:45:00Z"]);
    expect(days(90)).toHaveLength(4);
  });
  it("returns the same rows the server would for the equivalent query", () => {
    const cutoff = new Date(NOW - 30 * 24 * 60 * 60 * 1000).toISOString();
    expect(days(30)).toEqual(rows.filter((r) => r.t >= cutoff).map((r) => r.t));
  });
});
