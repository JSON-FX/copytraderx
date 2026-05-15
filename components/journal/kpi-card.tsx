// components/journal/kpi-card.tsx
import { cn } from "@/lib/utils";
import { Sparkline, type SparklineTone } from "./sparkline";

interface Props {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  tone?: "positive" | "negative" | "neutral";
  series?: number[];
  seriesTone?: SparklineTone;
  className?: string;
  featured?: boolean;
}

const VALUE_TONE = {
  positive: "text-emerald-600 dark:text-emerald-400",
  negative: "text-red-600 dark:text-red-400",
  neutral:  "text-foreground",
} as const;

export function KpiCard({
  label, value, sub, tone = "neutral", series, seriesTone, className, featured,
}: Props) {
  const hasStrip = Array.isArray(series) && series.length >= 2;
  return (
    <div
      className={cn(
        "flex flex-col overflow-hidden rounded-xl border bg-card",
        featured && "bg-gradient-to-br from-muted/40 to-card",
        className,
      )}
    >
      <div className="px-4 py-3">
        <div className="text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</div>
        <div className={cn("mt-1 text-[22px] font-bold leading-tight tracking-tight tabular-nums", VALUE_TONE[tone])}>
          {value}
        </div>
        {sub != null && <div className="mt-1 text-xs text-muted-foreground">{sub}</div>}
      </div>
      {hasStrip && (
        <div className="border-t border-border/60 bg-gradient-to-b from-transparent to-muted/30">
          <Sparkline values={series} tone={seriesTone ?? tone === "neutral" ? "neutral" : seriesTone ?? tone} height={44} />
        </div>
      )}
    </div>
  );
}
