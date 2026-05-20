import { decideListTarget, decideOwnerAccess, decideSubscriptionPatch } from "./propfirm-rules-auth";

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

describe("decideOwnerAccess", () => {
  describe("caller owns the rule", () => {
    it("returns ok when ruleUserId matches callerId (any role)", () => {
      expect(decideOwnerAccess(CALLER, CALLER, null)).toEqual({ kind: "ok" });
      expect(decideOwnerAccess(CALLER, CALLER, "user")).toEqual({ kind: "ok" });
      expect(decideOwnerAccess(CALLER, CALLER, "admin")).toEqual({ kind: "ok" });
    });
  });

  describe("caller does not own the rule", () => {
    it("returns not_found for a regular user accessing another user's rule", () => {
      expect(decideOwnerAccess(OTHER, CALLER, "user")).toEqual({ kind: "not_found" });
    });

    it("returns not_found when callerRole is null", () => {
      expect(decideOwnerAccess(OTHER, CALLER, null)).toEqual({ kind: "not_found" });
    });

    it("returns ok for an admin accessing another user's rule", () => {
      expect(decideOwnerAccess(OTHER, CALLER, "admin")).toEqual({ kind: "ok" });
    });
  });
});

// ---------------------------------------------------------------------------
// decideSubscriptionPatch
// ---------------------------------------------------------------------------

const OWNER = "cccccccc-0000-0000-0000-000000000003";
const ADMIN_ID = "dddddddd-0000-0000-0000-000000000004";
const STRANGER = "eeeeeeee-0000-0000-0000-000000000005";

const SUB = { user_id: OWNER };
const RULE_OWNED = { user_id: OWNER };
const RULE_FOREIGN = { user_id: STRANGER };

// helper — no rule involved
function decide(
  callerId: string | null,
  callerRole: "admin" | "user" | null,
  subscription: { user_id: string } | null,
  body: { push_interval_seconds?: number; propfirm_rule_id?: number | null } = {},
  rule: { user_id: string } | null = null,
  ruleRequired = false,
) {
  return decideSubscriptionPatch({ callerId, callerRole, subscription, body, rule, ruleRequired });
}

describe("decideSubscriptionPatch", () => {
  describe("authentication", () => {
    it("returns 401 when callerId is null", () => {
      expect(decide(null, null, SUB)).toEqual({ kind: "error", status: 401, code: "unauthenticated" });
    });
  });

  describe("subscription existence", () => {
    it("returns 404 when subscription is null", () => {
      expect(decide(OWNER, "user", null)).toEqual({ kind: "error", status: 404, code: "not_found" });
    });
  });

  describe("ownership / admin gate", () => {
    it("allows subscription owner (non-admin)", () => {
      expect(decide(OWNER, "user", SUB)).toEqual({ kind: "ok" });
    });

    it("allows admin who does not own the subscription", () => {
      expect(decide(ADMIN_ID, "admin", SUB)).toEqual({ kind: "ok" });
    });

    it("returns 403 for an authenticated stranger", () => {
      expect(decide(STRANGER, "user", SUB)).toEqual({ kind: "error", status: 403, code: "forbidden" });
    });

    it("returns 403 for a caller with null role who does not own the subscription", () => {
      expect(decide(STRANGER, null, SUB)).toEqual({ kind: "error", status: 403, code: "forbidden" });
    });
  });

  describe("push_interval_seconds — admin-only dial", () => {
    it("returns 403 when non-admin owner sets push_interval_seconds", () => {
      expect(decide(OWNER, "user", SUB, { push_interval_seconds: 5 })).toEqual({
        kind: "error", status: 403, code: "forbidden",
      });
    });

    it("allows admin to set push_interval_seconds", () => {
      expect(decide(ADMIN_ID, "admin", SUB, { push_interval_seconds: 5 })).toEqual({ kind: "ok" });
    });

    it("allows owner to omit push_interval_seconds", () => {
      expect(decide(OWNER, "user", SUB, {})).toEqual({ kind: "ok" });
    });
  });

  describe("propfirm_rule_id ownership", () => {
    it("allows null propfirm_rule_id (clearing the rule)", () => {
      // ruleRequired=false because propfirm_rule_id is null
      expect(decide(OWNER, "user", SUB, { propfirm_rule_id: null }, null, false)).toEqual({ kind: "ok" });
    });

    it("returns 400 rule_not_found when ruleRequired but rule is null", () => {
      expect(decide(OWNER, "user", SUB, { propfirm_rule_id: 99 }, null, true)).toEqual({
        kind: "error", status: 400, code: "rule_not_found",
      });
    });

    it("returns 400 rule_owner_mismatch when rule belongs to a different user", () => {
      expect(decide(OWNER, "user", SUB, { propfirm_rule_id: 7 }, RULE_FOREIGN, true)).toEqual({
        kind: "error", status: 400, code: "rule_owner_mismatch",
      });
    });

    it("allows assigning a rule that belongs to the subscription owner", () => {
      expect(decide(OWNER, "user", SUB, { propfirm_rule_id: 7 }, RULE_OWNED, true)).toEqual({ kind: "ok" });
    });

    it("allows admin to assign a rule from a different user (rule belongs to sub owner)", () => {
      expect(decide(ADMIN_ID, "admin", SUB, { propfirm_rule_id: 7 }, RULE_OWNED, true)).toEqual({ kind: "ok" });
    });

    it("returns 400 rule_owner_mismatch even for admin when rule user != subscription user", () => {
      expect(decide(ADMIN_ID, "admin", SUB, { propfirm_rule_id: 7 }, RULE_FOREIGN, true)).toEqual({
        kind: "error", status: 400, code: "rule_owner_mismatch",
      });
    });
  });
});
