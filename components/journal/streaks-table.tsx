import { Card, CardContent } from "@/components/ui/card";
import type { StreakStats } from "@/lib/journal/streaks";

export function StreaksTable({ streaks }: { streaks: StreakStats }) {
  return (
    <Card>
      <CardContent className="grid grid-cols-3 gap-4 p-4 text-sm">
        <div>
          <div className="text-xs uppercase text-muted-foreground">Max Win Streak</div>
          <div className="text-xl font-semibold">{streaks.maxWinStreak}</div>
        </div>
        <div>
          <div className="text-xs uppercase text-muted-foreground">Max Loss Streak</div>
          <div className="text-xl font-semibold">{streaks.maxLossStreak}</div>
        </div>
        <div>
          <div className="text-xs uppercase text-muted-foreground">Current</div>
          <div className="text-xl font-semibold">
            {streaks.currentStreak} <span className="text-xs font-normal text-muted-foreground">{streaks.currentStreakKind}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
