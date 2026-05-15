import { humanizeOrderType, humanizeOrderState } from "./order-display";

describe("humanizeOrderType", () => {
  it("maps known MT5 enums", () => {
    expect(humanizeOrderType("order_type_buy")).toEqual({ label: "Buy", variant: "buy", outline: false });
    expect(humanizeOrderType("order_type_sell")).toEqual({ label: "Sell", variant: "sell", outline: false });
    expect(humanizeOrderType("order_type_buy_limit")).toEqual({ label: "Buy Limit", variant: "buy", outline: true });
    expect(humanizeOrderType("order_type_sell_limit")).toEqual({ label: "Sell Limit", variant: "sell", outline: true });
    expect(humanizeOrderType("order_type_buy_stop")).toEqual({ label: "Buy Stop", variant: "buy", outline: true });
    expect(humanizeOrderType("order_type_sell_stop")).toEqual({ label: "Sell Stop", variant: "sell", outline: true });
    expect(humanizeOrderType("order_type_buy_stop_limit")).toEqual({ label: "Buy Stop Limit", variant: "buy", outline: true });
    expect(humanizeOrderType("order_type_sell_stop_limit")).toEqual({ label: "Sell Stop Limit", variant: "sell", outline: true });
    expect(humanizeOrderType("order_type_close_by")).toEqual({ label: "Close By", variant: "neutral", outline: false });
  });
  it("falls back to titlecase for unknown values without throwing", () => {
    expect(humanizeOrderType("order_type_foo_bar"))
      .toEqual({ label: "Foo Bar", variant: "neutral", outline: false });
    expect(humanizeOrderType("totally_unknown"))
      .toEqual({ label: "Totally Unknown", variant: "neutral", outline: false });
  });
});

describe("humanizeOrderState", () => {
  it("maps known MT5 enums", () => {
    expect(humanizeOrderState("order_state_filled")).toEqual({ label: "Filled", variant: "ok" });
    expect(humanizeOrderState("order_state_canceled")).toEqual({ label: "Canceled", variant: "neutral" });
    expect(humanizeOrderState("order_state_partial")).toEqual({ label: "Partial", variant: "warn" });
    expect(humanizeOrderState("order_state_placed")).toEqual({ label: "Pending", variant: "info" });
    expect(humanizeOrderState("order_state_rejected")).toEqual({ label: "Rejected", variant: "bad" });
    expect(humanizeOrderState("order_state_expired")).toEqual({ label: "Expired", variant: "neutral" });
  });
  it("falls back to titlecase neutral for unknown", () => {
    expect(humanizeOrderState("order_state_weird_thing"))
      .toEqual({ label: "Weird Thing", variant: "neutral" });
  });
});
