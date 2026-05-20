import { buildPasserCards } from "./passer-progress";
import { evaluateObjectives } from "./objectives";
import type { AccountSnapshotCurrent, AccountSnapshotDaily, PropfirmRule } from "@/lib/types";

const RULE: PropfirmRule = {
  id: 1, user_id: "00000000-0000-0000-0000-000000000001", name: "10k Phase 1",
  account_size: 10_000,
  max_daily_loss: 5,
  daily_loss_type: "percent",
  daily_loss_calc: "balance",
  max_total_loss: 10,
  total_loss_type: "percent",
  profit_target: 10,
  target_type: "percent",
  min_trading_days: 4,
  max_trading_days: 30,
  created_at: "2026-04-01T00:00:00Z",
};

const SNAP = (over: Partial<AccountSnapshotCurrent> = {}): AccountSnapshotCurrent => ({
  mt5_account: 1, balance: 10_000, equity: 10_000, margin: 0, free_margin: 10_000,
  margin_level: null, floating_pnl: 0, drawdown_pct: 0, leverage: 30, currency: "USD",
  server: null, pushed_at: "2026-05-20T12:00:00Z", ...over,
});

const DAILY = (date: string, balance_close: number, daily_pnl = 0): AccountSnapshotDaily => ({
  mt5_account: 1, trade_date: date, balance_close,
  equity_close: balance_close, daily_pnl,
});

const objectives = (snap: AccountSnapshotCurrent, daily: AccountSnapshotDaily[], todayUtc = "2026-05-20") =>
  evaluateObjectives({ rule: RULE, currentSnapshot: snap, dailySnapshots: daily, todayUtc });

