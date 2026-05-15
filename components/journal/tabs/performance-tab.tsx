"use client";

import { useMemo } from "react";
import { computeTradeStats } from "@/lib/journal/trade-stats";
import { computeStreaks } from "@/lib/journal/streaks";
import { computeTradeEquity } from "@/lib/journal/trade-equity";
import { StreaksTable } from "../streaks-table";
import { EquityChart } from "../equity-chart";
import { PnlHistogram } from "../pnl-histogram";
import { fmtCash, fmtPct, fmtPctOrCash } from "@/lib/journal/format-pnl";
import { usePnlDisplay } from "../preferences/journal-chrome-context";
import type { AccountSnapshotDaily, Deal } from "@/lib/types";
import { cn } from "@/lib/utils";

export function PerformanceTab({ deals, daily: _daily, currency, baseline }: {
  deals: Deal[]; daily: AccountSnapshotDaily[]; currency: string; baseline: number;
}) {
  const { mode } = usePnlDisplay();
  const stats = useMemo(() => computeTradeStats(deals), [deals]);
  const streaks = useMemo(() => computeStreaks(deals), [deals]);
  const trade = useMemo(() => computeTradeEquity(deals), [deals]);
  const showPct = mode === "percent" && baseline > 0;

  // Net Return on the Performance tab matches the KPI card: includes fees.
  // computeTradeStats.netProfit is gross (no fees) and used elsewhere for
  // win-rate context, so we surface the fees-inclusive number from
  // computeTradeEquity here.
  const netWithFees = trade.netPnl;

  return (
    <section className="space-y-5">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatTile featured label="Net Return"
          tone={netWithFees > 0 ? "pos" : netWithFees < 0 ? "neg" : "neutral"}
          value={fmtPctOrCash(netWithFees, mode, baseline, currency)}
          sub={showPct
            ? `${fmtCash(netWithFees, currency)} net of ${fmtCash(-trade.totalFees, currency)} fees`
            : `${fmtPct(baseline > 0 ? (netWithFees / baseline) * 100 : 0)} · net of ${fmtCash(-trade.totalFees, currency)} fees`} />
        <StatTile label="Win Rate" value={`${(stats.winRate * 100).toFixed(1)}%`}
          sub={`${stats.wins} win${stats.wins === 1 ? "" : "s"} / ${stats.totalTrades} trade${stats.totalTrades === 1 ? "" : "s"}`} />
        <StatTile label="Profit Factor"
          value={Number.isFinite(stats.profitFactor) ? stats.profitFactor.toFixed(2) : "∞"}
          sub={`${fmtCash(stats.grossProfit, currency)} gain / ${fmtCash(stats.grossLoss, currency)} loss`} />
        <StatTile label="Expected Payoff"
          tone={stats.expectedPayoff > 0 ? "pos" : stats.expectedPayoff < 0 ? "neg" : "neutral"}
          value={fmtPctOrCash(stats.expectedPayoff, mode, baseline, currency)}
          sub="avg gross P/L per trade" />
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatTile label="Avg Win" tone="pos" value={fmtPctOrCash(stats.avgWin, mode, baseline, currency)} sub={fmtCash(stats.avgWin, currency)} />
        <StatTile label="Avg Loss" tone="neg" value={fmtPctOrCash(-stats.avgLoss, mode, baseline, currency)} sub={fmtCash(-stats.avgLoss, currency)} />
        <StatTile label="Best Trade" tone="pos" value={fmtPctOrCash(stats.bestTrade, mode, baseline, currency)} sub={fmtCash(stats.bestTrade, currency)} />
        <StatTile label="Worst Trade" tone="neg" value={fmtPctOrCash(stats.worstTrade, mode, baseline, currency)} sub={fmtCash(stats.worstTrade, currency)} />
      </div>

      <div className="rounded-lg border bg-card p-4">
        <div className="mb-2 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold">Equity Curve</h3>
            <p className="text-xs text-muted-foreground">cumulative trade P/L (profit + commission + swap)</p>
          </div>
        </div>
        <EquityChart deals={deals} currency={currency} baseline={baseline} />
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <StreaksTable streaks={streaks} />
        <PnlHistogram values={deals.map((d) => d.profit + d.commission + d.swap)} baseline={baseline} currency={currency} showPct={showPct} />
      </div>
    </section>
  );
}

function StatTile({ label, value, sub, tone = "neutral", featured }: {
  label: string; value: React.ReactNode; sub?: React.ReactNode;
  tone?: "pos" | "neg" | "neutral"; featured?: boolean;
}) {
  return (
    <div className={cn(
      "rounded-lg border p-4",
      featured ? "bg-gradient-to-br from-muted/40 to-card" : "bg-card",
    )}>
      <div className="text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={cn(
        "mt-1 text-xl font-bold tabular-nums tracking-tight",
        tone === "pos" && "text-emerald-600 dark:text-emerald-400",
        tone === "neg" && "text-red-600 dark:text-red-400",
      )}>{value}</div>
      {sub != null && <div className="mt-1 text-[11px] text-muted-foreground">{sub}</div>}
    </div>
  );
}
