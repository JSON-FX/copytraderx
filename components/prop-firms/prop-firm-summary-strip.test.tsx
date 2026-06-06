import { render, screen } from "@testing-library/react";
import { PropFirmSummaryStrip } from "./prop-firm-summary-strip";
import type { PropFirmOverview } from "@/lib/prop-firm-data";

function overview(partial: Partial<PropFirmOverview> = {}): PropFirmOverview {
  return {
    rows: [],
    totalPnl: -302.27,
    totalAccountSize: 10_000,
    avgWinRate: 0,
    activeCount: 1,
    fundedCount: 0,
    ...partial,
  };
}

describe("PropFirmSummaryStrip", () => {
  it("shows Total P&L as weighted percent in percent mode", () => {
    render(<PropFirmSummaryStrip data={overview()} mode="percent" />);
    expect(screen.getByText("−3.02%")).toBeInTheDocument(); // -302.27 / 10000
  });

  it("shows Total P&L as cash in dollar mode", () => {
    render(<PropFirmSummaryStrip data={overview()} mode="dollar" />);
    expect(screen.getByText("-$302.27")).toBeInTheDocument();
  });

  it("falls back to cash in percent mode when totalAccountSize is 0", () => {
    render(<PropFirmSummaryStrip data={overview({ totalAccountSize: 0 })} mode="percent" />);
    expect(screen.getByText("-$302.27")).toBeInTheDocument();
  });
});
