"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { evaluateObjectives } from "@/lib/journal/objectives";
import type { AccountSnapshotCurrent, AccountSnapshotDaily, License, PropfirmRule } from "@/lib/types";
import { ObjectiveBanner } from "../objective-banner";
import { ObjectiveCard } from "../objective-card";
import { fmtCash, fmtPct, fmtPctOrCash } from "@/lib/journal/format-pnl";
import { usePnlDisplay } from "../preferences/journal-chrome-context";

interface Props {
  license: License;
  rule: PropfirmRule | null;
  snapshot: AccountSnapshotCurrent | null;
  daily: AccountSnapshotDaily[];
  currency: string;
  baseline: number;
}

export function ObjectivesTab({ license, rule, snapshot, daily, currency, baseline }: Props) {
  const { mode } = usePnlDisplay();

  if (rule === null) {
    return (
      <div className="rounded-lg border border-dashed p-6 text-center text-sm">
        <p className="text-muted-foreground">No challenge rule assigned.</p>
        <Button asChild size="sm" variant="outline" className="mt-4">
          <Link href={`/admin/licenses/${license.id}`}>Assign rule</Link>
        </Button>
      </div>
    );
  }
  if (!snapshot) {
    return <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">Waiting for first EA push…</p>;
  }

  const todayUtc = new Date().toISOString().slice(0, 10);
  const r = evaluateObjectives({ rule, currentSnapshot: snapshot, dailySnapshots: daily, todayUtc });
  const title = r.status === "passed" ? "Passed"
              : r.status === "failed" ? "Failed"
              : "In Progress";
  const detail = r.status === "passed"
    ? "All thresholds satisfied · congratulations."
    : r.status === "failed"
    ? r.dailyLossBreached ? "Daily loss limit breached."
    : r.totalLossBreached ? "Total drawdown limit breached."
    : "Failed."
    : `Profit target ${r.profitTargetMet ? "met" : "not yet hit"} · ${r.tradingDaysCount} / min ${rule.min_trading_days} trading days · no rule breaches`;

  const showPct = mode === "percent" && baseline > 0;

  const profitFill = r.profitTargetThreshold > 0 ? (Math.max(0, r.netProfit) / r.profitTargetThreshold) * 100 : 0;
  const dailyLossFill = r.dailyLossThreshold > 0 ? ((r.todaysPnl < 0 ? -r.todaysPnl : 0) / r.dailyLossThreshold) * 100 : 0;
  const totalLossFill = r.totalLossThreshold > 0 ? (r.totalDrawdown / r.totalLossThreshold) * 100 : 0;

  return (
    <section className="space-y-4">
      <ObjectiveBanner status={r.status} title={title} detail={detail} />

      <div className="grid gap-3 md:grid-cols-3">
        <ObjectiveCard
          name="Profit Target"
          state={r.profitTargetMet ? "ok" : "warn"}
          value={fmtPctOrCash(r.netProfit, mode, baseline, currency)}
          sub={`target ${showPct ? fmtPct((r.profitTargetThreshold / baseline) * 100) : fmtCash(r.profitTargetThreshold, currency)} · ${fmtCash(r.profitTargetThreshold, currency)} cash`}
          fillPct={profitFill}
          tickLow="0%"
          tickHigh={`${showPct ? fmtPct((r.profitTargetThreshold / baseline) * 100) : fmtCash(r.profitTargetThreshold, currency)} target`}
        />

        {rule.max_daily_loss > 0 && (
          <ObjectiveCard
            name="Today's Loss Limit"
            state={r.dailyLossBreached ? "bad" : dailyLossFill > 60 ? "warn" : "ok"}
            value={fmtPctOrCash(r.todaysPnl < 0 ? r.todaysPnl : 0, mode, baseline, currency)}
            sub={`limit ${showPct ? fmtPct(-(r.dailyLossThreshold / baseline) * 100) : fmtCash(-r.dailyLossThreshold, currency)} · resets 00:00 UTC`}
            fillPct={dailyLossFill}
            tickLow="0%"
            tickHigh={`${showPct ? fmtPct(-(r.dailyLossThreshold / baseline) * 100) : fmtCash(-r.dailyLossThreshold, currency)} breach`}
          />
        )}

        {rule.max_total_loss > 0 && (
          <ObjectiveCard
            name="Total Drawdown"
            state={r.totalLossBreached ? "bad" : totalLossFill > 60 ? "warn" : "ok"}
            value={fmtPctOrCash(-r.totalDrawdown, mode, baseline, currency)}
            sub={`limit ${showPct ? fmtPct(-(r.totalLossThreshold / baseline) * 100) : fmtCash(-r.totalLossThreshold, currency)} · ${fmtCash(r.totalLossThreshold, currency)} cash`}
            fillPct={totalLossFill}
            tickLow="0%"
            tickHigh={`${showPct ? fmtPct(-(r.totalLossThreshold / baseline) * 100) : fmtCash(-r.totalLossThreshold, currency)} breach`}
          />
        )}
      </div>

      {(rule.min_trading_days || rule.max_trading_days) && (
        <div className="rounded-lg border bg-muted/30 px-4 py-3 text-xs text-muted-foreground">
          <span className="font-semibold text-foreground">Trading days:</span>{" "}
          {r.tradingDaysCount} of min {rule.min_trading_days}
          {rule.max_trading_days ? ` (max ${rule.max_trading_days})` : ""}
          {r.tradingDaysCount < rule.min_trading_days && (
            <> — need {rule.min_trading_days - r.tradingDaysCount} more day(s) with at least one closed trade to qualify.</>
          )}
        </div>
      )}
    </section>
  );
}
