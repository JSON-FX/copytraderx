// components/journal/kpi-card.tsx
import { cn } from "@/lib/utils";
import { Sparkline, type SparklineTone } from "./sparkline";

export type CardTone = "positive" | "negative" | "neutral" | "warn";
export type SubTone = "positive" | "negative" | "neutral";

export interface KpiProgressBar {
  /** 0-100 visible fill; clamped by the component. */
  fill: number;
  tone: "ok" | "warn" | "bad" | "neutral";
}

interface Props {
  label: React.ReactNode;
  value: React.ReactNode;
  sub?: React.ReactNode;
  tone?: CardTone;
  /** Optional tone applied to the sub line only (independent of `tone`). */
  subTone?: SubTone;
  series?: number[];
  seriesTone?: SparklineTone;
  /** Inline progress bar rendered below `sub`. */
  progressBar?: KpiProgressBar;
  className?: string;
  featured?: boolean;
  /** Browser-native tooltip text shown when hovering the card. */
  tooltip?: string;
  /** Dashed border + muted treatment for empty/unconfigured cards. */
  empty?: boolean;
}

const VALUE_TONE: Record<CardTone, string> = {
  positive: "text-emerald-600 dark:text-emerald-400",
  negative: "text-red-600 dark:text-red-400",
  neutral:  "text-foreground",
  warn:     "text-amber-600 dark:text-amber-400",
};

const SUB_TONE = {
  positive: "text-emerald-600 dark:text-emerald-400",
  negative: "text-red-600 dark:text-red-400",
  neutral:  "text-muted-foreground",
} as const;

const BAR_TONE = {
  ok:      "bg-emerald-500",
  warn:    "bg-amber-500",
  bad:     "bg-red-500",
  neutral: "bg-foreground/40",
} as const;

function toSparklineTone(t: CardTone): SparklineTone {
  if (t === "warn") return "negative";
  if (t === "positive" || t === "negative") return t;
  return "neutral";
}

export function KpiCard({
  label, value, sub, tone = "neutral", subTone, series, seriesTone,
  progressBar, className, featured, tooltip, empty,
}: Props) {
  const hasStrip = Array.isArray(series) && series.length >= 2;
  const subClass = SUB_TONE[subTone ?? "neutral"];
  return (
    <div
      title={tooltip}
      data-tone={tone}
      data-empty={empty ? "true" : undefined}
      className={cn(
        "flex flex-col overflow-hidden rounded-xl border bg-card",
        featured && "bg-gradient-to-br from-muted/40 to-card",
        empty && "border-dashed bg-muted/20",
        className,
      )}
    >
      <div className="px-4 py-3">
        <div className="text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</div>
        <div className={cn("mt-1 text-[22px] font-bold leading-tight tracking-tight tabular-nums", VALUE_TONE[tone])}>
          {value}
        </div>
        {sub != null && <div className={cn("mt-1 text-xs", subClass)}>{sub}</div>}
        {progressBar && (
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
            <div
              className={cn("h-full", BAR_TONE[progressBar.tone])}
              style={{ width: `${Math.max(0, Math.min(100, progressBar.fill))}%` }}
            />
          </div>
        )}
      </div>
      {hasStrip && (
        <div className="border-t border-border/60 bg-gradient-to-b from-transparent to-muted/30">
          <Sparkline values={series} tone={seriesTone ?? toSparklineTone(tone)} height={44} />
        </div>
      )}
    </div>
  );
}