describe("buildPasserCards", () => {
  it("winning account: green progress, full buffer, positive equity subline", () => {
    const snap = SNAP({ balance: 10_307, equity: 10_307 });
    const daily = [DAILY("2026-05-19", 10_307, 307)];
    const o = objectives(snap, daily);

    const r = buildPasserCards(o, snap, 10_000, "USD", "percent", 10);

    expect(r.progress.value).toBe("+30.7%");
    expect(r.progress.tone).toBe("positive");
    expect(r.progress.progressBar?.fill).toBeCloseTo(30.7, 1);
    expect(r.progress.progressBar?.tone).toBe("ok");

    expect(r.equity.value).toBe("$10,307.00");
    expect(r.equity.subTone).toBe("positive");
    expect(r.equity.sub).toContain("Up");

    expect(r.buffer.value).toBe("100% left");
    expect(r.buffer.tone).toBe("positive");
    expect(r.buffer.label).toContain("daily");
  });

  it("breakeven band: |progress| <= 0.5% reads neutral", () => {
    const snap = SNAP({ balance: 10_040, equity: 10_040 });
    const daily = [DAILY("2026-05-19", 10_040, 40)];
    const o = objectives(snap, daily);

    const r = buildPasserCards(o, snap, 10_000, "USD", "percent", 10);

    expect(r.progress.value).toBe("0.4% · breakeven");
    expect(r.progress.tone).toBe("neutral");
  });

  it("negative progress: red, signed value, $-to-target uses absolute distance", () => {
    const snap = SNAP({ balance: 9_350, equity: 9_350 });
    const today = "2026-05-20";
    const daily = [
      DAILY("2026-05-19", 9_770, -230),
      DAILY(today, 9_350, -420),
    ];
    const o = objectives(snap, daily, today);

    const r = buildPasserCards(o, snap, 10_000, "USD", "percent", 10);

    expect(r.progress.value).toBe("−6.5%");
    expect(r.progress.tone).toBe("negative");
    expect(r.progress.sub).toContain("$1,650.00 to target");
  });

  it("near-breach: buffer headline reads from the tighter (daily) limit", () => {
    const snap = SNAP({ balance: 9_350, equity: 9_350 });
    const today = "2026-05-20";
    const daily = [
      DAILY("2026-05-19", 9_770, -230),
      DAILY(today, 9_350, -420),
    ];
    const o = objectives(snap, daily, today);

    const r = buildPasserCards(o, snap, 10_000, "USD", "percent", 10);

    // dailyLossThreshold = 5% of 9770 = 488.5; dailyLossAbs = 420 -> buffer ~14%
    // totalLossThreshold = 10% of 10000 = 1000; totalDrawdown = 650 -> buffer 35%
    expect(r.buffer.label).toContain("daily");
    expect(r.buffer.value).toBe("14% left");
    expect(r.buffer.tone).toBe("negative");
    expect(r.buffer.progressBar?.tone).toBe("bad");
  });

  it("buffer tone thresholds: green >= 40, amber 20-40, red < 20", () => {
    const cases = [
      { todaysLoss: 50,  expectedTone: "positive" as const, expectedFill: 90 },
      { todaysLoss: 350, expectedTone: "warn"     as const, expectedFill: 30 },
      { todaysLoss: 450, expectedTone: "negative" as const, expectedFill: 10 },
    ];
    for (const c of cases) {
      const snap = SNAP({ balance: 10_000 - c.todaysLoss, equity: 10_000 - c.todaysLoss });
      const today = "2026-05-20";
      const daily = [DAILY("2026-05-19", 10_000, 0), DAILY(today, 10_000 - c.todaysLoss, -c.todaysLoss)];
      const o = objectives(snap, daily, today);
      const r = buildPasserCards(o, snap, 10_000, "USD", "percent", 10);
      expect(r.buffer.tone).toBe(c.expectedTone);
      expect(r.buffer.progressBar?.fill).toBeCloseTo(c.expectedFill, 0);
    }
  });

  it("dollar mode flips headlines: Card 1 shows $/target, Card 3 shows $-of-$", () => {
    const snap = SNAP({ balance: 10_307, equity: 10_307 });
    const daily = [DAILY("2026-05-19", 10_307, 307)];
    const o = objectives(snap, daily);

    const r = buildPasserCards(o, snap, 10_000, "USD", "cash", 10);

    expect(r.progress.value).toBe("$307.00 / $1,000.00");
    expect(r.buffer.value).toMatch(/^\$\d/);
  });

  it("no rule + no snapshot variants render dashed-empty payloads", () => {
    const r = buildPasserCards(null, null, 10_000, "USD", "percent", 10);
    expect(r.progress.empty).toBe(true);
    expect(r.progress.value).toBe("—");
    expect(r.buffer.empty).toBe(true);
    expect(r.buffer.value).toBe("—");
    expect(r.equity.empty).toBe(false); // equity always renders if snapshot present? not here
    expect(r.equity.value).toBe("—");
  });

  it("rule with profit_target=0 renders progress as empty", () => {
    const zeroTargetRule: PropfirmRule = { ...RULE, profit_target: 0 };
    const snap = SNAP({ balance: 10_100, equity: 10_100 });
    const daily = [DAILY("2026-05-19", 10_100, 100)];
    const o = evaluateObjectives({ rule: zeroTargetRule, currentSnapshot: snap, dailySnapshots: daily, todayUtc: "2026-05-20" });

    const r = buildPasserCards(o, snap, 10_000, "USD", "percent", 0);

    expect(r.progress.empty).toBe(true);
    expect(r.progress.sub).toContain("no profit target");
  });

  it("rule with both loss limits 0 renders buffer as empty", () => {
    const noLimitsRule: PropfirmRule = { ...RULE, max_daily_loss: 0, max_total_loss: 0 };
    const snap = SNAP();
    const daily = [DAILY("2026-05-19", 10_000, 0)];
    const o = evaluateObjectives({ rule: noLimitsRule, currentSnapshot: snap, dailySnapshots: daily, todayUtc: "2026-05-20" });

    const r = buildPasserCards(o, snap, 10_000, "USD", "percent", 10);

    expect(r.buffer.empty).toBe(true);
    expect(r.buffer.sub).toContain("no loss limits");
  });
});
