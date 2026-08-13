import { act, render, screen } from "@testing-library/react";
import { AccountProvider, useAccountContext } from "./use-account-context";
import { DateRangeSelector } from "@/components/dashboard/date-range-selector";
import type { AccountSnapshotCurrent, Deal, License } from "@/lib/types";

jest.mock("@/app/dashboard/settings/actions", () => ({
  updatePnlDisplay: jest.fn().mockResolvedValue({ ok: true }),
}));

const ACCT = 16005689;
const DAY_MS = 24 * 60 * 60 * 1000;

function deal(ticket: number, daysAgo: number): Deal {
  const iso = new Date(Date.now() - daysAgo * DAY_MS).toISOString();
  return {
    mt5_account: ACCT,
    ticket,
    ea_source: "ctx-prop-passer",
    symbol: "GBPUSD",
    side: "buy",
    volume: 0.1,
    open_price: 1.337,
    close_price: 1.352,
    sl: null,
    tp: null,
    open_time: iso,
    close_time: iso,
    profit: 100,
    commission: 0,
    swap: 0,
    comment: null,
    magic: null,
  };
}

// Two trades inside the 30-day window, two outside it — the shape that made
// history vanish on the live dashboard.
const ALL_DEALS = [deal(1, 3), deal(2, 20), deal(3, 45), deal(4, 120)];

const LICENSE = {
  id: 15, mt5_account: ACCT, product: "ctx-prop-passer", subscription_id: 7,
  user_id: "u1", status: "active", tier: null, expires_at: null, activated_at: null,
  purchase_date: null, last_validated_at: null, broker_name: null, account_type: "live",
  intended_account_type: null, notes: null, created_at: new Date().toISOString(),
  license_key: "K",
} as unknown as License;

const SNAPSHOT = { mt5_account: ACCT, balance: 10_000, equity: 10_000, currency: "USD" } as unknown as AccountSnapshotCurrent;

/**
 * Stands in for the real route handlers: `/deals` and `/orders` honour the
 * `days` query param, everything else ignores it. This is what turns a
 * client-side range default into rows the server never sends back.
 */
function mockApi() {
  return jest.fn(async (url: string) => {
    const u = new URL(url, "http://test.local");
    const days = Number(u.searchParams.get("days") ?? "0");
    let body: unknown = [];
    if (u.pathname.endsWith("/deals")) {
      const cutoff = days > 0 ? Date.now() - days * DAY_MS : -Infinity;
      body = ALL_DEALS.filter((d) => new Date(d.close_time).getTime() >= cutoff);
    } else if (u.pathname.endsWith("/snapshot")) {
      body = SNAPSHOT;
    }
    return { ok: true, status: 200, statusText: "OK", json: async () => body };
  });
}

function Probe() {
  const { deals, dealsInRange } = useAccountContext();
  return (
    <>
      <div data-testid="tickets">{deals.map((d) => d.ticket).join(",")}</div>
      <div data-testid="ranged">{dealsInRange.map((d) => d.ticket).join(",")}</div>
    </>
  );
}

function renderProvider(children: React.ReactNode) {
  return render(
    <AccountProvider
      license={LICENSE}
      initialSnapshot={SNAPSHOT}
      initialDaily={[]}
      initialPositions={[]}
      initialDeals={ALL_DEALS}
      initialOrders={[]}
      rule={null}
      pushIntervalSeconds={10}
      baseline={{ baseline: 10_000, source: "rule" }}
      initialPnlDisplay="percent"
      ownerRules={[]}
      subscriptionId={7}
      ownerUserId="u1"
    >
      {children}
    </AccountProvider>,
  );
}

/** Run every poll timer the provider schedules, then flush their promises. */
async function settlePolls() {
  await act(async () => {
    jest.advanceTimersByTime(60_000);
    await Promise.resolve();
  });
}

describe("AccountProvider", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    global.fetch = mockApi() as unknown as typeof fetch;
  });
  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it("keeps the full trade history after the first poll replaces the server data", async () => {
    renderProvider(<Probe />);
    expect(screen.getByTestId("tickets")).toHaveTextContent("1,2,3,4");

    await settlePolls();

    expect(screen.getByTestId("tickets")).toHaveTextContent("1,2,3,4");
  });

  it("does not drop journal rows when the dashboard range is narrowed", async () => {
    renderProvider(
      <>
        <DateRangeSelector />
        <Probe />
      </>,
    );

    await settlePolls();

    expect(screen.getByTestId("tickets")).toHaveTextContent("1,2,3,4");
  });

  it("still exposes a range-scoped list for the dashboard KPI cards", async () => {
    renderProvider(<Probe />);

    // Default range is 30 days: tickets 3 (45d) and 4 (120d) fall outside it.
    expect(screen.getByTestId("ranged")).toHaveTextContent("1,2");

    await settlePolls();

    expect(screen.getByTestId("ranged")).toHaveTextContent("1,2");
    expect(screen.getByTestId("tickets")).toHaveTextContent("1,2,3,4");
  });

  it("requests full history from the deals and orders endpoints", async () => {
    renderProvider(<Probe />);
    await settlePolls();

    const urls = (global.fetch as jest.Mock).mock.calls.map((c) => String(c[0]));
    expect(urls).toContain(`/api/journal/${ACCT}/deals?days=0`);
    expect(urls).toContain(`/api/journal/${ACCT}/orders?days=0`);
  });
});
