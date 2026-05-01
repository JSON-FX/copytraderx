import { deriveLiveness, ONLINE_WINDOW_MS, STALE_WINDOW_MS } from "./liveness";
import type { License } from "./types";

function makeLicense(overrides: Partial<License>): License {
  return {
    id: 1,
    license_key: "IMPX-AAAA-BBBB-CCCC-DDDD",
    mt5_account: 12345,
    status: "active",
    tier: "monthly",
    expires_at: "2099-01-01T00:00:00Z",
    activated_at: "2026-04-25T10:00:00Z",
    customer_email: null,
    purchase_date: null,
    last_validated_at: null,
    broker_name: null,
    account_type: null,
    intended_account_type: null,
    notes: null,
    created_at: "2026-04-20T00:00:00Z",
    push_interval_seconds: 10,
    propfirm_rule_id: null,
    ...overrides,
  };
}

const NOW = new Date("2026-04-25T12:00:00Z");

describe("deriveLiveness", () => {
  it("revoked beats every other state", () => {
    const l = makeLicense({
      status: "revoked",
      last_validated_at: NOW.toISOString(),
    });
    expect(deriveLiveness(l, NOW)).toBe("revoked");
  });

  it("expired (status=expired) → expired", () => {
    const l = makeLicense({ status: "expired" });
    expect(deriveLiveness(l, NOW)).toBe("expired");
  });

  it("expires_at in the past → expired", () => {
    const l = makeLicense({ expires_at: "2020-01-01T00:00:00Z" });
    expect(deriveLiveness(l, NOW)).toBe("expired");
  });

  it("activated_at null + status=active → not_activated", () => {
    const l = makeLicense({ activated_at: null, expires_at: null });
    expect(deriveLiveness(l, NOW)).toBe("not_activated");
  });

  it("last_validated_at within ONLINE window → online", () => {
    const ms = NOW.getTime() - (ONLINE_WINDOW_MS - 60_000); // 1 min inside
    const l = makeLicense({ last_validated_at: new Date(ms).toISOString() });
    expect(deriveLiveness(l, NOW)).toBe("online");
  });

  it("last_validated_at exactly at ONLINE boundary → stale", () => {
    const ms = NOW.getTime() - ONLINE_WINDOW_MS;
    const l = makeLicense({ last_validated_at: new Date(ms).toISOString() });
    expect(deriveLiveness(l, NOW)).toBe("stale");
  });

  it("last_validated_at within STALE window → stale", () => {
    const ms = NOW.getTime() - (STALE_WINDOW_MS - 60_000);
    const l = makeLicense({ last_validated_at: new Date(ms).toISOString() });
    expect(deriveLiveness(l, NOW)).toBe("stale");
  });

  it("last_validated_at past STALE window → offline", () => {
    const ms = NOW.getTime() - (STALE_WINDOW_MS + 60_000);
    const l = makeLicense({ last_validated_at: new Date(ms).toISOString() });
    expect(deriveLiveness(l, NOW)).toBe("offline");
  });

  it("activated but never validated → offline", () => {
    const l = makeLicense({ last_validated_at: null });
    expect(deriveLiveness(l, NOW)).toBe("offline");
  });

  it("revoked beats not_activated", () => {
    const l = makeLicense({ status: "revoked", activated_at: null });
    expect(deriveLiveness(l, NOW)).toBe("revoked");
  });

  it("expired beats not_activated", () => {
    const l = makeLicense({
      activated_at: null,
      expires_at: "2020-01-01T00:00:00Z",
    });
    expect(deriveLiveness(l, NOW)).toBe("expired");
  });
});
