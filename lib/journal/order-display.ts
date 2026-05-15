export type OrderSideVariant = "buy" | "sell" | "neutral";
export type OrderStateVariant = "ok" | "warn" | "bad" | "info" | "neutral";

export interface OrderTypeDisplay {
  label: string;
  variant: OrderSideVariant;
  outline: boolean;
}

export interface OrderStateDisplay {
  label: string;
  variant: OrderStateVariant;
}

const TYPE_MAP: Record<string, OrderTypeDisplay> = {
  order_type_buy:              { label: "Buy",             variant: "buy",     outline: false },
  order_type_sell:             { label: "Sell",            variant: "sell",    outline: false },
  order_type_buy_limit:        { label: "Buy Limit",       variant: "buy",     outline: true  },
  order_type_sell_limit:       { label: "Sell Limit",      variant: "sell",    outline: true  },
  order_type_buy_stop:         { label: "Buy Stop",        variant: "buy",     outline: true  },
  order_type_sell_stop:        { label: "Sell Stop",       variant: "sell",    outline: true  },
  order_type_buy_stop_limit:   { label: "Buy Stop Limit",  variant: "buy",     outline: true  },
  order_type_sell_stop_limit:  { label: "Sell Stop Limit", variant: "sell",    outline: true  },
  order_type_close_by:         { label: "Close By",        variant: "neutral", outline: false },
};

const STATE_MAP: Record<string, OrderStateDisplay> = {
  order_state_filled:   { label: "Filled",   variant: "ok"      },
  order_state_canceled: { label: "Canceled", variant: "neutral" },
  order_state_partial:  { label: "Partial",  variant: "warn"    },
  order_state_placed:   { label: "Pending",  variant: "info"    },
  order_state_rejected: { label: "Rejected", variant: "bad"     },
  order_state_expired:  { label: "Expired",  variant: "neutral" },
};

function titleCase(value: string): string {
  return value
    .replace(/^order_(type|state)_/, "")
    .split("_")
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

export function humanizeOrderType(raw: string): OrderTypeDisplay {
  return TYPE_MAP[raw] ?? { label: titleCase(raw), variant: "neutral", outline: false };
}

export function humanizeOrderState(raw: string): OrderStateDisplay {
  return STATE_MAP[raw] ?? { label: titleCase(raw), variant: "neutral" };
}
