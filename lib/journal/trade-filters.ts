import type { Deal } from "@/lib/types";
import type { TableState } from "@/components/journal/filters/use-table-state";

export interface TradeFilterResult {
  rows: Deal[];
  total: number;
  summary: { count: number; netCash: number; wins: number; losses: number };
}

export function applyTradeFilters(input: Deal[], state: TableState): TradeFilterResult {
  let rows = input;
  const { outcome, symbol, side } = state.filters;
  if (outcome === "wins") rows = rows.filter((d) => d.profit > 0);
  if (outcome === "losses") rows = rows.filter((d) => d.profit < 0);
  if (symbol) rows = rows.filter((d) => d.symbol === symbol);
  if (side === "buy" || side === "sell") rows = rows.filter((d) => d.side === side);
  if (state.search) {
    const q = state.search.toLowerCase();
    rows = rows.filter((d) =>
      d.symbol.toLowerCase().includes(q) || String(d.ticket).includes(q)
    );
  }

  const wins = rows.reduce((a, d) => a + (d.profit > 0 ? 1 : 0), 0);
  const losses = rows.reduce((a, d) => a + (d.profit < 0 ? 1 : 0), 0);
  // Net cash includes fees (commission + swap) so the summary line matches the
  // trade-equity calculation used by the KPI cards. Wins/losses counts stay
  // based on gross `profit` — a trade's "win" status reflects setup quality,
  // not whether fees nudged it across zero.
  const netCash = rows.reduce((a, d) => a + d.profit + d.commission + d.swap, 0);
  const total = rows.length;

  const [key, dir] = state.sort.split(/_(?=asc$|desc$)/) as [string, "asc" | "desc"];
  rows = [...rows].sort((a, b) => {
    let cmp = 0;
    switch (key) {
      case "closed":  cmp = a.close_time < b.close_time ? -1 : a.close_time > b.close_time ? 1 : 0; break;
      case "symbol":  cmp = a.symbol.localeCompare(b.symbol); break;
      case "side":    cmp = a.side.localeCompare(b.side); break;
      case "vol":     cmp = a.volume - b.volume; break;
      case "profit":  cmp = a.profit - b.profit; break;
      default:        cmp = a.ticket - b.ticket;
    }
    return dir === "asc" ? cmp : -cmp;
  });

  const start = (state.page - 1) * state.size;
  const sliced = rows.slice(start, start + state.size);

  return { rows: sliced, total, summary: { count: total, netCash, wins, losses } };
}
