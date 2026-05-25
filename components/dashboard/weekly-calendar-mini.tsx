"use client";

import { useMemo } from "react";
import { useAccountContext } from "@/lib/hooks/use-account-context";
import { cn } from "@/lib/utils";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri"];

export function WeeklyCalendarMini() {
  const { daily } = useAccountContext();

  const weekData = useMemo(() => {
    const now = new Date();
    const dayOfWeek = now.getDay();
    const monday = new Date(now);
    monday.setDate(now.getDate() - ((dayOfWeek + 6) % 7));

    return WEEKDAYS.map((label, i) => {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      const dateStr = d.toISOString().slice(0, 10);
      const snap = daily.find((s) => s.trade_date === dateStr);
      return { label, pnl: snap?.daily_pnl ?? null };
    });
  }, [daily]);

  const maxAbs = useMemo(() => {
    let m = 0;
    for (const d of weekData) if (d.pnl !== null) m = Math.max(m, Math.abs(d.pnl));
    return m || 1;
  }, [weekData]);

  return (
    <div className="rounded-xl border bg-card p-4">
      <h4 className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        This Week
      </h4>
      <div className="grid grid-cols-5 gap-2">
        {weekData.map((d) => {
          const intensity = d.pnl !== null ? Math.min(1, Math.abs(d.pnl) / maxAbs) : 0;
          const isProfit = d.pnl !== null && d.pnl > 0;
          const isLoss = d.pnl !== null && d.pnl < 0;
          const opacity = 0.15 + intensity * 0.45;

          return (
            <div key={d.label} className="text-center">
              <div className="text-[9px] text-muted-foreground">{d.label}</div>
              <div
                className={cn(
                  "mt-1 flex aspect-square items-center justify-center rounded-md text-[10px] font-semibold",
                  d.pnl === null && "bg-muted/30 text-muted-foreground",
                  isProfit && "text-emerald-500",
                  isLoss && "text-red-500",
                )}
                style={d.pnl !== null ? {
                  backgroundColor: isProfit
                    ? `rgba(45, 170, 71, ${opacity})`
                    : `rgba(239, 68, 68, ${opacity})`,
                } : undefined}
              >
                {d.pnl === null ? "—" : isProfit ? "+" : "−"}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
