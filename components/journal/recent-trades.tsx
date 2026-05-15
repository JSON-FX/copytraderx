"use client";

import { format, parseISO } from "date-fns";
import type { Deal } from "@/lib/types";
import { SidePill } from "./tables/side-pill";
import { fmtCash, fmtPct, fmtPctOrCash } from "@/lib/journal/format-pnl";
import { usePnlDisplay } from "./preferences/journal-chrome-context";
import { cn } from "@/lib/utils";

export function RecentTrades({ deals, currency, baseline }: { deals: Deal[]; currency: string; baseline: number }) {
  const { mode } = usePnlDisplay();
  const last5 = [...deals]
    .sort((a, b) => a.close_time < b.close_time ? 1 : -1)
    .slice(0, 5);

  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="mb-2 flex items-center justify-between">
        <h4 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Recent Trades · last 5</h4>
        <a href="#trades" className="text-[11px] text-muted-foreground hover:text-foreground">View all ({deals.length}) →</a>
      </div>
      {last5.length === 0 ? (
        <div className="rounded-md border border-dashed py-6 text-center text-xs text-muted-foreground">No trades yet.</div>
      ) : (
        <div className="divide-y">
          {last5.map((d) => {
            const pnlPct = baseline > 0 ? (d.profit / baseline) * 100 : 0;
            return (
              <div key={d.ticket} className="grid grid-cols-[3px_1fr_auto] items-center gap-3 py-2.5">
                <span className={cn("h-6 w-[3px] rounded-sm", d.side === "buy" ? "bg-emerald-500" : "bg-red-500")} />
                <div>
                  <div className="text-sm font-semibold">
                    {d.symbol} <SidePill variant={d.side}>{d.side}</SidePill>
                  </div>
                  <div className="text-[11px] text-muted-foreground tabular-nums">
                    {format(parseISO(d.close_time), "MMM dd · HH:mm")} · {d.volume.toFixed(2)} lot
                  </div>
                </div>
                <div className={cn("text-sm font-bold tabular-nums",
                  d.profit > 0 && "text-emerald-600 dark:text-emerald-400",
                  d.profit < 0 && "text-red-600 dark:text-red-400")}
                  title={`${fmtCash(d.profit, currency)} cash · ${fmtPct(pnlPct)} of baseline`}>
                  {fmtPctOrCash(d.profit, mode, baseline, currency)}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
