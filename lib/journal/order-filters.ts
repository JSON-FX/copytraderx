import type { OrderRow } from "@/lib/types";
import type { TableState } from "@/components/journal/filters/use-table-state";

export type StateBucket = "filled" | "canceled" | "partial" | "open" | "other";

export function classifyOrderState(raw: string): StateBucket {
  if (raw === "order_state_filled") return "filled";
  if (raw === "order_state_canceled" || raw === "order_state_expired" || raw === "order_state_rejected") return "canceled";
  if (raw === "order_state_partial") return "partial";
  if (raw === "order_state_placed") return "open";
  return "other";
}

export interface OrderFilterResult {
  rows: OrderRow[];
  total: number;
  summary: { count: number; filled: number; canceled: number };
}

export function applyOrderFilters(input: OrderRow[], state: TableState): OrderFilterResult {
  let rows = input;
  const { state: stateBucket, type, symbol } = state.filters;
  if (stateBucket) rows = rows.filter((o) => classifyOrderState(o.state) === stateBucket);
  if (type) rows = rows.filter((o) => o.type === type);
  if (symbol) rows = rows.filter((o) => o.symbol === symbol);
  if (state.search) {
    const q = state.search.toLowerCase();
    rows = rows.filter((o) => o.symbol.toLowerCase().includes(q) || String(o.ticket).includes(q));
  }

  const filled = rows.reduce((a, o) => a + (classifyOrderState(o.state) === "filled" ? 1 : 0), 0);
  const canceled = rows.reduce((a, o) => a + (classifyOrderState(o.state) === "canceled" ? 1 : 0), 0);
  const total = rows.length;

  const [key, dir] = state.sort.split(/_(?=asc$|desc$)/) as [string, "asc" | "desc"];
  rows = [...rows].sort((a, b) => {
    let cmp = 0;
    switch (key) {
      case "setup":  cmp = a.time_setup < b.time_setup ? -1 : a.time_setup > b.time_setup ? 1 : 0; break;
      case "symbol": cmp = a.symbol.localeCompare(b.symbol); break;
      case "type":   cmp = a.type.localeCompare(b.type); break;
      case "state":  cmp = a.state.localeCompare(b.state); break;
      default:       cmp = a.ticket - b.ticket;
    }
    return dir === "asc" ? cmp : -cmp;
  });

  const start = (state.page - 1) * state.size;
  return { rows: rows.slice(start, start + state.size), total, summary: { count: total, filled, canceled } };
}
