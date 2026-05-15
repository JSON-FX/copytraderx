"use client";

import { useMemo } from "react";
import type { AccountSnapshotCurrent, AccountSnapshotDaily, Deal } from "@/lib/types";
import type { BaselineSource } from "@/lib/journal/baseline";
import { KpiCard } from "./kpi-card";
import { AccountMetadataStrip } from "./account-metadata-strip";
import { fmtCash, fmtPct } from "@/lib/journal/format-pnl";
import { computeTradeEquity } from "@/lib/journal/trade-equity";
import { usePnlDisplay } from "./preferences/journal-chrome-context";

interface Props {
  snapshot: AccountSnapshotCurrent | null;
  deals: Deal[];
  daily: AccountSnapshotDaily[];
  baseline: number;
  baselineSource: BaselineSource;
}

const BASELINE_SOURCE_LABEL: Record<Exclude<BaselineSource, null>, string> = {
  rule: "propfirm rule account size",
  first_daily: "earliest daily snapshot",
  current: "current balance (no history yet)",
};

export function LiveAccountPanel({ snapshot, deals, daily, baseline, baselineSource }: Props) {
  const { mode } = usePnlDisplay();
  const currency = snapshot?.currency ?? "USD";
  const balance = snapshot?.balance ?? 0;
  const equity = snapshot?.equity ?? 0;
  const floating = snapshot?.floating_pnl ?? 0;

  const trade = useMemo(() => computeTradeEquity(deals), [deals]);

  const cumPnlSeries = useMemo(() => trade.curve.map((p) => p.cumPnl), [trade.curve]);
  const drawdownSeries = useMemo(() => trade.curve.map((p) => p.drawdown), [trade.curve]);
  const balanceSeries = useMemo(() => daily.map((d) => d.balance_close), [daily]);

  // Deposit baseline = the earliest balance we have on record for this
  // account. This represents the user's actual cash-in, not the propfirm
  // rule's account_size (which is the *target* for Objectives but may differ
  // from what was deposited). Used exclusively by the Account Profit card.
  const depositBaseline = useMemo(() => {
    if (daily.length === 0) return snapshot?.balance ?? 0;
    let earliest = daily[0];
    for (const d of daily) {
      if (d.trade_date < earliest.trade_date) earliest = d;
    }
    return earliest.balance_close;
  }, [daily, snapshot]);

  // Account profit = current balance vs deposit baseline. Reflects every
  // balance event (trades, fees, deposits, withdrawals). Complement to
  // Net Return, which isolates trade-only P/L.
  const accountProfit = useMemo(() => {
    if (depositBaseline <= 0) return null;
    const liveBalance = snapshot?.balance ?? (daily.length > 0 ? daily[daily.length - 1].balance_close : null);
    if (liveBalance === null) return null;
    const cash = liveBalance - depositBaseline;
    return { cash, pct: (cash / depositBaseline) * 100 };
  }, [snapshot, daily, depositBaseline]);

  const showPct = mode === "percent" && baseline > 0;
  const fmtAmount = (cash: number) => showPct ? fmtPct((cash / baseline) * 100) : fmtCash(cash, currency);

  // Account Profit uses its own deposit baseline, independent of the
  // page-level baseline (which may be a propfirm rule).
  const showAcctPct = mode === "percent" && depositBaseline > 0;
  const fmtAcctAmount = (cash: number) =>
    showAcctPct ? fmtPct((cash / depositBaseline) * 100) : fmtCash(cash, currency);

  const hasTradeHistory = trade.curve.length > 0;

  const netReturnTooltip = baselineSource
    ? `Baseline ${fmtCash(baseline, currency)} (${BASELINE_SOURCE_LABEL[baselineSource]}). Net Return and Max Drawdown are computed from the trade ledger (profit + commission + swap, summed chronologically) — deposits and withdrawals do not affect these numbers.`
    : `Baseline unavailable — waiting for first daily snapshot.`;

  const accountProfitTooltip = depositBaseline > 0
    ? `Current balance ${fmtCash(balance, currency)} vs initial deposit ${fmtCash(depositBaseline, currency)} (earliest balance on record for this account). Reflects every balance event — trades, fees, deposits, and withdrawals. Diverges from Net Return when the account has had deposits or withdrawals.`
    : `Initial deposit unavailable — waiting for first daily snapshot.`;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <KpiCard
          featured
          label="Net Return"
          tone={!hasTradeHistory ? "neutral" : trade.netPnl > 0 ? "positive" : trade.netPnl < 0 ? "negative" : "neutral"}
          value={!hasTradeHistory ? "—" : fmtAmount(trade.netPnl)}
          sub={!hasTradeHistory ? "no closed trades yet" : showPct
            ? `${trade.curve.length} trade${trade.curve.length === 1 ? "" : "s"} · ${fmtCash(trade.netPnl, currency)}`
            : `${trade.curve.length} trade${trade.curve.length === 1 ? "" : "s"} · ${fmtPct(baseline > 0 ? (trade.netPnl / baseline) * 100 : 0)}`}
          series={cumPnlSeries}
          seriesTone={trade.netPnl < 0 ? "negative" : "positive"}
          tooltip={netReturnTooltip}
        />
        <KpiCard
          label="Account Profit"
          tone={accountProfit === null ? "neutral" : accountProfit.cash > 0 ? "positive" : accountProfit.cash < 0 ? "negative" : "neutral"}
          value={accountProfit === null ? "—" : fmtAcctAmount(accountProfit.cash)}
          sub={accountProfit === null ? "no daily history yet" : showAcctPct
            ? `vs deposit ${fmtCash(depositBaseline, currency)} · ${fmtCash(accountProfit.cash, currency)}`
            : `vs deposit ${fmtCash(depositBaseline, currency)} · ${fmtPct(accountProfit.pct)}`}
          series={balanceSeries}
          seriesTone={accountProfit && accountProfit.cash < 0 ? "negative" : "positive"}
          tooltip={accountProfitTooltip}
        />
        <KpiCard
          label="Equity"
          value={fmtCash(equity, currency)}
          sub={`balance ${fmtCash(balance, currency)} · floating ${fmtCash(floating, currency)}`}
          series={balanceSeries}
          seriesTone="neutral"
          tooltip="Current account equity (live broker value, including open-position P/L). Sparkline is your daily balance history."
        />
        <KpiCard
          label="Max Drawdown"
          tone={trade.maxDrawdownCash > 0 ? "negative" : "neutral"}
          value={!hasTradeHistory ? "—" : fmtAmount(-trade.maxDrawdownCash)}
          sub={!hasTradeHistory ? "no closed trades yet" : `current ${fmtAmount(-trade.currentDrawdownCash)}`}
          series={drawdownSeries}
          seriesTone="negative"
          tooltip="Worst peak-to-trough decline on your cumulative trade P/L curve. The subline shows how far below the trading high-water mark you are right now (zero if you just hit a new high)."
        />
      </div>
      <AccountMetadataStrip snapshot={snapshot} />
    </div>
  );
}
