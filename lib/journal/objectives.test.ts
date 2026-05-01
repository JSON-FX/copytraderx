import { evaluateObjectives } from "./objectives";
import type { AccountSnapshotCurrent, AccountSnapshotDaily, PropfirmRule } from "@/lib/types";

const RULE: PropfirmRule = {
  id: 1, name: "100k Phase 1",
  account_size: 100_000,
  max_daily_loss: 5,           // 5% of balance/equity
  daily_loss_type: "percent",
  daily_loss_calc: "balance",
  max_total_loss: 10,          // 10% of account_size
  total_loss_type: "percent",
  profit_target: 8,            // 8% of account_size
  target_type: "percent",
  min_trading_days: 4,
  max_trading_days: 30,
  created_at: "2026-04-01T00:00:00Z",
};

const SNAP = (over: Partial<AccountSnapshotCurrent> = {}): AccountSnapshotCurrent => ({
  mt5_account: 1, balance: 100_000, equity: 100_000, margin: 0, free_margin: 100_000,
  margin_level: null, floating_pnl: 0, drawdown_pct: 0, leverage: 500, currency: "USD",
  server: null, pushed_at: "2026-05-02T12:00:00Z", ...over,
});

const DAILY = (date: string, balance_close: number, daily_pnl = 0): AccountSnapshotDaily => ({
  mt5_account: 1, trade_date: date, balance_close,
  equity_close: balance_close, daily_pnl,
});

describe("evaluateObjectives", () => {
  it("reports in_progress when no rules tripped and target not yet hit", () => {
    const r = evaluateObjectives({
      rule: RULE,
      currentSnapshot: SNAP({ balance: 103_000 }),
      dailySnapshots: [DAILY("2026-05-01", 102_000, 1000), DAILY("2026-05-02", 103_000, 1000)],
      todayUtc: "2026-05-02",
    });
    expect(r.status).toBe("in_progress");
    expect(r.profitTargetMet).toBe(false);
    expect(r.dailyLossBreached).toBe(false);
    expect(r.totalLossBreached).toBe(false);
    expect(r.tradingDaysCount).toBe(2);
  });

  it("flips to passed when profit target met AND min trading days satisfied", () => {
    const r = evaluateObjectives({
      rule: RULE,
      currentSnapshot: SNAP({ balance: 109_000 }),
      dailySnapshots: [
        DAILY("2026-04-29", 102_000, 2000),
        DAILY("2026-04-30", 104_000, 2000),
        DAILY("2026-05-01", 107_000, 3000),
        DAILY("2026-05-02", 109_000, 2000),
      ],
      todayUtc: "2026-05-02",
    });
    expect(r.status).toBe("passed");
    expect(r.profitTargetMet).toBe(true);
    expect(r.tradingDaysCount).toBe(4);
  });

  it("stays in_progress if target met but min trading days not yet satisfied", () => {
    const r = evaluateObjectives({
      rule: RULE,
      currentSnapshot: SNAP({ balance: 109_000 }),
      dailySnapshots: [DAILY("2026-05-02", 109_000, 9000)],
      todayUtc: "2026-05-02",
    });
    expect(r.status).toBe("in_progress");
    expect(r.profitTargetMet).toBe(true);
    expect(r.tradingDaysCount).toBe(1);
  });

  it("fails when daily loss exceeds 5% of balance (percent + balance calc)", () => {
    const r = evaluateObjectives({
      rule: RULE,
      currentSnapshot: SNAP({ balance: 95_000 }),
      dailySnapshots: [
        DAILY("2026-05-01", 100_000, 0),
        DAILY("2026-05-02", 95_000, -5_000),  // exactly 5% on 100k start = at limit
      ],
      todayUtc: "2026-05-02",
    });
    // 5000 / 100000 = 5% — triggers (>= threshold).
    expect(r.dailyLossBreached).toBe(true);
    expect(r.status).toBe("failed");
  });

  it("fails when total drawdown from account_size exceeds max_total_loss", () => {
    const r = evaluateObjectives({
      rule: RULE,
      currentSnapshot: SNAP({ balance: 89_000 }),    // 11% drawdown from 100k
      dailySnapshots: [DAILY("2026-05-02", 89_000, -11_000)],
      todayUtc: "2026-05-02",
    });
    expect(r.totalLossBreached).toBe(true);
    expect(r.status).toBe("failed");
  });

  it("supports money-typed thresholds", () => {
    const moneyRule: PropfirmRule = {
      ...RULE,
      max_daily_loss: 2_000, daily_loss_type: "money",
      max_total_loss: 5_000, total_loss_type: "money",
      profit_target: 8_000, target_type: "money",
    };
    const r = evaluateObjectives({
      rule: moneyRule,
      currentSnapshot: SNAP({ balance: 102_500 }),
      dailySnapshots: [
        DAILY("2026-05-01", 100_000, 0),
        DAILY("2026-05-02", 102_500, 2500),
      ],
      todayUtc: "2026-05-02",
    });
    expect(r.dailyLossBreached).toBe(false);
    expect(r.profitTargetMet).toBe(false); // 2500 < 8000
  });
});
