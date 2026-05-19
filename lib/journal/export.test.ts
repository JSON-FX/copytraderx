import {
  computePips,
  dealToExportRow,
  orderToExportRow,
  toCSV,
  TRADE_COLUMNS,
  ORDER_COLUMNS,
  serializeTrades,
  serializeOrders,
  exportFilename,
  CSV_BOM,
} from "./export";
import type { Deal, OrderRow } from "@/lib/types";

const D = (over: Partial<Deal>): Deal => ({
  mt5_account: 100, ticket: 1, ea_source: "impulse",
  symbol: "GBPUSD", side: "buy", volume: 0.05,
  open_price: 1.30000, close_price: 1.30050, sl: null, tp: null,
  open_time: "2026-05-15T00:00:00Z", close_time: "2026-05-15T01:00:00Z",
  profit: 5, commission: -0.1, swap: 0, comment: null, magic: null,
  ...over,
});

const O = (over: Partial<OrderRow>): OrderRow => ({
  mt5_account: 100, ticket: 1, ea_source: "impulse",
  symbol: "XAUUSD", type: "order_type_buy_stop", state: "order_state_filled",
  volume_initial: 0.06, volume_current: 0, price_open: 4543.0, price_current: null,
  sl: null, tp: null,
  time_setup: "2026-05-19T12:00:00Z", time_done: "2026-05-19T12:00:00Z",
  comment: null, magic: null,
  ...over,
});

describe("computePips", () => {
  it("computes positive pips for a winning buy on a 4-digit pair", () => {
    expect(computePips(D({ side: "buy", open_price: 1.30000, close_price: 1.30050 }))).toBeCloseTo(5);
  });
  it("inverts sign for a winning sell", () => {
    expect(computePips(D({ side: "sell", open_price: 1.30050, close_price: 1.30000 }))).toBeCloseTo(5);
  });
  it("uses a factor of 100 for JPY pairs", () => {
    expect(computePips(D({ symbol: "USDJPY", side: "buy", open_price: 150.00, close_price: 150.50 }))).toBeCloseTo(50);
  });
});

describe("toCSV", () => {
  it("emits a header even when there are no rows", () => {
    const csv = toCSV([], ["a", "b"] as const);
    expect(csv).toBe("a,b\r\n");
  });

  it("quotes cells with commas, quotes or newlines, and doubles embedded quotes", () => {
    const csv = toCSV(
      [{ a: 'has, comma', b: 'has "quote"', c: "line\nbreak", d: 1 }],
      ["a", "b", "c", "d"] as const,
    );
    expect(csv).toBe('a,b,c,d\r\n"has, comma","has ""quote""","line\nbreak",1\r\n');
  });

  it("renders null/undefined as empty cells", () => {
    const csv = toCSV(
      [{ a: null as null, b: undefined as undefined, c: "x" }],
      ["a", "b", "c"] as const,
    );
    expect(csv).toBe("a,b,c\r\n,,x\r\n");
  });
});

describe("dealToExportRow / orderToExportRow", () => {
  it("trade row includes pips and matches column order", () => {
    const row = dealToExportRow(D({ ticket: 7 }));
    expect(Object.keys(row)).toEqual([...TRADE_COLUMNS]);
    expect(row.ticket).toBe(7);
    expect(row.pips).toBeCloseTo(5);
  });

  it("order row humanizes type and state labels", () => {
    const row = orderToExportRow(O({}));
    expect(Object.keys(row)).toEqual([...ORDER_COLUMNS]);
    expect(row.type_label).toBe("Buy Stop");
    expect(row.state_label).toBe("Filled");
  });
});

describe("serializeTrades / serializeOrders", () => {
  it("CSV trades output starts with a UTF-8 BOM", () => {
    const out = serializeTrades([D({})], "csv");
    expect(out.startsWith(CSV_BOM)).toBe(true);
    expect(out).toContain("ticket,mt5_account");
  });

  it("JSON orders output is parsable and preserves labels", () => {
    const out = serializeOrders([O({})], "json");
    const parsed = JSON.parse(out);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].type_label).toBe("Buy Stop");
  });
});

describe("exportFilename", () => {
  it("uses '-all' when no bounds are present", () => {
    expect(exportFilename(123, "trades", "csv", null, null)).toBe("123-trades-all.csv");
  });
  it("uses both UTC dates when both bounds are present", () => {
    expect(
      exportFilename(123, "orders", "json", "2026-05-01T00:00:00.000Z", "2026-05-19T23:59:59.999Z"),
    ).toBe("123-orders-2026-05-01_to_2026-05-19.json");
  });
});
