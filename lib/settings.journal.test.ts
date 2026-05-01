/**
 * @jest-environment jsdom
 */
import {
  getJournalPollingInterval,
  setJournalPollingInterval,
  JOURNAL_POLLING_KEY,
  JOURNAL_POLLING_OPTIONS,
} from "./settings";

beforeEach(() => { localStorage.clear(); });

describe("getJournalPollingInterval", () => {
  it("returns the default 10000 when nothing is stored", () => {
    expect(getJournalPollingInterval()).toBe(10000);
  });

  it("returns the stored value when valid", () => {
    localStorage.setItem(JOURNAL_POLLING_KEY, "3000");
    expect(getJournalPollingInterval()).toBe(3000);
  });

  it("falls back to default for non-numeric values", () => {
    localStorage.setItem(JOURNAL_POLLING_KEY, "banana");
    expect(getJournalPollingInterval()).toBe(10000);
  });

  it("falls back to default for negative values", () => {
    localStorage.setItem(JOURNAL_POLLING_KEY, "-5");
    expect(getJournalPollingInterval()).toBe(10000);
  });
});

describe("setJournalPollingInterval", () => {
  it("writes the value to localStorage", () => {
    setJournalPollingInterval(60000);
    expect(localStorage.getItem(JOURNAL_POLLING_KEY)).toBe("60000");
  });
});

describe("JOURNAL_POLLING_OPTIONS", () => {
  it("has 5 choices: 3, 5, 10, 30, 60 seconds", () => {
    expect(JOURNAL_POLLING_OPTIONS.map((o) => o.value)).toEqual([3000, 5000, 10000, 30000, 60000]);
  });
});
