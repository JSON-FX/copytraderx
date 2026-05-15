import { binPnlDistribution } from "@/lib/journal/histogram";
import { fmtCash, fmtPct } from "@/lib/journal/format-pnl";
import { cn } from "@/lib/utils";

interface Props {
  values: number[];           // per-trade cash P/L
  baseline: number;
  currency: string;
  showPct: boolean;
  binCount?: number;
}

export function PnlHistogram({ values, baseline, currency, showPct, binCount = 11 }: Props) {
  const { bins, min, max } = binPnlDistribution(values, binCount);
  const maxCount = Math.max(1, ...bins.map((b) => b.count));

  if (values.length === 0) {
    return (
      <div className="rounded-lg border bg-card p-4">
        <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Per-trade P/L distribution</h4>
        <div className="rounded-md border border-dashed py-6 text-center text-xs text-muted-foreground">No trades yet.</div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border bg-card p-4">
      <h4 className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Per-trade P/L distribution</h4>
      <div className="flex h-[90px] items-end gap-1 px-1">
        {bins.map((b, i) => (
          <div key={i} className={cn("flex-1 rounded-t-sm",
            b.sign === "win"  && "bg-emerald-500",
            b.sign === "loss" && "bg-red-500",
            b.sign === "zero" && "bg-border")}
            style={{ height: `${Math.max(4, (b.count / maxCount) * 100)}%` }}
            title={`${b.count} trade${b.count === 1 ? "" : "s"} from ${showPct ? fmtPct(baseline ? (b.start / baseline) * 100 : 0) : fmtCash(b.start, currency)} to ${showPct ? fmtPct(baseline ? (b.end / baseline) * 100 : 0) : fmtCash(b.end, currency)}`}
          />
        ))}
      </div>
      <div className="mt-2 flex justify-between text-[10px] text-muted-foreground tabular-nums">
        <span>{showPct ? fmtPct(baseline ? (min / baseline) * 100 : 0) : fmtCash(min, currency)}</span>
        <span>0</span>
        <span>{showPct ? fmtPct(baseline ? (max / baseline) * 100 : 0) : fmtCash(max, currency)}</span>
      </div>
    </div>
  );
}
