"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useAccountContext } from "@/lib/hooks/use-account-context";
import { usePnlDisplay } from "@/components/journal/preferences/journal-chrome-context";
import { fmtPctOrCash } from "@/lib/journal/format-pnl";
import { cn } from "@/lib/utils";

export function RecentTradesList() {
  const { deals, currency, baseline, license } = useAccountContext();
  const { mode } = usePnlDisplay();

  const last5 = useMemo(() =>
    [...deals].sort((a, b) => (a.close_time < b.close_time ? 1 : -1)).slice(0, 5),
    [deals],
  );

  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="mb-2 flex items-center justify-between">
        <h4 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Recent Trades
        </h4>
        <Link
          href={`/dashboard/${license.id}/journal`}
          className="text-[11px] text-muted-foreground hover:text-foreground"
        >
          View all ({deals.length}) →
        </Link>
      </div>
      {last5.length === 0 ? (
        <div className="rounded-md border border-dashed py-6 text-center text-xs text-muted-foreground">
          No trades yet.
        </div>
      ) : (
        <div className="divide-y">
          {last5.map((d) => (
            <div key={d.ticket} className="flex items-center justify-between py-2">
              <div className="flex items-center gap-2">
                <span className={cn("h-5 w-[3px] rounded-sm", d.side === "buy" ? "bg-emerald-500" : "bg-red-500")} />
                <div>
                  <span className="text-xs font-semibold">{d.symbol}</span>
                  <span className={cn("ml-1.5 text-[10px] uppercase", d.side === "buy" ? "text-emerald-500" : "text-red-500")}>
                    {d.side}
                  </span>
                </div>
              </div>
              <span className={cn("text-xs font-bold tabular-nums",
                d.profit > 0 && "text-emerald-600 dark:text-emerald-400",
                d.profit < 0 && "text-red-600 dark:text-red-400",
              )}>
                {fmtPctOrCash(d.profit, mode, baseline.baseline, currency)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
