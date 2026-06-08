import { render, screen } from "@testing-library/react";
import { PropFirmTable } from "./prop-firm-table";
import type { PropFirmRow } from "@/lib/prop-firm-data";

function row(partial: Partial<PropFirmRow> = {}): PropFirmRow {
  return {
    licenseId: 18,
    mt5Account: 531290109,
    name: "FTMO Phase 2 - 10k",
    product: "ctx-prop-passer",
    productDisplay: "CTX Prop Passer",
    status: "on_track",
    pnl: -302.27,
    accountSize: 10_000,
    drawdownPct: 3.0,
    profitProgressPct: 0,
    tradingDays: 24,
    maxTradingDays: null,
    minTradingDays: 4,
    currency: "USD",
    ...partial,
  };
}

describe("PropFirmTable", () => {
  it("shows P&L as percent of account size in percent mode", () => {
    render(<PropFirmTable rows={[row()]} mode="percent" />);
    expect(screen.getByText("−3.02%")).toBeInTheDocument();
  });

  it("shows P&L as cash in dollar mode", () => {
    render(<PropFirmTable rows={[row()]} mode="dollar" />);
    expect(screen.getByText("-$302.27")).toBeInTheDocument();
  });

  it("falls back to cash in percent mode when the row has no account size", () => {
    render(<PropFirmTable rows={[row({ accountSize: null })]} mode="percent" />);
    expect(screen.getByText("-$302.27")).toBeInTheDocument();
  });

  it("shows positive P&L with a leading plus in percent mode", () => {
    render(<PropFirmTable rows={[row({ pnl: 302.27 })]} mode="percent" />);
    expect(screen.getByText("+3.02%")).toBeInTheDocument();
  });
});
