import { render, screen, act, waitFor } from "@testing-library/react";
import { JournalChromeProvider, usePnlDisplay, useRangeScope } from "./journal-chrome-context";
import { updatePnlDisplay } from "@/app/dashboard/settings/actions";

jest.mock("@/app/dashboard/settings/actions", () => ({
  updatePnlDisplay: jest.fn(),
}));

const mockUpdate = updatePnlDisplay as jest.MockedFunction<typeof updatePnlDisplay>;

function Probe() {
  const { mode, setMode } = usePnlDisplay();
  const { range, setRange } = useRangeScope();
  return (
    <div>
      <span data-testid="mode">{mode}</span>
      <span data-testid="range">{range}</span>
      <button onClick={() => setMode("dollar")}>D</button>
      <button onClick={() => setMode("percent")}>P</button>
      <button onClick={() => setRange(7)}>7d</button>
    </div>
  );
}

function renderProvider() {
  return render(
    <JournalChromeProvider licenseId={1} initialPnlDisplay="percent" initialRangeDays={30}>
      <Probe />
    </JournalChromeProvider>,
  );
}

describe("JournalChromeProvider (global-only $/% mode)", () => {
  beforeEach(() => {
    window.localStorage.clear();
    mockUpdate.mockReset();
    mockUpdate.mockResolvedValue({ ok: true });
  });

  it("starts with the global preference", () => {
    renderProvider();
    expect(screen.getByTestId("mode").textContent).toBe("percent");
    expect(screen.getByTestId("range").textContent).toBe("30");
  });

  it("ignores stale per-license localStorage overrides", () => {
    window.localStorage.setItem("journal:pnl-display:1", "dollar");
    renderProvider();
    expect(screen.getByTestId("mode").textContent).toBe("percent");
  });

  it("setMode updates optimistically and persists via the server action", async () => {
    renderProvider();
    act(() => { screen.getByText("D").click(); });
    expect(screen.getByTestId("mode").textContent).toBe("dollar");
    await waitFor(() => expect(mockUpdate).toHaveBeenCalledWith("dollar"));
    expect(window.localStorage.getItem("journal:pnl-display:1")).toBeNull();
  });

  it("reverts the optimistic update when the server action fails", async () => {
    mockUpdate.mockResolvedValue({ error: "write_failed" });
    renderProvider();
    act(() => { screen.getByText("D").click(); });
    expect(screen.getByTestId("mode").textContent).toBe("dollar");
    await waitFor(() => expect(screen.getByTestId("mode").textContent).toBe("percent"));
  });

  it("a superseded toggle cannot clobber the latest state (double-toggle, both fail)", async () => {
    let resolveA!: (v: { ok: true } | { error: string }) => void;
    let resolveB!: (v: { ok: true } | { error: string }) => void;
    mockUpdate
      .mockImplementationOnce(() => new Promise((r) => { resolveA = r; }))
      .mockImplementationOnce(() => new Promise((r) => { resolveB = r; }));

    renderProvider();
    act(() => { screen.getByText("D").click(); });   // percent -> dollar (A in flight)
    act(() => { screen.getByText("P").click(); });   // dollar -> percent (B in flight)
    expect(screen.getByTestId("mode").textContent).toBe("percent");

    await act(async () => { resolveA({ error: "write_failed" }); });  // stale failure — must be ignored
    expect(screen.getByTestId("mode").textContent).toBe("percent");

    await act(async () => { resolveB({ error: "write_failed" }); });  // latest failure — revert to confirmed
    expect(screen.getByTestId("mode").textContent).toBe("percent");   // confirmed value is still "percent"
  });

  it("setRange updates the range scope", () => {
    renderProvider();
    act(() => { screen.getByText("7d").click(); });
    expect(screen.getByTestId("range").textContent).toBe("7");
  });
});
