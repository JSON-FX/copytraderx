import { applyOrderFilters, classifyOrderState } from "./order-filters";
import type { OrderRow } from "@/lib/types";

const O = (over: Partial<OrderRow>): OrderRow => ({
  mt5_account: 1, ticket: 1, ea_source: "impulse", symbol: "GBPUSD",
  type: "order_type_buy", state: "order_state_filled",
  volume_initial: 0.05, volume_current: 0,
  price_open: 1.34, price_current: null, sl: null, tp: null,
  time_setup: "2026-05-15T01:58:00Z", time_done: "2026-05-15T01:58:00Z",
  comment: null, magic: null, ...over,
});

describe("classifyOrderState", () => {
  it("maps filled / canceled / partial / open buckets", () => {
    expect(classifyOrderState("order_state_filled")).toBe("filled");
    expect(classifyOrderState("order_state_canceled")).toBe("canceled");
    expect(classifyOrderState("order_state_partial")).toBe("partial");
    expect(classifyOrderState("order_state_placed")).toBe("open");
  });
});

describe("applyOrderFilters", () => {
  const rows: OrderRow[] = [
    O({ ticket: 1, state: "order_state_filled" }),
    O({ ticket: 2, state: "order_state_canceled" }),
    O({ ticket: 3, state: "order_state_filled", symbol: "EURUSD", type: "order_type_sell_stop" }),
  ];
  it("filters by state bucket", () => {
    expect(applyOrderFilters(rows, { sort: "setup_desc", page: 1, size: 25, filters: { state: "filled" }, search: "" }).total).toBe(2);
    expect(applyOrderFilters(rows, { sort: "setup_desc", page: 1, size: 25, filters: { state: "canceled" }, search: "" }).total).toBe(1);
  });
  it("filters by type and symbol", () => {
    expect(applyOrderFilters(rows, { sort: "setup_desc", page: 1, size: 25, filters: { type: "order_type_sell_stop" }, search: "" }).total).toBe(1);
    expect(applyOrderFilters(rows, { sort: "setup_desc", page: 1, size: 25, filters: { symbol: "EURUSD" }, search: "" }).total).toBe(1);
  });
});
