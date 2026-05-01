import { aggregateCalendar } from "./calendar-aggregate";
import { SAMPLE_DEALS } from "./__fixtures__/sample-deals";

describe("aggregateCalendar", () => {
  it("returns empty map for no deals", () => {
    expect(aggregateCalendar([]).size).toBe(0);
  });

  it("groups deals by UTC date key (YYYY-MM-DD)", () => {
    const map = aggregateCalendar(SAMPLE_DEALS);
    expect(map.size).toBe(5); // each fixture deal closes on a different day
    expect(map.get("2026-04-01")?.tradeCount).toBe(1);
    expect(map.get("2026-04-01")?.netPnl).toBe(100);
    expect(map.get("2026-04-02")?.netPnl).toBe(-50);
  });

  it("sums pnl and counts within the same UTC day", () => {
    const map = aggregateCalendar([
      ...SAMPLE_DEALS,
      { ...SAMPLE_DEALS[0], ticket: 999, profit: 25 },
    ]);
    expect(map.get("2026-04-01")?.tradeCount).toBe(2);
    expect(map.get("2026-04-01")?.netPnl).toBe(125);
  });

  it("handles deals that close near UTC midnight by grouping under close_time's UTC date", () => {
    const map = aggregateCalendar([
      { ...SAMPLE_DEALS[0], ticket: 50, close_time: "2026-04-10T23:59:59Z", profit: 10 },
      { ...SAMPLE_DEALS[0], ticket: 51, close_time: "2026-04-11T00:00:01Z", profit: 20 },
    ]);
    expect(map.get("2026-04-10")?.netPnl).toBe(10);
    expect(map.get("2026-04-11")?.netPnl).toBe(20);
  });
});
