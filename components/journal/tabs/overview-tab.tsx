"use client";

import { useMemo } from "react";
import type { AccountSnapshotCurrent, AccountSnapshotDaily, Deal, License, Position, PropfirmRule } from "@/lib/types";
import { OverviewHero } from "../overview-hero";
import { ChallengeMini } from "../challenge-mini";
import { RecentTrades } from "../recent-trades";
import { PositionsTable } from "../tables/positions-table";
import { aggregateCalendar } from "@/lib/journal/calendar-aggregate";
import { computeTradeEquity } from "@/lib/journal/trade-equity";
import { fmtPctOrCash } from "@/lib/journal/format-pnl";
import { usePnlDisplay } from "../preferences/journal-chrome-context";

interface Props {
  license: License;
  rule: PropfirmRule | null;
  snapshot: AccountSnapshotCurrent | null;
  daily: AccountSnapshotDaily[];
  positions: Position[];
  deals: Deal[];
  currency: string;
  baseline: number;
}

export function OverviewTab({ license, rule, snapshot, daily, positions, deals, currency, baseline }: Props) {
  const { mode } = usePnlDisplay();
  const trade = useMemo(() => computeTradeEquity(deals), [deals]);
  const series = useMemo(() => trade.curve.map((p) => p.cumPnl), [trade.curve]);
  const winRatePct = useMemo(() => {
    if (deals.length === 0) return 0;
    return (deals.filter((d) => d.profit > 0).length / deals.length) * 100;
  }, [deals]);
  const { cumulativePct, cumulativeCash, bestDay, worstDay } = useMemo(() => {
    const cumCash = trade.netPnl;
    const cumPct = baseline > 0 ? (cumCash / baseline) * 100 : 0;
    let best = 0, worst = 0;
    for (const cell of aggregateCalendar(deals).values()) {
      if (cell.netPnl > best) best = cell.netPnl;
      if (cell.netPnl < worst) worst = cell.netPnl;
    }
    return { cumulativePct: cumPct, cumulativeCash: cumCash, bestDay: best, worstDay: worst };
  }, [trade.netPnl, deals, baseline]);

  return (
    <section className="space-y-4">
      <div className="grid gap-4 md:grid-cols-[1.4fr_1fr]">
        <OverviewHero
          cumulativePct={cumulativePct}
          cumulativeCash={cumulativeCash}
          currency={currency}
          baseline={baseline}
          series={series}
          winRatePct={winRatePct}
          bestDay={bestDay}
          worstDay={worstDay}
        />
        <ChallengeMini rule={rule} snapshot={snapshot} daily={daily} baseline={baseline} currency={currency} licenseId={license.id} />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <RecentTrades deals={deals} currency={currency} baseline={baseline} />
        <div className="rounded-xl border bg-card p-4">
          <div className="mb-2 flex items-center justify-between">
            <h4 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Open Positions · <span className="text-foreground">{positions.length}</span>
            </h4>
            <span className="text-[11px] text-muted-foreground">
              Floating {fmtPctOrCash(snapshot?.floating_pnl ?? 0, mode, baseline, currency)}
            </span>
          </div>
          <PositionsTable positions={positions} currency={currency} baseline={baseline} />
        </div>
      </div>
    </section>
  );
}
