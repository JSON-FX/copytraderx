import { Progress } from "@/components/ui/progress";

export function RuleProgress({
  label, current, threshold, currency, danger = false,
}: { label: string; current: number; threshold: number; currency: string; danger?: boolean }) {
  const pct = threshold === 0 ? 0 : Math.min(100, Math.max(0, (current / threshold) * 100));
  return (
    <div className="space-y-1">
      <div className="flex items-baseline justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className={danger ? "text-red-600 dark:text-red-400" : ""}>
          {new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 0 }).format(current)}
          {" / "}
          {new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 0 }).format(threshold)}
        </span>
      </div>
      <Progress value={pct} aria-label={label} />
    </div>
  );
}
