"use client";

import { Sparkline } from "./sparkline";
import { fmtCash, fmtPct, fmtPctOrCash } from "@/lib/journal/format-pnl";
import { usePnlDisplay } from "./preferences/journal-chrome-context";
import { cn } from "@/lib/utils";

export function OverviewHero({
  cumulativePct, cumulativeCash, currency, baseline, series, winRatePct, bestDay, worstDay,
}: {
  cumulativePct: number; cumulativeCash: number; currency: string; baseline: number;
  series: number[]; winRatePct: number; bestDay: number; worstDay: number;
}) {
  const { mode } = usePnlDisplay();
  const tone = cumulativePct > 0 ? "pos" : cumulativePct < 0 ? "neg" : "neutral";
  return (
    <div className="rounded-xl border bg-gradient-to-br from-muted/40 to-card p-5">
      <div className="flex items-start justify-between gap-5">
        <div>
          <div className="text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">Net Return · since start</div>
          <div className={cn("mt-1 text-4xl font-extrabold tracking-tight tabular-nums",
            tone === "pos" && "text-emerald-600 dark:text-emerald-400",
            tone === "neg" && "text-red-600 dark:text-red-400")}>
            {mode === "percent" && baseline > 0 ? fmtPct(cumulativePct) : fmtCash(cumulativeCash, currency)}
          </div>
          <div className="mt-1 text-xs text-muted-foreground">
            {mode === "percent" ? fmtCash(cumulativeCash, currency) : fmtPct(cumulativePct)}
          </div>
        </div>
        <div className="w-36 shrink-0">
          <Sparkline values={series} tone={tone === "pos" ? "positive" : tone === "neg" ? "negative" : "neutral"} height={40} />
        </div>
      </div>
      <div className="mt-4 grid grid-cols-3 gap-3 border-t pt-3">
        <Mini label="Win Rate" value={`${winRatePct.toFixed(1)}%`} />
        <Mini label="Best Day"  value={fmtPctOrCash(bestDay, mode, baseline, currency)} tone="pos" />
        <Mini label="Worst Day" value={fmtPctOrCash(worstDay, mode, baseline, currency)} tone="neg" />
      </div>
    </div>
  );
}

function Mini({ label, value, tone }: { label: string; value: React.ReactNode; tone?: "pos" | "neg" }) {
  return (
    <div>
      <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={cn("text-base font-bold tabular-nums",
        tone === "pos" && "text-emerald-600 dark:text-emerald-400",
        tone === "neg" && "text-red-600 dark:text-red-400")}>{value}</div>
    </div>
  );
}
