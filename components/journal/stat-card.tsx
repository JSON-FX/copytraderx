import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface Props {
  label: string;
  value: string;
  sub?: string;
  tone?: "default" | "positive" | "negative";
}

export function StatCard({ label, value, sub, tone = "default" }: Props) {
  const valueClass =
    tone === "positive" ? "text-emerald-600 dark:text-emerald-400"
    : tone === "negative" ? "text-red-600 dark:text-red-400"
    : "text-foreground";
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
        <div className={cn("mt-1 text-2xl font-semibold tabular-nums", valueClass)}>{value}</div>
        {sub && <div className="mt-0.5 text-xs text-muted-foreground tabular-nums">{sub}</div>}
      </CardContent>
    </Card>
  );
}
