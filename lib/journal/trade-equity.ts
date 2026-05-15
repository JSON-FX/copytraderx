import type { Deal } from "@/lib/types";

export interface CumulativePoint {
  ts: string;        // ISO close_time of the deal (sortable)
  cumPnl: number;    // running sum of (profit + commission + swap) up to & including this deal
  drawdown: number;  // running peak - cumPnl at this point (>= 0)
}

export interface TradeEquityResult {
  /** Chronological sequence of cumulative P/L after each closed deal. */
  curve: CumulativePoint[];
  /** Sum across all deals of (profit + commission + swap). */
  netPnl: number;
  /** Largest peak-to-trough decline on the cumulative curve, in cash. */
  maxDrawdownCash: number;
  /** Current drawdown (final point's drawdown) in cash. Zero if at a new high. */
  currentDrawdownCash: number;
  /** Total fees: sum of (commission + swap) across all deals (typically negative). */
  totalFees: number;
}

/**
 * Build the trader's cumulative P/L curve and drawdown numbers from a list of
 * closed deals. Fees (commission + swap) are included so the result reflects
 * what actually reaches the account — not just gross gains.
 *
 * The curve is anchored at zero before the first deal; each point is the
 * cumulative net P/L after that deal closes. Drawdown is measured from the
 * running peak of the curve, not from any account baseline.
 */
export function computeTradeEquity(deals: Deal[]): TradeEquityResult {
  if (deals.length === 0) {
    return { curve: [], netPnl: 0, maxDrawdownCash: 0, currentDrawdownCash: 0, totalFees: 0 };
  }
  const sorted = [...deals].sort((a, b) =>
    a.close_time < b.close_time ? -1 : a.close_time > b.close_time ? 1 : 0
  );
  let cum = 0;
  let peak = 0;
  let maxDD = 0;
  let totalFees = 0;
  const curve: CumulativePoint[] = [];
  for (const d of sorted) {
    const fees = d.commission + d.swap;
    totalFees += fees;
    cum += d.profit + fees;
    if (cum > peak) peak = cum;
    const dd = peak - cum;
    if (dd > maxDD) maxDD = dd;
    curve.push({ ts: d.close_time, cumPnl: cum, drawdown: dd });
  }
  const currentDD = curve[curve.length - 1].drawdown;
  return { curve, netPnl: cum, maxDrawdownCash: maxDD, currentDrawdownCash: currentDD, totalFees };
}
