"use client";

import { useMemo } from "react";
import { useAccountContext } from "@/lib/hooks/use-account-context";
import { KpiCard } from "@/components/journal/kpi-card";
import { EquityChart } from "@/components/journal/equity-chart";
import { RecentTradesList } from "./recent-trades-list";
import { WeeklyCalendarMini } from "./weekly-calendar-mini";
import { DateRangeSelector } from "./date-range-selector";
import { computeTradeEquity } from "@/lib/journal/trade-equity";
import { fmtCash, fmtPct } from "@/lib/journal/format-pnl";
import { usePnlDisplay } from "@/components/journal/preferences/journal-chrome-context";

export function DashboardKpiGrid() {
  const { deals, daily, snapshot, baseline, currency } = useAccountContext();
  const { mode } = usePnlDisplay();

  const trade = useMemo(() => computeTradeEquity(deals), [deals]);
  const cumPnlSeries = useMemo(() => trade.curve.map((p) => p.cumPnl), [trade.curve]);
  const drawdownSeries = useMemo(() => trade.curve.map((p) => p.drawdown), [trade.curve]);
  const balanceSeries = useMemo(() => daily.map((d) => d.balance_close), [daily]);

  const showPct = mode === "percent" && baseline.baseline > 0;
  const fmtVal = (cash: number) => showPct ? fmtPct((cash / baseline.baseline) * 100) : fmtCash(cash, currency);

  const winCount = deals.filter((d) => d.profit > 0).length;
  const lossCount = deals.filter((d) => d.profit < 0).length;
  const beCount = deals.filter((d) => d.profit === 0).length;
  const winRate = deals.length > 0 ? (winCount / deals.length) * 100 : 0;
  const hasHistory = trade.curve.length > 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Dashboard</h1>
        <DateRangeSelector />
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          featured
          label="Net P&L"
          tone={!hasHistory ? "neutral" : trade.netPnl > 0 ? "positive" : "negative"}
          value={!hasHistory ? "—" : fmtVal(trade.netPnl)}
          sub={!hasHistory ? "no closed trades" : `${trade.curve.length} trades`}
          series={cumPnlSeries}
          seriesTone={trade.netPnl < 0 ? "negative" : "positive"}
        />
        <KpiCard
          label="Win Rate"
          value={deals.length === 0 ? "—" : `${winRate.toFixed(1)}%`}
          sub={deals.length === 0 ? "no trades" : `${winCount}W · ${lossCount}L · ${beCount}BE`}
        />
        <KpiCard
          label="Max Drawdown"
          tone={trade.maxDrawdownCash > 0 ? "negative" : "neutral"}
          value={!hasHistory ? "—" : fmtVal(-trade.maxDrawdownCash)}
          sub={!hasHistory ? "no trades" : `current ${fmtVal(-trade.currentDrawdownCash)}`}
          series={drawdownSeries}
          seriesTone="negative"
        />
        <KpiCard
          label="Equity"
          value={fmtCash(snapshot?.equity ?? 0, currency)}
          sub={`balance ${fmtCash(snapshot?.balance ?? 0, currency)}`}
          series={balanceSeries}
          seriesTone="neutral"
        />
      </div>

      <div className="rounded-xl border bg-card p-4">
        <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Equity Curve</h3>
        <EquityChart deals={deals} currency={currency} baseline={baseline.baseline} />
      </div>

      <div className="grid gap-4 md:grid-cols-[1.5fr_1fr]">
        <RecentTradesList />
        <WeeklyCalendarMini />
      </div>
    </div>
  );
}
