import { render, screen } from "@testing-library/react";
import { PasserHeadlineCards } from "./passer-headline-cards";
import { JournalChromeProvider } from "./preferences/journal-chrome-context";
import type { AccountSnapshotCurrent, AccountSnapshotDaily, PropfirmRule } from "@/lib/types";

const RULE: PropfirmRule = {
  id: 1, user_id: "00000000-0000-0000-0000-000000000001", name: "10k", account_size: 10_000,
  max_daily_loss: 5, daily_loss_type: "percent", daily_loss_calc: "balance",
  max_total_loss: 10, total_loss_type: "percent",
  profit_target: 10, target_type: "percent",
  min_trading_days: 4, max_trading_days: 30,
  created_at: "2026-04-01T00:00:00Z",
};

const SNAP = (over: Partial<AccountSnapshotCurrent> = {}): AccountSnapshotCurrent => ({
  mt5_account: 1, balance: 10_000, equity: 10_000, margin: 0, free_margin: 10_000,
  margin_level: null, floating_pnl: 0, drawdown_pct: 0, leverage: 30, currency: "USD",
  server: null, pushed_at: "2026-05-20T12:00:00Z", ...over,
});

const wrap = (ui: React.ReactNode) => (
  <JournalChromeProvider licenseId={1} initialPnlDisplay="percent" initialRangeDays={30}>
    {ui}
  </JournalChromeProvider>
);

describe("PasserHeadlineCards", () => {
  it("renders the three cards with a rule + snapshot", () => {
    const snap = SNAP({ balance: 10_307, equity: 10_307 });
    const daily: AccountSnapshotDaily[] = [
      { mt5_account: 1, trade_date: "2026-05-19", balance_close: 10_307, equity_close: 10_307, daily_pnl: 307 },
    ];
    render(wrap(
      <PasserHeadlineCards snapshot={snap} daily={daily} deals={[]} rule={RULE} baseline={10_000} ownerRules={[]} subscriptionId={1} licenseId={1} ownerUserId="user-a" />
    ));

    expect(screen.getByText(/Challenge Progress/i)).toBeInTheDocument();
    expect(screen.getByText("+30.7%")).toBeInTheDocument();
    expect(screen.getByText(/Equity/i)).toBeInTheDocument();
    expect(screen.getByText(/\$10,307\.00/)).toBeInTheDocument();
    expect(screen.getByText(/Loss Buffer · daily/i)).toBeInTheDocument();
    expect(screen.getByText("100% left")).toBeInTheDocument();
  });

  it("renders empty Progress + Buffer when rule is null", () => {
    const snap = SNAP();
    render(wrap(
      <PasserHeadlineCards snapshot={snap} daily={[]} deals={[]} rule={null} baseline={10_000} ownerRules={[]} subscriptionId={1} licenseId={1} ownerUserId="user-a" />
    ));

    expect(screen.getByRole("link", { name: /create your first rule/i })).toBeInTheDocument();
    expect(screen.getByText(/No limits configured/i)).toBeInTheDocument();
    // Equity still renders even without a rule. The AccountMetadataStrip
    // below the cards also shows $10,000.00 (free_margin), so use getAllBy.
    expect(screen.getAllByText(/\$10,000\.00/).length).toBeGreaterThan(0);
  });
});
