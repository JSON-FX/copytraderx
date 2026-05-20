import { decideListTarget } from "./propfirm-rules-auth";

const CALLER = "aaaaaaaa-0000-0000-0000-000000000001";
const OTHER  = "bbbbbbbb-0000-0000-0000-000000000002";

describe("decideListTarget", () => {
  describe("unauthenticated (callerId = null)", () => {
    it("returns 401 unauthenticated regardless of queryUserId", () => {
      expect(decideListTarget(null, null, null)).toEqual({
        kind: "error", status: 401, code: "unauthenticated",
      });
      expect(decideListTarget(null, null, OTHER)).toEqual({
        kind: "error", status: 401, code: "unauthenticated",
      });
      expect(decideListTarget(null, "admin", OTHER)).toEqual({
        kind: "error", status: 401, code: "unauthenticated",
      });
    });
  });

  describe("no ?user_id (queryUserId = null)", () => {
    it("returns caller's own id for a regular user", () => {
      expect(decideListTarget(CALLER, "user", null)).toEqual({
        kind: "ok", targetUserId: CALLER,
      });
    });

    it("returns caller's own id for an admin", () => {
      expect(decideListTarget(CALLER, "admin", null)).toEqual({
        kind: "ok", targetUserId: CALLER,
      });
    });
  });

  describe("?user_id matches caller", () => {
    it("returns caller's own id (no cross-user check needed)", () => {
      expect(decideListTarget(CALLER, "user", CALLER)).toEqual({
        kind: "ok", targetUserId: CALLER,
      });
    });
  });

  describe("?user_id is a different user", () => {
    it("returns 403 forbidden for a regular user", () => {
      expect(decideListTarget(CALLER, "user", OTHER)).toEqual({
        kind: "error", status: 403, code: "forbidden",
      });
    });

    it("returns 403 forbidden when callerRole is null", () => {
      expect(decideListTarget(CALLER, null, OTHER)).toEqual({
        kind: "error", status: 403, code: "forbidden",
      });
    });

    it("returns other user's id for an admin", () => {
      expect(decideListTarget(CALLER, "admin", OTHER)).toEqual({
        kind: "ok", targetUserId: OTHER,
      });
    });
  });
});
