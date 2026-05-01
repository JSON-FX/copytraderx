"use client";

import { StatCard } from "./stat-card";
import { Progress } from "@/components/ui/progress";
import type { AccountSnapshotCurrent } from "@/lib/types";

function fmt(n: number, currency: string): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 2 }).format(n);
}

export function LiveAccountPanel({ snapshot }: { snapshot: AccountSnapshotCurrent | null }) {
  if (!snapshot) {
    return (
      <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
        Waiting for first EA push…
      </div>
    );
  }
  const tone = snapshot.floating_pnl > 0 ? "positive" : snapshot.floating_pnl < 0 ? "negative" : "default";
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Balance" value={fmt(snapshot.balance, snapshot.currency)} />
        <StatCard label="Equity" value={fmt(snapshot.equity, snapshot.currency)} />
        <StatCard label="Floating P/L" value={fmt(snapshot.floating_pnl, snapshot.currency)} tone={tone} />
        <StatCard label="Drawdown" value={`${snapshot.drawdown_pct.toFixed(2)}%`} tone={snapshot.drawdown_pct > 0 ? "negative" : "default"} />
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 text-xs text-muted-foreground tabular-nums">
        <div>Margin: <span className="text-foreground">{fmt(snapshot.margin, snapshot.currency)}</span></div>
        <div>Free: <span className="text-foreground">{fmt(snapshot.free_margin, snapshot.currency)}</span></div>
        <div>Margin Level: <span className="text-foreground">{snapshot.margin_level === null ? "—" : `${snapshot.margin_level.toFixed(0)}%`}</span></div>
        <div>Leverage: <span className="text-foreground">1:{snapshot.leverage}</span></div>
      </div>
      <Progress value={Math.min(100, snapshot.drawdown_pct)} aria-label="Drawdown" />
    </div>
  );
}
