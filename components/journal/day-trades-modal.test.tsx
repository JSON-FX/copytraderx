import { render, screen, fireEvent } from "@testing-library/react";
import { JournalChromeProvider } from "@/components/journal/preferences/journal-chrome-context";
import { DayTradesModal } from "./day-trades-modal";
import type { Deal } from "@/lib/types";

jest.mock("@/app/dashboard/settings/actions", () => ({
  updatePnlDisplay: jest.fn().mockResolvedValue({ ok: true }),
}));

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
    open_time: "2026-06-01T08:00:00Z",
    close_time: "2026-06-01T09:30:00Z",
    profit: -148,
    commission: -2,
    swap: 0,
    comment: null,
    magic: null,
    ...partial,
  };
}

function renderModal(deals: Deal[], onClose = jest.fn()) {
  render(
    <JournalChromeProvider licenseId={18} initialPnlDisplay="dollar" initialRangeDays={30}>
      <DayTradesModal
        date="2026-06-01"
        deals={deals}
        currency="USD"
        baseline={10_000}
        journalHref="/dashboard/18/journal#trades?date=2026-06-01"
        onClose={onClose}
      />
    </JournalChromeProvider>,
  );
  return onClose;
}

describe("DayTradesModal", () => {
  it("renders the day header with trade count and net P&L and W/L split", () => {
    renderModal([deal(), deal({ ticket: 1002, profit: 200 })]);
    expect(screen.getByText("Mon, Jun 1 2026")).toBeInTheDocument();
    expect(screen.getByText(/2 trades/)).toBeInTheDocument();
    expect(screen.getByText(/1W \/ 1L/)).toBeInTheDocument();
  });

  it("lists the day's trades", () => {
    renderModal([deal(), deal({ ticket: 1002, symbol: "EURUSD" })]);
    expect(screen.getByText("GBPUSD")).toBeInTheDocument();
    expect(screen.getByText("EURUSD")).toBeInTheDocument();
  });

  it("search filters rows by symbol", () => {
    renderModal([deal(), deal({ ticket: 1002, symbol: "EURUSD" })]);
    fireEvent.change(screen.getByPlaceholderText("Search ticket, symbol…"), { target: { value: "EUR" } });
    expect(screen.queryByText("GBPUSD")).not.toBeInTheDocument();
    expect(screen.getByText("EURUSD")).toBeInTheDocument();
  });

  it("shows the empty state when no trades match the search", () => {
    renderModal([deal()]);
    fireEvent.change(screen.getByPlaceholderText("Search ticket, symbol…"), { target: { value: "XAU" } });
    expect(screen.getByText("No trades match.")).toBeInTheDocument();
  });

  it("renders the Open in Journal footer link and closes on click", () => {
    const onClose = renderModal([deal()]);
    const link = screen.getByText("Open in Journal →");
    expect(link).toHaveAttribute("href", "/dashboard/18/journal#trades?date=2026-06-01");
    fireEvent.click(link);
    expect(onClose).toHaveBeenCalled();
  });
});
