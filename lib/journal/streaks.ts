import type { Deal } from "@/lib/types";

export type StreakKind = "win" | "loss" | "none";

export interface StreakStats {
  maxWinStreak: number;
  maxLossStreak: number;
  currentStreak: number;
  currentStreakKind: StreakKind;
}

export function computeStreaks(deals: Deal[]): StreakStats {
  const filtered = deals
    .filter((d) => d.profit !== 0)
    .slice()
    .sort((a, b) => a.close_time.localeCompare(b.close_time));

  if (filtered.length === 0) {
    return { maxWinStreak: 0, maxLossStreak: 0, currentStreak: 0, currentStreakKind: "none" };
  }

  let maxWin = 0, maxLoss = 0;
  let curRun = 0;
  let curKind: StreakKind = "none";

  for (const d of filtered) {
    const kind: StreakKind = d.profit > 0 ? "win" : "loss";
    if (kind === curKind) {
      curRun++;
    } else {
      curRun = 1;
      curKind = kind;
    }
    if (kind === "win" && curRun > maxWin) maxWin = curRun;
    if (kind === "loss" && curRun > maxLoss) maxLoss = curRun;
  }

  return { maxWinStreak: maxWin, maxLossStreak: maxLoss, currentStreak: curRun, currentStreakKind: curKind };
}
