import { render, screen, act } from "@testing-library/react";
import { JournalChromeProvider, usePnlDisplay, useRangeScope } from "./journal-chrome-context";

function Probe() {
  const { mode, setMode, source } = usePnlDisplay();
  const { range, setRange } = useRangeScope();
  return (
    <div>
      <span data-testid="mode">{mode}</span>
      <span data-testid="source">{source}</span>
      <span data-testid="range">{range}</span>
      <button onClick={() => setMode("dollar")}>D</button>
      <button onClick={() => setRange(7)}>7d</button>
    </div>
  );
}

describe("JournalChromeProvider", () => {
  beforeEach(() => window.localStorage.clear());

  it("starts in global preference, source=global", () => {
    render(<JournalChromeProvider licenseId={1} initialPnlDisplay="percent" initialRangeDays={30}><Probe /></JournalChromeProvider>);
    expect(screen.getByTestId("mode").textContent).toBe("percent");
    expect(screen.getByTestId("source").textContent).toBe("global");
    expect(screen.getByTestId("range").textContent).toBe("30");
  });

  it("setMode writes localStorage and flips source to override", () => {
    render(<JournalChromeProvider licenseId={1} initialPnlDisplay="percent" initialRangeDays={30}><Probe /></JournalChromeProvider>);
    act(() => { screen.getByText("D").click(); });
    expect(screen.getByTestId("mode").textContent).toBe("dollar");
    expect(screen.getByTestId("source").textContent).toBe("override");
    expect(window.localStorage.getItem("journal:pnl-display:1")).toBe("dollar");
  });

  it("hydrates from localStorage override on mount", () => {
    window.localStorage.setItem("journal:pnl-display:1", "dollar");
    render(<JournalChromeProvider licenseId={1} initialPnlDisplay="percent" initialRangeDays={30}><Probe /></JournalChromeProvider>);
    expect(screen.getByTestId("mode").textContent).toBe("dollar");
    expect(screen.getByTestId("source").textContent).toBe("override");
  });

  it("setRange updates the range scope", () => {
    render(<JournalChromeProvider licenseId={1} initialPnlDisplay="percent" initialRangeDays={30}><Probe /></JournalChromeProvider>);
    act(() => { screen.getByText("7d").click(); });
    expect(screen.getByTestId("range").textContent).toBe("7");
  });
});
