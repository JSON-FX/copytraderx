import type { AccountSnapshotCurrent, AccountSnapshotDaily, PropfirmRule } from "@/lib/types";

export type ObjectiveStatus = "in_progress" | "passed" | "failed";

export interface ObjectivesResult {
  status: ObjectiveStatus;
  profitTargetMet: boolean;
  dailyLossBreached: boolean;
  totalLossBreached: boolean;
  tradingDaysCount: number;
  // Raw numbers for the progress bars:
  netProfit: number;             // balance - account_size
  todaysPnl: number;
  totalDrawdown: number;         // account_size - balance, clamped 0
  profitTargetThreshold: number;
  dailyLossThreshold: number;
  totalLossThreshold: number;
}

interface Inputs {
  rule: PropfirmRule;
  currentSnapshot: AccountSnapshotCurrent;
  dailySnapshots: AccountSnapshotDaily[];
  todayUtc: string;              // YYYY-MM-DD
}

function resolveThreshold(value: number, type: "money" | "percent", base: number): number {
  return type === "money" ? value : (value / 100) * base;
}

export function evaluateObjectives({
  rule, currentSnapshot, dailySnapshots, todayUtc,
}: Inputs): ObjectivesResult {
  const accountSize = rule.account_size;
  const balance = currentSnapshot.balance;
  const equity = currentSnapshot.equity;

  const profitTargetThreshold = resolveThreshold(rule.profit_target, rule.target_type, accountSize);
  const totalLossThreshold = resolveThreshold(rule.max_total_loss, rule.total_loss_type, accountSize);

  // Daily loss base depends on rule.daily_loss_calc.
  // We use yesterday's close as the day-start reference. If no prior day exists,
  // fall back to account_size — the EA backfills 90d on first run, so this is rare.
  const sorted = dailySnapshots.slice().sort((a, b) => a.trade_date.localeCompare(b.trade_date));
  const today = sorted.find((d) => d.trade_date === todayUtc);
  const yesterday = sorted.filter((d) => d.trade_date < todayUtc).pop();
  const dailyBase = yesterday
    ? (rule.daily_loss_calc === "balance" ? yesterday.balance_close : yesterday.equity_close)
    : accountSize;
  const dailyLossThreshold = resolveThreshold(rule.max_daily_loss, rule.daily_loss_type, dailyBase);

  const todaysPnl = today?.daily_pnl ?? 0;
  const todaysLossAbs = todaysPnl < 0 ? -todaysPnl : 0;

  const netProfit = balance - accountSize;
  const totalDrawdown = Math.max(0, accountSize - Math.min(balance, equity));

  const profitTargetMet = netProfit >= profitTargetThreshold;
  const dailyLossBreached = todaysLossAbs >= dailyLossThreshold;
  const totalLossBreached = totalDrawdown >= totalLossThreshold;
  const tradingDaysCount = sorted.length;

  let status: ObjectiveStatus = "in_progress";
  if (dailyLossBreached || totalLossBreached) status = "failed";
  else if (profitTargetMet && tradingDaysCount >= rule.min_trading_days) status = "passed";

  return {
    status, profitTargetMet, dailyLossBreached, totalLossBreached,
    tradingDaysCount, netProfit, todaysPnl, totalDrawdown,
    profitTargetThreshold, dailyLossThreshold, totalLossThreshold,
  };
}
