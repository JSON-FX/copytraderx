"use client";

import { useMemo } from "react";
import { useAccountContext } from "@/lib/hooks/use-account-context";
import { KpiCard } from "@/components/journal/kpi-card";
import { EquityChart } from "@/components/journal/equity-chart";
import { ChallengeProgressHero } from "./challenge-progress-hero";
import { RecentTradesList } from "./recent-trades-list";
import { computeTradeEquity } from "@/lib/journal/trade-equity";
import { evaluateObjectives } from "@/lib/journal/objectives";
import { computeDrawdownCard } from "@/lib/journal/dashboard-drawdown";
import { fmtCash, fmtPct } from "@/lib/journal/format-pnl";
import { usePnlDisplay } from "@/components/journal/preferences/journal-chrome-context";

export function DashboardObjective() {
  const { license, deals, snapshot, baseline, currency, rule, daily } = useAccountContext();
  const { mode } = usePnlDisplay();

  const trade = useMemo(() => computeTradeEquity(deals), [deals]);

  // Same evaluation the hero runs — cheap pure function, no extra queries.
  // todayUtc is re-read on each recompute (snapshot/daily polls), not at
  // mount, so it can drift up to ~5 min past UTC midnight — same known
  // limitation as ChallengeProgressHero.
  const dd = useMemo(() => {
    if (!rule || !snapshot) return null;
    const todayUtc = new Date().toISOString().slice(0, 10);
    const evaluation = evaluateObjectives({ rule, currentSnapshot: snapshot, dailySnapshots: daily, todayUtc });
    return computeDrawdownCard({ product: license.product, rule, snapshot, evaluation });
  }, [license.product, rule, snapshot, daily]);

  const showPct = mode === "percent" && baseline.baseline > 0;
  const fmtVal = (cash: number) => showPct ? fmtPct((cash / baseline.baseline) * 100) : fmtCash(cash, currency);

  const winCount = deals.filter((d) => d.profit > 0).length;
  const winRate = deals.length > 0 ? (winCount / deals.length) * 100 : 0;
  const hasHistory = trade.curve.length > 0;

  // Drawdown is shown against account size (not baseline) so the % matches
  // the Prop Firms page; the 0-guards avoid "−0.00%" / "-$0.00" displays.
  const ddValue = !dd ? "—"
    : mode === "percent"
      ? fmtPct(dd.drawdownPct > 0 ? -dd.drawdownPct : 0)
      : fmtCash(dd.drawdownCash > 0 ? -dd.drawdownCash : 0, currency);
  // `||` is deliberate: both limits are null ⇔ funded account, and it keeps
  // TypeScript's non-null narrowing for the limit branches below.
  const ddSub = !dd ? "no data"
    : dd.limitCash === null || dd.limitPct === null
      ? "MT5 reported"
      : mode === "percent"
        ? `limit ${fmtPct(-dd.limitPct)}`
        : `limit ${fmtCash(-dd.limitCash, currency)}`;

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
          <KpiCard
            label="Drawdown"
            tone={dd?.tone ?? "neutral"}
            value={ddValue}
            sub={ddSub}
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
