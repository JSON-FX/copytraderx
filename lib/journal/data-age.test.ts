import { deriveDataAge, dataAgeMs } from "./data-age";

describe("dataAgeMs", () => {
  it("returns the milliseconds between pushed_at and now", () => {
    const now = new Date("2026-05-02T12:00:10Z");
    const pushedAt = "2026-05-02T12:00:00Z";
    expect(dataAgeMs(pushedAt, now)).toBe(10_000);
  });

  it("clamps to 0 when pushed_at is in the future (clock skew)", () => {
    const now = new Date("2026-05-02T12:00:00Z");
    const pushedAt = "2026-05-02T12:00:10Z";
    expect(dataAgeMs(pushedAt, now)).toBe(0);
  });
});

describe("deriveDataAge", () => {
  const pushIntervalSec = 10;

  it("returns 'fresh' when age < 2× push interval", () => {
    const now = new Date("2026-05-02T12:00:15Z");
    const pushedAt = "2026-05-02T12:00:00Z"; // 15s old, < 20s
    expect(deriveDataAge(pushedAt, pushIntervalSec, now)).toBe("fresh");
  });

  it("returns 'stale' when age between 2× and 4× push interval", () => {
    const now = new Date("2026-05-02T12:00:30Z");
    const pushedAt = "2026-05-02T12:00:00Z"; // 30s old, between 20s and 40s
    expect(deriveDataAge(pushedAt, pushIntervalSec, now)).toBe("stale");
  });

  it("returns 'offline' when age >= 4× push interval", () => {
    const now = new Date("2026-05-02T12:01:00Z");
    const pushedAt = "2026-05-02T12:00:00Z"; // 60s old, > 40s
    expect(deriveDataAge(pushedAt, pushIntervalSec, now)).toBe("offline");
  });

  it("returns 'offline' when pushed_at is null", () => {
    const now = new Date("2026-05-02T12:00:00Z");
    expect(deriveDataAge(null, pushIntervalSec, now)).toBe("offline");
  });
});
