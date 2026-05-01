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

interface Props {
  deals: Deal[];
  currency: string;
}

export function TradeCalendar({ deals, currency }: Props) {
  const [cursor, setCursor] = useState<Date>(() => new Date());
  const calendar = useMemo(() => aggregateCalendar(deals), [deals]);

  const monthStart = startOfMonth(cursor);
  const monthEnd = endOfMonth(cursor);
  const days = eachDayOfInterval({ start: monthStart, end: monthEnd });
  const leadingBlanks = getDay(monthStart);

  const monthTotals = useMemo(() => {
    let net = 0; let trades = 0;
    for (const d of days) {
      const key = format(d, "yyyy-MM-dd");
      const cell = calendar.get(key);
      if (cell) { net += cell.netPnl; trades += cell.tradeCount; }
    }
    return { net, trades };
  }, [calendar, days]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setCursor((c) => subMonths(c, 1))}>‹</Button>
          <span className="text-sm font-medium">{format(cursor, "MMMM yyyy")}</span>
          <Button variant="outline" size="sm"
            onClick={() => setCursor((c) => addMonths(c, 1))}
            disabled={isSameMonth(cursor, new Date())}>›</Button>
        </div>
        <div className="text-sm text-muted-foreground">
          {monthTotals.trades} trades, net{" "}
          <span className={cn(monthTotals.net > 0 ? "text-emerald-600 dark:text-emerald-400"
                            : monthTotals.net < 0 ? "text-red-600 dark:text-red-400" : "")}>
            {new Intl.NumberFormat("en-US", { style: "currency", currency }).format(monthTotals.net)}
          </span>
        </div>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-xs text-muted-foreground">
        {["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map((d) => <div key={d}>{d}</div>)}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {Array.from({ length: leadingBlanks }).map((_, i) => <div key={`b${i}`} />)}
        {days.map((d) => {
          const key = format(d, "yyyy-MM-dd");
          const cell = calendar.get(key);
          const tone = !cell ? "bg-muted/30"
            : cell.netPnl > 0 ? "bg-emerald-500/15"
            : cell.netPnl < 0 ? "bg-red-500/15"
            : "bg-muted/30";
          return (
            <div key={key} className={cn("rounded p-1.5 text-xs", tone)}>
              <div className="text-muted-foreground">{format(d, "d")}</div>
              {cell && (
                <>
                  <div className={cn("mt-1 font-medium tabular-nums",
                    cell.netPnl > 0 ? "text-emerald-700 dark:text-emerald-300"
                    : cell.netPnl < 0 ? "text-red-700 dark:text-red-300" : "")}>
                    {new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 0 }).format(cell.netPnl)}
                  </div>
                  <div className="text-[10px] text-muted-foreground">{cell.tradeCount}t</div>
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
