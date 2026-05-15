"use client";

import { useMemo, useState } from "react";
import {
  addMonths, eachDayOfInterval, endOfMonth, format, getDay, isSameMonth,
  startOfMonth, subMonths,
} from "date-fns";
import { Button } from "@/components/ui/button";
import { aggregateCalendar } from "@/lib/journal/calendar-aggregate";
import type { Deal } from "@/lib/types";
import { cn } from "@/lib/utils";
import { fmtCash, fmtPct } from "@/lib/journal/format-pnl";
import { usePnlDisplay } from "./preferences/journal-chrome-context";

interface Props {
  deals: Deal[];
  currency: string;
  baseline: number;
  onDayClick?: (yyyy_mm_dd: string) => void;
}

export function TradeCalendar({ deals, currency, baseline, onDayClick }: Props) {
  const { mode } = usePnlDisplay();
  const [cursor, setCursor] = useState<Date>(() => new Date());
  const calendar = useMemo(() => aggregateCalendar(deals), [deals]);
  const monthStart = startOfMonth(cursor);
  const monthEnd = endOfMonth(cursor);
  const days = eachDayOfInterval({ start: monthStart, end: monthEnd });
  const leadingBlanks = getDay(monthStart);

  const monthTotals = useMemo(() => {
    let net = 0, trades = 0;
    for (const d of days) {
      const cell = calendar.get(format(d, "yyyy-MM-dd"));
      if (cell) { net += cell.netPnl; trades += cell.tradeCount; }
    }
    return { net, trades };
  }, [calendar, days]);

  // Compute "strong" threshold = top-quartile |%| / |$| of the month
  const strong = useMemo(() => {
    const mags: number[] = [];
    for (const d of days) {
      const cell = calendar.get(format(d, "yyyy-MM-dd"));
      if (cell) mags.push(Math.abs(cell.netPnl));
    }
    if (mags.length === 0) return Number.POSITIVE_INFINITY;
    mags.sort((a, b) => a - b);
    return mags[Math.floor(mags.length * 0.75)] || mags[mags.length - 1];
  }, [calendar, days]);

  const showPct = mode === "percent" && baseline > 0;

  // Build week rows: 6 weeks × 7 days incl. blanks.
  const weeks: Array<Date | null>[] = [];
  let current: Array<Date | null> = Array.from({ length: leadingBlanks }, () => null);
  for (const d of days) {
    if (current.length === 7) { weeks.push(current); current = []; }
    current.push(d);
  }
  while (current.length < 7) current.push(null);
  weeks.push(current);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setCursor((c) => subMonths(c, 1))}>‹</Button>
          <span className="text-sm font-semibold min-w-[7rem] text-center">{format(cursor, "MMMM yyyy")}</span>
          <Button variant="outline" size="sm" onClick={() => setCursor((c) => addMonths(c, 1))} disabled={isSameMonth(cursor, new Date())}>›</Button>
        </div>
        <div className="text-xs text-muted-foreground tabular-nums">
          {monthTotals.trades} trades, net{" "}
          <span className={cn("font-semibold",
            monthTotals.net > 0 && "text-emerald-600 dark:text-emerald-400",
            monthTotals.net < 0 && "text-red-600 dark:text-red-400")}>
            {showPct ? fmtPct((monthTotals.net / baseline) * 100) : fmtCash(monthTotals.net, currency)}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-[repeat(7,minmax(0,1fr))_5rem] gap-1.5 text-xs">
        {["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map((d) => (
          <div key={d} className="text-center text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70 py-1">{d}</div>
        ))}
        <div className="text-center text-[10px] font-semibold uppercase tracking-wider text-foreground py-1">Wk</div>

        {weeks.map((week, wi) => {
          let weekNet = 0;
          const cells = week.map((d, di) => {
            if (!d) return <div key={`b${wi}-${di}`} />;
            const isWeekend = di === 0 || di === 6;
            const key = format(d, "yyyy-MM-dd");
            const cell = calendar.get(key);
            if (cell) weekNet += cell.netPnl;
            const tier = !cell ? "none"
              : cell.netPnl > 0 ? (cell.netPnl >= strong ? "strong-win" : "win")
              : cell.netPnl < 0 ? (Math.abs(cell.netPnl) >= strong ? "strong-loss" : "loss")
              : "none";
            const toneClass =
              tier === "strong-win"  ? "bg-emerald-200 border-emerald-400 dark:bg-emerald-900/60 dark:border-emerald-700"
            : tier === "win"         ? "bg-emerald-50 border-emerald-200 dark:bg-emerald-950/40 dark:border-emerald-900/40"
            : tier === "strong-loss" ? "bg-red-200 border-red-400 dark:bg-red-900/60 dark:border-red-700"
            : tier === "loss"        ? "bg-red-50 border-red-200 dark:bg-red-950/40 dark:border-red-900/40"
            : "bg-muted/30 border-border/50";
            return (
              <button
                key={key}
                type="button"
                disabled={!cell || !onDayClick}
                onClick={() => cell && onDayClick?.(key)}
                className={cn(
                  "min-h-[60px] rounded-md border p-1.5 text-left transition-colors",
                  toneClass,
                  isWeekend && "opacity-50",
                  cell && onDayClick && "cursor-pointer hover:-translate-y-0.5",
                )}
              >
                <div className="text-[10px] font-semibold text-muted-foreground">{format(d, "d")}</div>
                {cell && (
                  <>
                    <div className={cn("mt-0.5 text-[12px] font-bold leading-tight tabular-nums",
                      cell.netPnl > 0 ? "text-emerald-700 dark:text-emerald-300"
                      : cell.netPnl < 0 ? "text-red-700 dark:text-red-300" : "")}>
                      {showPct ? fmtPct((cell.netPnl / baseline) * 100) : fmtCash(cell.netPnl, currency)}
                    </div>
                    <div className="text-[10px] text-muted-foreground">{cell.tradeCount}t</div>
                  </>
                )}
              </button>
            );
          });
          const weekTotalCls = weekNet > 0 ? "text-emerald-600 dark:text-emerald-400"
                              : weekNet < 0 ? "text-red-600 dark:text-red-400"
                              : "text-muted-foreground";
          return (
            <div key={`w${wi}`} className="contents">
              {cells}
              <div className="flex flex-col items-center justify-center rounded-md border bg-muted/40 px-1 py-1 text-[11px]">
                <div className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground/70">Net</div>
                <div className={cn("font-bold tabular-nums text-[12px]", weekTotalCls)}>
                  {weekNet === 0 ? "—" : showPct ? fmtPct((weekNet / baseline) * 100) : fmtCash(weekNet, currency)}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
        <Legend className="bg-red-200 dark:bg-red-900/60" label="Strong loss" />
        <Legend className="bg-red-50 dark:bg-red-950/40" label="Loss" />
        <Legend className="bg-muted/30" label="No trades" />
        <Legend className="bg-emerald-50 dark:bg-emerald-950/40" label="Win" />
        <Legend className="bg-emerald-200 dark:bg-emerald-900/60" label="Strong win" />
        {onDayClick && <span className="ml-auto">Click a day to filter Trades →</span>}
      </div>
    </div>
  );
}

function Legend({ className, label }: { className: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span className={cn("inline-block size-3 rounded-sm border", className)} />
      {label}
    </span>
  );
}
