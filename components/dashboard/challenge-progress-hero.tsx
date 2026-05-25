"use client";

import { useMemo } from "react";
import { useAccountContext } from "@/lib/hooks/use-account-context";
import { evaluateObjectives } from "@/lib/journal/objectives";
import { fmtCash } from "@/lib/journal/format-pnl";
import { cn } from "@/lib/utils";

type ChallengeStatus = "on_track" | "watch" | "breach";

export function ChallengeProgressHero() {
  const { rule, snapshot, daily, currency } = useAccountContext();

  const evaluation = useMemo(() => {
    if (!rule || !snapshot) return null;
    const todayUtc = new Date().toISOString().slice(0, 10);
    return evaluateObjectives({ rule, currentSnapshot: snapshot, dailySnapshots: daily, todayUtc });
  }, [rule, snapshot, daily]);

  if (!rule || !evaluation) return null;

  const status: ChallengeStatus =
    evaluation.dailyLossBreached || evaluation.totalLossBreached ? "breach"
    : (evaluation.todaysPnl < 0 && Math.abs(evaluation.todaysPnl) >= evaluation.dailyLossThreshold * 0.7)
      || evaluation.totalDrawdown >= evaluation.totalLossThreshold * 0.7 ? "watch"
    : "on_track";

  const statusLabel = { on_track: "ON TRACK", watch: "WATCH", breach: "BREACH" }[status];
  const statusColor = {
    on_track: "bg-emerald-500/15 text-emerald-500",
    watch: "bg-amber-500/15 text-amber-500",
    breach: "bg-red-500/15 text-red-500",
  }[status];

  const profitPct = evaluation.profitTargetThreshold > 0
    ? Math.min(100, (Math.max(0, evaluation.netProfit) / evaluation.profitTargetThreshold) * 100) : 0;
  const dailyPct = evaluation.dailyLossThreshold > 0
    ? Math.min(100, (Math.abs(evaluation.todaysPnl) / evaluation.dailyLossThreshold) * 100) : 0;
  const totalPct = evaluation.totalLossThreshold > 0
    ? Math.min(100, (evaluation.totalDrawdown / evaluation.totalLossThreshold) * 100) : 0;

  const daysRemaining = rule.max_trading_days
    ? Math.max(0, rule.max_trading_days - evaluation.tradingDaysCount)
    : null;

  const cur = currency;

  return (
    <div className="rounded-xl border bg-gradient-to-br from-card to-muted/20 p-5">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-wider text-[#2DAA47]">
            Challenge Progress
          </div>
          <div className="mt-0.5 text-base font-bold">{rule.name}</div>
        </div>
        <span className={cn("rounded-md px-2.5 py-1 text-[10px] font-semibold", statusColor)}>
          {statusLabel}
        </span>
      </div>

      <div className="space-y-3">
        <ProgressRow
          label="Profit Target"
          current={fmtCash(evaluation.netProfit, cur)}
          limit={fmtCash(evaluation.profitTargetThreshold, cur)}
          pct={profitPct}
          tone="green"
        />
        <ProgressRow
          label="Daily Loss"
          current={fmtCash(-Math.abs(evaluation.todaysPnl), cur)}
          limit={fmtCash(-evaluation.dailyLossThreshold, cur)}
          pct={dailyPct}
          tone={dailyPct >= 70 ? "amber" : "green"}
        />
        <ProgressRow
          label="Total Loss"
          current={fmtCash(-evaluation.totalDrawdown, cur)}
          limit={fmtCash(-evaluation.totalLossThreshold, cur)}
          pct={totalPct}
          tone={totalPct >= 70 ? "amber" : "green"}
        />
      </div>

      <div className="mt-4 flex gap-6 text-[11px] text-muted-foreground">
        <span>Trading Days: {evaluation.tradingDaysCount} / {rule.min_trading_days} min</span>
        {daysRemaining !== null && <span>Days Left: {daysRemaining}</span>}
      </div>
    </div>
  );
}

function ProgressRow({ label, current, limit, pct, tone }: {
  label: string; current: string; limit: string; pct: number;
  tone: "green" | "amber";
}) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-[11px]">
        <span className="text-muted-foreground">{label}</span>
        <span className={tone === "amber" ? "text-amber-500" : "text-emerald-500"}>
          {current} / {limit}
        </span>
      </div>
      <div className="h-[6px] overflow-hidden rounded-full bg-muted">
        <div
          className={cn("h-full rounded-full transition-all", tone === "amber" ? "bg-amber-500" : "bg-emerald-500")}
          style={{ width: `${Math.max(0, Math.min(100, pct))}%` }}
        />
      </div>
    </div>
  );
}
