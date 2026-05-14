import { deriveTrialDisplayStatus } from "./trial-state";

const NOW = new Date("2026-05-15T12:00:00Z");

describe("deriveTrialDisplayStatus", () => {
  it("returns 'revoked' when stored status is revoked, regardless of date", () => {
    expect(
      deriveTrialDisplayStatus(
        { status: "revoked", expires_at: "2030-01-01T00:00:00Z" },
        NOW,
      ),
    ).toBe("revoked");
  });

  it("returns 'expired' when active but expires_at is in the past", () => {
    expect(
      deriveTrialDisplayStatus(
        { status: "active", expires_at: "2026-05-14T00:00:00Z" },
        NOW,
      ),
    ).toBe("expired");
  });

  it("returns 'active' when active and expires_at is in the future", () => {
    expect(
      deriveTrialDisplayStatus(
        { status: "active", expires_at: "2026-05-22T00:00:00Z" },
        NOW,
      ),
    ).toBe("active");
  });

  it("returns 'expired' at the exact expires_at boundary", () => {
    expect(
      deriveTrialDisplayStatus(
        { status: "active", expires_at: NOW.toISOString() },
        NOW,
      ),
    ).toBe("expired");
  });
});
