"use client";

import { useMemo } from "react";
import { useAccountContext } from "@/lib/hooks/use-account-context";
import { KpiCard } from "@/components/journal/kpi-card";
import { EquityChart } from "@/components/journal/equity-chart";
import { ChallengeProgressHero } from "./challenge-progress-hero";
import { RecentTradesList } from "./recent-trades-list";
import { computeTradeEquity } from "@/lib/journal/trade-equity";
import { fmtCash, fmtPct } from "@/lib/journal/format-pnl";
import { usePnlDisplay } from "@/components/journal/preferences/journal-chrome-context";

export function DashboardObjective() {
  const { deals, snapshot, baseline, currency } = useAccountContext();
  const { mode } = usePnlDisplay();

  const trade = useMemo(() => computeTradeEquity(deals), [deals]);

  const showPct = mode === "percent" && baseline.baseline > 0;
  const fmtVal = (cash: number) => showPct ? fmtPct((cash / baseline.baseline) * 100) : fmtCash(cash, currency);

  const winCount = deals.filter((d) => d.profit > 0).length;
  const winRate = deals.length > 0 ? (winCount / deals.length) * 100 : 0;
  const hasHistory = trade.curve.length > 0;

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Dashboard</h1>

      <ChallengeProgressHero />

      <div className="grid gap-4 md:grid-cols-[auto_1fr]">
        <div className="flex flex-col gap-3 md:w-48">
          <KpiCard
            featured
            label="Net P&L"
            tone={!hasHistory ? "neutral" : trade.netPnl > 0 ? "positive" : "negative"}
            value={!hasHistory ? "—" : fmtVal(trade.netPnl)}
            sub={!hasHistory ? "no trades" : `${trade.curve.length} trades`}
          />
          <KpiCard
            label="Win Rate"
            value={deals.length === 0 ? "—" : `${winRate.toFixed(1)}%`}
            sub={deals.length === 0 ? "no trades" : `${winCount}W / ${deals.length}`}
          />
          <KpiCard
            label="Equity"
            value={fmtCash(snapshot?.equity ?? 0, currency)}
            sub={`balance ${fmtCash(snapshot?.balance ?? 0, currency)}`}
          />
        </div>
        <div className="rounded-xl border bg-card p-4">
          <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Equity Curve</h3>
          <EquityChart deals={deals} currency={currency} baseline={baseline.baseline} />
        </div>
      </div>

      <RecentTradesList />
    </div>
  );
}
