import { render, screen, fireEvent } from "@testing-library/react";
import { JournalChromeProvider } from "@/components/journal/preferences/journal-chrome-context";
import { CalendarTab } from "./calendar-tab";
import type { Deal } from "@/lib/types";

jest.mock("@/app/dashboard/settings/actions", () => ({
  updatePnlDisplay: jest.fn().mockResolvedValue({ ok: true }),
}));

// Local noon today: the UTC date slice matches the locally-rendered calendar
// cell for any timezone offset < 12h, keeping the test deterministic.
const NOON_TODAY = new Date(new Date().setHours(12, 0, 0, 0)).toISOString();

function deal(partial: Partial<Deal> = {}): Deal {
  return {
    mt5_account: 531290109,
    ticket: 1001,
    ea_source: "ctx-prop-passer",
    symbol: "GBPUSD",
    side: "buy",
    volume: 0.5,
    open_price: 1.265,
    close_price: 1.267,
    sl: null,
    tp: null,
    open_time: NOON_TODAY,
    close_time: NOON_TODAY,
    profit: -148,
    commission: -2,
    swap: 0,
    comment: null,
    magic: null,
    ...partial,
  };
}

function renderTab(deals: Deal[]) {
  render(
    <JournalChromeProvider licenseId={18} initialPnlDisplay="dollar" initialRangeDays={30}>
      <CalendarTab deals={deals} currency="USD" baseline={10_000} licenseId={18} />
    </JournalChromeProvider>,
  );
}

describe("CalendarTab", () => {
  it("opens the day modal when a day with trades is clicked", () => {
    renderTab([deal()]);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    fireEvent.click(screen.getByText("1 trade"));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("GBPUSD")).toBeInTheDocument();
  });

  it("closes the modal on Escape", () => {
    renderTab([deal()]);
    fireEvent.click(screen.getByText("1 trade"));
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
