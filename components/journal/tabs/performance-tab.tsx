"use client";

import { useMemo } from "react";
import { computeTradeStats } from "@/lib/journal/trade-stats";
import { computeStreaks } from "@/lib/journal/streaks";
import { StatCard } from "../stat-card";
import { StreaksTable } from "../streaks-table";
import { EquityChart } from "../equity-chart";
import type { AccountSnapshotDaily, Deal } from "@/lib/types";

function fmtCurrency(n: number, currency: string): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(n);
}

export function PerformanceTab({
  deals, daily, currency,
}: { deals: Deal[]; daily: AccountSnapshotDaily[]; currency: string }) {
  const stats = useMemo(() => computeTradeStats(deals), [deals]);
  const streaks = useMemo(() => computeStreaks(deals), [deals]);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Net Profit" value={fmtCurrency(stats.netProfit, currency)} tone={stats.netProfit > 0 ? "positive" : stats.netProfit < 0 ? "negative" : "default"} />
        <StatCard label="Win Rate" value={`${(stats.winRate * 100).toFixed(1)}%`} sub={`${stats.wins}/${stats.totalTrades}`} />
        <StatCard label="Profit Factor" value={Number.isFinite(stats.profitFactor) ? stats.profitFactor.toFixed(2) : "∞"} />
        <StatCard label="Expected Payoff" value={fmtCurrency(stats.expectedPayoff, currency)} />
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Avg Win" value={fmtCurrency(stats.avgWin, currency)} />
        <StatCard label="Avg Loss" value={fmtCurrency(stats.avgLoss, currency)} />
        <StatCard label="Best Trade" value={fmtCurrency(stats.bestTrade, currency)} tone="positive" />
        <StatCard label="Worst Trade" value={fmtCurrency(stats.worstTrade, currency)} tone="negative" />
      </div>
      <StreaksTable streaks={streaks} />
      <div>
        <h3 className="mb-2 text-sm font-semibold text-muted-foreground">Equity Curve</h3>
        <EquityChart data={daily} currency={currency} />
      </div>
    </div>
  );
}
