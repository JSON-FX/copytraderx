import { computeDrawdownCard } from "./dashboard-drawdown";
import { evaluateObjectives } from "./objectives";
import type { AccountSnapshotCurrent, PropfirmRule } from "@/lib/types";

function rule(partial: Partial<PropfirmRule> = {}): PropfirmRule {
  return {
    id: 1,
    user_id: "00000000-0000-0000-0000-000000000001",
    name: "FTMO Phase 2 - 10k",
    account_size: 10_000,
    max_daily_loss: 5,
    daily_loss_type: "percent",
    daily_loss_calc: "balance",
    max_total_loss: 10,
    total_loss_type: "percent",
    profit_target: 5,
    target_type: "percent",
    min_trading_days: 4,
    max_trading_days: null,
    created_at: "2026-05-01T00:00:00Z",
    ...partial,
  };
}

function snapshot(partial: Partial<AccountSnapshotCurrent> = {}): AccountSnapshotCurrent {
  return {
    mt5_account: 531290109,
    balance: 9_697.73,
    equity: 9_697.73,
    margin: 0,
    free_margin: 9_697.73,
    margin_level: null,
    floating_pnl: 0,
    drawdown_pct: 0,
    leverage: 100,
    currency: "USD",
    server: null,
    pushed_at: "2026-06-07T00:00:00Z",
    ...partial,
  };
}

function challengeCard(r: PropfirmRule, s: AccountSnapshotCurrent) {
  const evaluation = evaluateObjectives({
    rule: r, currentSnapshot: s, dailySnapshots: [], todayUtc: "2026-06-07",
  });
  return computeDrawdownCard({ product: "ctx-prop-passer", rule: r, snapshot: s, evaluation });
}

describe("computeDrawdownCard — challenge accounts", () => {
  it("uses rule-based total drawdown against account size (matches Prop Firms page)", () => {
    const card = challengeCard(rule(), snapshot());
    expect(card.drawdownCash).toBeCloseTo(302.27, 2);
    expect(card.drawdownPct).toBeCloseTo(3.0227, 3);
    expect(card.limitCash).toBe(1_000);   // 10% of 10k
    expect(card.limitPct).toBe(10);
    expect(card.tone).toBe("neutral");
  });

  it("uses equity when it is below balance (floating loss eats the buffer)", () => {
    const card = challengeCard(rule(), snapshot({ balance: 9_700, equity: 9_500 }));
    expect(card.drawdownCash).toBeCloseTo(500, 2);
  });

  it("turns warn at >= 70% of the total-loss limit (WATCH threshold)", () => {
    const card = challengeCard(rule(), snapshot({ balance: 9_250, equity: 9_250 })); // dd 750 >= 700
    expect(card.tone).toBe("warn");
  });

  it("turns negative when the total-loss limit is breached", () => {
    const card = challengeCard(rule(), snapshot({ balance: 8_900, equity: 8_900 })); // dd 1100 >= 1000
    expect(card.tone).toBe("negative");
  });

  it("handles account_size 0 without dividing by zero", () => {
    const card = challengeCard(rule({ account_size: 0 }), snapshot({ balance: 0, equity: 0 }));
    expect(card.drawdownPct).toBe(0);
    expect(card.tone).toBe("neutral");
  });
});

describe("computeDrawdownCard — funded accounts", () => {
  function fundedCard(s: AccountSnapshotCurrent) {
    const r = rule();
    const evaluation = evaluateObjectives({
      rule: r, currentSnapshot: s, dailySnapshots: [], todayUtc: "2026-06-07",
    });
    return computeDrawdownCard({ product: "ctx-prop-funded", rule: r, snapshot: s, evaluation });
  }

  it("uses MT5-native drawdown_pct with no limits", () => {
    const card = fundedCard(snapshot({ drawdown_pct: 2.5 }));
    expect(card.drawdownPct).toBe(2.5);
    expect(card.drawdownCash).toBeCloseTo(250, 2); // 2.5% of 10k
    expect(card.limitCash).toBeNull();
    expect(card.limitPct).toBeNull();
    expect(card.tone).toBe("negative");
  });

  it("is neutral at zero drawdown", () => {
    const card = fundedCard(snapshot({ drawdown_pct: 0 }));
    expect(card.drawdownPct).toBe(0);
    expect(card.tone).toBe("neutral");
  });

  it("clamps negative drawdown_pct to zero", () => {
    const card = fundedCard(snapshot({ drawdown_pct: -0.5 }));
    expect(card.drawdownPct).toBe(0);
    expect(card.drawdownCash).toBe(0);
    expect(card.tone).toBe("neutral");
  });
});
