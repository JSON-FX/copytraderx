/**
 * @jest-environment jsdom
 */
import {
  getPollingInterval,
  setPollingInterval,
  POLLING_KEY,
  POLLING_OPTIONS,
} from "./settings";

beforeEach(() => {
  localStorage.clear();
});

describe("getPollingInterval", () => {
  it("returns the default 3000 when nothing is stored", () => {
    expect(getPollingInterval()).toBe(3000);
  });

  it("returns the stored value when valid", () => {
    localStorage.setItem(POLLING_KEY, "5000");
    expect(getPollingInterval()).toBe(5000);
  });

  it("returns 0 when explicitly stored as 0 (Off)", () => {
    localStorage.setItem(POLLING_KEY, "0");
    expect(getPollingInterval()).toBe(0);
  });

  it("falls back to default for non-numeric values", () => {
    localStorage.setItem(POLLING_KEY, "banana");
    expect(getPollingInterval()).toBe(3000);
  });

  it("falls back to default for negative values", () => {
    localStorage.setItem(POLLING_KEY, "-100");
    expect(getPollingInterval()).toBe(3000);
  });
});

describe("setPollingInterval", () => {
  it("writes the value to localStorage under POLLING_KEY", () => {
    setPollingInterval(10000);
    expect(localStorage.getItem(POLLING_KEY)).toBe("10000");
  });
});

describe("POLLING_OPTIONS", () => {
  it("starts with the Off option", () => {
    expect(POLLING_OPTIONS[0]).toEqual({ label: "Off", value: 0 });
  });

  it("includes 3 seconds as a discoverable option", () => {
    expect(POLLING_OPTIONS.find((o) => o.value === 3000)).toBeTruthy();
  });
});
