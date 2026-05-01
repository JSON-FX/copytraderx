import type { Deal } from "@/lib/types";

export interface TradeStats {
  totalTrades: number;
  wins: number;
  losses: number;
  winRate: number;          // 0..1
  grossProfit: number;
  grossLoss: number;        // positive number
  netProfit: number;
  profitFactor: number;     // grossProfit / grossLoss; Infinity when no losses
  avgWin: number;
  avgLoss: number;          // positive number
  bestTrade: number;
  worstTrade: number;
  expectedPayoff: number;
}

const EMPTY: TradeStats = {
  totalTrades: 0, wins: 0, losses: 0, winRate: 0,
  grossProfit: 0, grossLoss: 0, netProfit: 0,
  profitFactor: 0, avgWin: 0, avgLoss: 0,
  bestTrade: 0, worstTrade: 0, expectedPayoff: 0,
};

export function computeTradeStats(deals: Deal[]): TradeStats {
  if (deals.length === 0) return { ...EMPTY };

  let wins = 0, losses = 0;
  let grossProfit = 0, grossLoss = 0;
  let best = -Infinity, worst = Infinity;

  for (const d of deals) {
    if (d.profit > 0) { wins++; grossProfit += d.profit; }
    else if (d.profit < 0) { losses++; grossLoss += -d.profit; }
    if (d.profit > best) best = d.profit;
    if (d.profit < worst) worst = d.profit;
  }

  const totalTrades = deals.length;
  const winRate = wins / totalTrades;
  const netProfit = grossProfit - grossLoss;
  const profitFactor = grossLoss === 0
    ? (grossProfit > 0 ? Number.POSITIVE_INFINITY : 0)
    : grossProfit / grossLoss;
  const avgWin = wins === 0 ? 0 : grossProfit / wins;
  const avgLoss = losses === 0 ? 0 : grossLoss / losses;
  const expectedPayoff = avgWin * winRate - avgLoss * (1 - winRate);

  return {
    totalTrades, wins, losses, winRate,
    grossProfit, grossLoss, netProfit,
    profitFactor, avgWin, avgLoss,
    bestTrade: best === -Infinity ? 0 : best,
    worstTrade: worst === Infinity ? 0 : worst,
    expectedPayoff,
  };
}
