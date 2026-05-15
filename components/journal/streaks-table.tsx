import { cn } from "@/lib/utils";
import type { StreakStats } from "@/lib/journal/streaks";

export function StreaksTable({ streaks }: { streaks: StreakStats }) {
  const items: Array<[string, number, "pos" | "neg" | "neutral"]> = [
    ["Max Wins",   streaks.maxWinStreak,  "pos"],
    ["Max Losses", streaks.maxLossStreak, "neg"],
    [streaks.currentStreakKind === "win" ? "Current (win)" : streaks.currentStreakKind === "loss" ? "Current (loss)" : "Current",
     streaks.currentStreak, "neutral"],
  ];
  return (
    <div className="rounded-lg border bg-card p-4">
      <h4 className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Streaks</h4>
      <div className="grid grid-cols-3 gap-3">
        {items.map(([label, n, tone]) => (
          <div key={label} className="text-center">
            <div className={cn("text-2xl font-bold tabular-nums",
              tone === "pos" && "text-emerald-600 dark:text-emerald-400",
              tone === "neg" && "text-red-600 dark:text-red-400")}>{n}</div>
            <div className="mt-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
