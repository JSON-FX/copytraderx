"use client";

import { useMemo } from "react";
import type { AccountSnapshotCurrent, AccountSnapshotDaily, Deal, PropfirmRule } from "@/lib/types";
import { evaluateObjectives } from "@/lib/journal/objectives";
import { buildPasserCards } from "@/lib/journal/passer-progress";
import { computeTradeEquity } from "@/lib/journal/trade-equity";
import { KpiCard } from "./kpi-card";
import { AccountMetadataStrip } from "./account-metadata-strip";
import { usePnlDisplay } from "./preferences/journal-chrome-context";

interface Props {
  snapshot: AccountSnapshotCurrent | null;
  daily: AccountSnapshotDaily[];
  deals: Deal[];
  rule: PropfirmRule | null;
  baseline: number;
}

export function PasserHeadlineCards({ snapshot, daily, deals, rule, baseline }: Props) {
  const { mode } = usePnlDisplay();
  const currency = snapshot?.currency ?? "USD";
  const todayUtc = new Date().toISOString().slice(0, 10);

  const trade = useMemo(() => computeTradeEquity(deals), [deals]);
  const cumPnlSeries = useMemo(() => trade.curve.map((p) => p.cumPnl), [trade.curve]);
  const balanceSeries = useMemo(() => daily.map((d) => d.balance_close), [daily]);

  const objectives = useMemo(() => {
    if (!rule || !snapshot) return null;
    return evaluateObjectives({ rule, currentSnapshot: snapshot, dailySnapshots: daily, todayUtc });
  }, [rule, snapshot, daily, todayUtc]);

  const profitTargetPct = rule
    ? (rule.target_type === "percent" ? rule.profit_target : (rule.profit_target / rule.account_size) * 100)
    : 0;

  const displayMode = mode === "dollar" ? "cash" : mode;
  const cards = buildPasserCards(objectives, snapshot, baseline, currency, displayMode, profitTargetPct);

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <KpiCard
          featured
          label={cards.progress.label}
          value={cards.progress.value}
          sub={cards.progress.sub}
          tone={cards.progress.tone}
          subTone={cards.progress.subTone}
          progressBar={cards.progress.progressBar}
          empty={cards.progress.empty}
          series={cumPnlSeries}
          seriesTone={cards.progress.tone === "negative" ? "negative" : "positive"}
        />
        <KpiCard
          label={cards.equity.label}
          value={cards.equity.value}
          sub={cards.equity.sub}
          tone={cards.equity.tone}
          subTone={cards.equity.subTone}
          empty={cards.equity.empty}
          series={balanceSeries}
          seriesTone="neutral"
        />
        <KpiCard
          label={cards.buffer.label}
          value={cards.buffer.value}
          sub={cards.buffer.sub}
          tone={cards.buffer.tone}
          progressBar={cards.buffer.progressBar}
          empty={cards.buffer.empty}
        />
      </div>
      <AccountMetadataStrip snapshot={snapshot} />
    </div>
  );
}
