"use client";

import Link from "next/link";
import type { AccountSnapshotCurrent, AccountSnapshotDaily, PropfirmRule } from "@/lib/types";
import { evaluateObjectives } from "@/lib/journal/objectives";
import { fmtPct, fmtCash } from "@/lib/journal/format-pnl";
import { usePnlDisplay } from "./preferences/journal-chrome-context";
import { cn } from "@/lib/utils";

export function ChallengeMini({ rule, snapshot, daily, baseline, currency, licenseId }: {
  rule: PropfirmRule | null; snapshot: AccountSnapshotCurrent | null; daily: AccountSnapshotDaily[];
  baseline: number; currency: string; licenseId: number;
}) {
  const { mode } = usePnlDisplay();
  if (!rule || !snapshot) {
    return (
      <div className="rounded-xl border bg-card p-4 text-sm text-muted-foreground">
        No challenge rule assigned.{" "}
        <Link href={`/admin/licenses/${licenseId}`} className="text-foreground underline-offset-2 hover:underline">Assign one →</Link>
      </div>
    );
  }
  const todayUtc = new Date().toISOString().slice(0, 10);
  const r = evaluateObjectives({ rule, currentSnapshot: snapshot, dailySnapshots: daily, todayUtc });
  const showPct = mode === "percent" && baseline > 0;
  const fmt = (cash: number) => showPct ? fmtPct(baseline > 0 ? (cash / baseline) * 100 : 0) : fmtCash(cash, currency);

  const rows: Array<{ name: string; value: string; target: string; fill: number; tone: "ok"|"warn"|"bad"|"neutral" }> = [
    { name: "Profit target",     value: fmt(r.netProfit),        target: fmt(r.profitTargetThreshold), fill: r.profitTargetThreshold ? (Math.max(0, r.netProfit) / r.profitTargetThreshold) * 100 : 0, tone: r.profitTargetMet ? "ok" : "warn" },
    { name: "Daily loss limit",  value: fmt(r.todaysPnl < 0 ? r.todaysPnl : 0), target: fmt(-r.dailyLossThreshold), fill: r.dailyLossThreshold ? ((r.todaysPnl < 0 ? -r.todaysPnl : 0) / r.dailyLossThreshold) * 100 : 0, tone: r.dailyLossBreached ? "bad" : "warn" },
    { name: "Total drawdown",    value: fmt(-r.totalDrawdown),   target: fmt(-r.totalLossThreshold), fill: r.totalLossThreshold ? (r.totalDrawdown / r.totalLossThreshold) * 100 : 0, tone: r.totalLossBreached ? "bad" : "warn" },
    { name: "Trading days",      value: `${r.tradingDaysCount}`, target: `min ${rule.min_trading_days}`, fill: rule.min_trading_days ? Math.min(100, (r.tradingDaysCount / rule.min_trading_days) * 100) : 0, tone: "neutral" },
  ];

  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="mb-3 flex items-center justify-between">
        <h4 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Challenge Status</h4>
        <span className={cn("rounded px-2 py-0.5 text-[10px] font-bold uppercase",
          r.status === "passed" && "bg-emerald-50 text-emerald-700",
          r.status === "failed" && "bg-red-50 text-red-700",
          r.status === "in_progress" && "bg-amber-50 text-amber-700",
        )}>{r.status.replace("_", " ")}</span>
      </div>
      <div className="space-y-2.5">
        {rows.map((row) => (
          <div key={row.name}>
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">{row.name}</span>
              <span className="font-semibold tabular-nums">{row.value} / {row.target}</span>
            </div>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
              <div className={cn("h-full",
                row.tone === "ok" && "bg-emerald-500",
                row.tone === "warn" && "bg-amber-500",
                row.tone === "bad" && "bg-red-500",
                row.tone === "neutral" && "bg-foreground/40",
              )} style={{ width: `${Math.max(0, Math.min(100, row.fill))}%` }} />
            </div>
          </div>
        ))}
      </div>
      <Link href="#objectives" className="mt-3 inline-block text-xs font-medium text-foreground underline-offset-2 hover:underline">
        Go to Objectives →
      </Link>
    </div>
  );
}
