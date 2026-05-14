import { checkTrialDedupe } from "./trial-dedupe";

type FakeRow = {
  id: number;
  email: string;
  telegram_handle: string | null;
  discord_handle: string | null;
  trial_licenses: { id: number; mt5_account: number; created_at: string; status: string } | null;
  created_at: string;
  status: string;
};

/**
 * mkFakeSb builds a minimal Supabase client double.
 *
 * The implementation has two query paths:
 *   1. .from("trial_leads").select(...).or(...)           — returns the fake rows
 *   2. .from("trial_licenses").select(...).eq(...).maybeSingle() — second-lookup path
 *
 * Path 2 is only reached when no mt5_account collision was found in path 1.
 * None of the 5 tests exercise that branch, but the implementation still
 * tries to call it. We stub it to return { data: null, error: null } so the
 * helper doesn't crash on the missing chain methods.
 */
function mkFakeSb(rows: FakeRow[]) {
  return {
    from(table: string) {
      if (table === "trial_licenses") {
        // Stub for the second-lookup (MT5-only collision path).
        // Returns no match so tests that don't care about it stay clean.
        return {
          select(_: string) {
            return {
              eq(_field: string, _value: unknown) {
                return {
                  maybeSingle: jest.fn(() => Promise.resolve({ data: null, error: null })),
                };
              },
            };
          },
        };
      }

      // Default: trial_leads path
      return {
        select(_: string) {
          return {
            or: jest.fn(() => Promise.resolve({ data: rows, error: null })),
          };
        },
      };
    },
  } as unknown as Parameters<typeof checkTrialDedupe>[0];
}

const baseInput = {
  email: "lead@example.com",
  mt5_account: 12345678,
  telegram_handle: null,
  discord_handle: null,
};

describe("checkTrialDedupe", () => {
  it("returns empty matches when nothing collides", async () => {
    const sb = mkFakeSb([]);
    const result = await checkTrialDedupe(sb, baseInput);
    expect(result).toEqual({});
  });

  it("flags email collision", async () => {
    const sb = mkFakeSb([
      {
        id: 7,
        email: "lead@example.com",
        telegram_handle: null,
        discord_handle: null,
        trial_licenses: null,
        created_at: "2026-04-01T00:00:00Z",
        status: "expired",
      },
    ]);
    const result = await checkTrialDedupe(sb, baseInput);
    expect(result.email).toEqual({
      trial_id: 7,
      created_at: "2026-04-01T00:00:00Z",
      status: "expired",
    });
  });

  it("flags telegram collision (case-insensitive) when provided", async () => {
    const sb = mkFakeSb([
      {
        id: 9,
        email: "other@example.com",
        telegram_handle: "@TRADER_JOHN",
        discord_handle: null,
        trial_licenses: null,
        created_at: "2026-04-02T00:00:00Z",
        status: "active",
      },
    ]);
    const result = await checkTrialDedupe(sb, {
      ...baseInput,
      telegram_handle: "@trader_john",
    });
    expect(result.telegram).toBeDefined();
    expect(result.telegram?.trial_id).toBe(9);
  });

  it("ignores null telegram on the input", async () => {
    const sb = mkFakeSb([
      {
        id: 11,
        email: "other@example.com",
        telegram_handle: "@someone",
        discord_handle: null,
        trial_licenses: null,
        created_at: "2026-04-02T00:00:00Z",
        status: "active",
      },
    ]);
    const result = await checkTrialDedupe(sb, baseInput);
    expect(result.telegram).toBeUndefined();
  });

  it("flags mt5 collision via embedded trial_licenses row", async () => {
    const sb = mkFakeSb([
      {
        id: 13,
        email: "other@example.com",
        telegram_handle: null,
        discord_handle: null,
        trial_licenses: {
          id: 21,
          mt5_account: 12345678,
          created_at: "2026-04-03T00:00:00Z",
          status: "active",
        },
        created_at: "2026-04-03T00:00:00Z",
        status: "active",
      },
    ]);
    const result = await checkTrialDedupe(sb, baseInput);
    expect(result.mt5_account).toBeDefined();
    expect(result.mt5_account?.trial_id).toBe(13);
  });
});
