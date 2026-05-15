"use client";

import { useMemo } from "react";
import type { AccountSnapshotCurrent, AccountSnapshotDaily } from "@/lib/types";
import { KpiCard } from "./kpi-card";
import { AccountMetadataStrip } from "./account-metadata-strip";
import { fmtCash, fmtPct } from "@/lib/journal/format-pnl";
import { usePnlDisplay } from "./preferences/journal-chrome-context";

interface Props {
  snapshot: AccountSnapshotCurrent | null;
  daily: AccountSnapshotDaily[];
  baseline: number;
}

export function LiveAccountPanel({ snapshot, daily, baseline }: Props) {
  const { mode } = usePnlDisplay();
  const currency = snapshot?.currency ?? "USD";
  const balance = snapshot?.balance ?? 0;
  const equity = snapshot?.equity ?? 0;
  const floating = snapshot?.floating_pnl ?? 0;

  const cumulativeReturn = useMemo(() => {
    if (baseline <= 0 || daily.length === 0) return null;
    const last = daily[daily.length - 1].balance_close;
    return { pct: ((last - baseline) / baseline) * 100, cash: last - baseline };
  }, [daily, baseline]);

  const drawdownPct = snapshot?.drawdown_pct ?? 0;
  const drawdownCash = baseline > 0 ? (baseline * drawdownPct) / 100 : 0;

  const equitySeries = useMemo(() => daily.map((d) => d.equity_close), [daily]);
  const balanceSeries = useMemo(() => daily.map((d) => d.balance_close), [daily]);
  const drawdownSeries = useMemo(() => daily.map((d) => Math.max(0, baseline - d.balance_close)), [daily, baseline]);

  const showPct = mode === "percent" && baseline > 0;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <KpiCard
          featured
          label="Net Return"
          tone={cumulativeReturn === null ? "neutral" : cumulativeReturn.pct > 0 ? "positive" : cumulativeReturn.pct < 0 ? "negative" : "neutral"}
          value={cumulativeReturn === null ? "—" : showPct ? fmtPct(cumulativeReturn.pct) : fmtCash(cumulativeReturn.cash, currency)}
          sub={cumulativeReturn === null ? "no daily history yet" : showPct
            ? `since start · ${fmtCash(cumulativeReturn.cash, currency)}`
            : `since start · ${fmtPct(cumulativeReturn.pct)}`}
          series={balanceSeries}
          seriesTone={cumulativeReturn && cumulativeReturn.pct < 0 ? "negative" : "positive"}
        />
        <KpiCard
          label="Equity"
          value={fmtCash(equity, currency)}
          sub={`balance ${fmtCash(balance, currency)}`}
          series={equitySeries}
          seriesTone="neutral"
        />
        <KpiCard
          label="Floating P/L"
          tone={floating > 0 ? "positive" : floating < 0 ? "negative" : "neutral"}
          value={showPct ? fmtPct(baseline > 0 ? (floating / baseline) * 100 : 0) : fmtCash(floating, currency)}
          sub={`${fmtCash(floating, currency)}`}
        />
        <KpiCard
          label="Drawdown"
          tone={drawdownPct > 0 ? "negative" : "neutral"}
          value={showPct ? fmtPct(drawdownPct) : fmtCash(drawdownCash, currency)}
          sub={`peak → trough · ${fmtCash(drawdownCash, currency)}`}
          series={drawdownSeries}
          seriesTone="negative"
        />
      </div>
      <AccountMetadataStrip snapshot={snapshot} />
    </div>
  );
}
