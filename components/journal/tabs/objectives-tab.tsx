"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { evaluateObjectives } from "@/lib/journal/objectives";
import type { AccountSnapshotCurrent, AccountSnapshotDaily, License, PropfirmRule } from "@/lib/types";
import { RuleProgress } from "../rule-progress";
import { cn } from "@/lib/utils";

interface Props {
  license: License;
  rule: PropfirmRule | null;
  snapshot: AccountSnapshotCurrent | null;
  daily: AccountSnapshotDaily[];
  currency: string;
}

export function ObjectivesTab({ license, rule, snapshot, daily, currency }: Props) {
  if (rule === null) {
    return (
      <div className="rounded border border-dashed p-6 text-center text-sm">
        <p className="text-muted-foreground">No challenge rule assigned.</p>
        <Button asChild className="mt-4" size="sm" variant="outline">
          <Link href={`/licenses/${license.id}`}>Assign rule</Link>
        </Button>
      </div>
    );
  }
  if (!snapshot) {
    return <p className="rounded border p-6 text-center text-sm text-muted-foreground">Waiting for first EA push…</p>;
  }
  const todayUtc = new Date().toISOString().slice(0, 10);
  const r = evaluateObjectives({ rule, currentSnapshot: snapshot, dailySnapshots: daily, todayUtc });

  const banner =
    r.status === "passed" ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
    : r.status === "failed" ? "border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-300"
    : "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300";

  return (
    <div className="space-y-6">
      <div className={cn("rounded border p-3 text-sm font-medium", banner)}>
        Status: <span className="uppercase">{r.status}</span>
        {r.status === "in_progress" && r.profitTargetMet && r.tradingDaysCount < rule.min_trading_days && (
          <span className="ml-2 text-xs text-muted-foreground">
            (target met; need {rule.min_trading_days - r.tradingDaysCount} more trading day(s))
          </span>
        )}
      </div>
      <div className="space-y-4">
        <RuleProgress label="Profit target" current={Math.max(0, r.netProfit)} threshold={r.profitTargetThreshold} currency={currency} />
        <RuleProgress label="Today's loss" current={r.todaysPnl < 0 ? -r.todaysPnl : 0} threshold={r.dailyLossThreshold} currency={currency} danger={r.dailyLossBreached} />
        <RuleProgress label="Total drawdown" current={r.totalDrawdown} threshold={r.totalLossThreshold} currency={currency} danger={r.totalLossBreached} />
        <div className="text-xs text-muted-foreground">
          Trading days: {r.tradingDaysCount} / min {rule.min_trading_days}{rule.max_trading_days ? ` (max ${rule.max_trading_days})` : ""}
        </div>
      </div>
    </div>
  );
}
