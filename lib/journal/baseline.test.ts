import { resolveBaseline } from "./baseline";
import type { AccountSnapshotCurrent, AccountSnapshotDaily, PropfirmRule } from "@/lib/types";

const RULE: PropfirmRule = {
  id: 1, name: "10k", account_size: 10_000,
  max_daily_loss: 5, daily_loss_type: "percent", daily_loss_calc: "balance",
  max_total_loss: 10, total_loss_type: "percent",
  profit_target: 8, target_type: "percent",
  min_trading_days: 5, max_trading_days: null,
  created_at: "2026-05-01T00:00:00Z",
};
const SNAP: AccountSnapshotCurrent = {
  mt5_account: 1, balance: 9_651, equity: 9_651, margin: 0, free_margin: 9_651,
  margin_level: null, floating_pnl: 0, drawdown_pct: 0, leverage: 500,
  currency: "USD", server: null, pushed_at: "2026-05-15T00:00:00Z",
};
const DAILY = (date: string, balance_close: number): AccountSnapshotDaily =>
  ({ mt5_account: 1, trade_date: date, balance_close, equity_close: balance_close, daily_pnl: 0 });

describe("resolveBaseline", () => {
  it("uses rule.account_size when rule is present", () => {
    expect(resolveBaseline(RULE, [DAILY("2026-05-02", 9_900)], SNAP))
      .toEqual({ baseline: 10_000, source: "rule" });
  });
  it("falls back to earliest daily balance when no rule", () => {
    expect(resolveBaseline(null, [DAILY("2026-05-02", 9_900), DAILY("2026-05-03", 9_800)], SNAP))
      .toEqual({ baseline: 9_900, source: "first_daily" });
  });
  it("re-sorts daily ascending before picking first", () => {
    expect(resolveBaseline(null, [DAILY("2026-05-05", 9_500), DAILY("2026-05-02", 9_900)], SNAP))
      .toEqual({ baseline: 9_900, source: "first_daily" });
  });
  it("falls back to current snapshot balance when no rule and no daily", () => {
    expect(resolveBaseline(null, [], SNAP))
      .toEqual({ baseline: 9_651, source: "current" });
  });
  it("returns null source when nothing is available", () => {
    expect(resolveBaseline(null, [], null))
      .toEqual({ baseline: 0, source: null });
  });
  it("treats rule with zero account_size as no rule for baseline purposes", () => {
    expect(resolveBaseline({ ...RULE, account_size: 0 }, [DAILY("2026-05-02", 9_900)], SNAP))
      .toEqual({ baseline: 9_900, source: "first_daily" });
  });
});
