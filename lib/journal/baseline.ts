import type { AccountSnapshotCurrent, AccountSnapshotDaily, PropfirmRule } from "@/lib/types";

export type BaselineSource = "rule" | "first_daily" | "current" | null;

export interface BaselineResult {
  baseline: number;
  source: BaselineSource;
}

export function resolveBaseline(
  rule: PropfirmRule | null,
  daily: AccountSnapshotDaily[],
  snapshot: AccountSnapshotCurrent | null,
): BaselineResult {
  if (rule && rule.account_size > 0) {
    return { baseline: rule.account_size, source: "rule" };
  }
  if (daily.length > 0) {
    const earliest = [...daily].sort((a, b) =>
      a.trade_date < b.trade_date ? -1 : a.trade_date > b.trade_date ? 1 : 0
    )[0];
    return { baseline: earliest.balance_close, source: "first_daily" };
  }
  if (snapshot && snapshot.balance > 0) {
    return { baseline: snapshot.balance, source: "current" };
  }
  return { baseline: 0, source: null };
}
