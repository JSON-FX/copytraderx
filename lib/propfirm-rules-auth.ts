import type { Role } from "./role";

// ---------------------------------------------------------------------------
// decideSubscriptionPatch — pure auth/ownership decision for PATCH /api/subscriptions/[id]
// ---------------------------------------------------------------------------

export type PatchDecision =
  | { kind: "ok" }
  | { kind: "error"; status: 401 | 403 | 400 | 404; code: string };

/**
 * Decide whether a PATCH /api/subscriptions/[id] request is allowed.
 *
 * Rules:
 * - Unauthenticated → 401.
 * - Subscription not found → 404.
 * - Caller is neither admin nor subscription owner → 403.
 * - push_interval_seconds present and caller is not admin → 403 (admin-only dial).
 * - propfirm_rule_id being set (non-null) but rule not found → 400 rule_not_found.
 * - propfirm_rule_id being set to a rule that belongs to a different user than the
 *   subscription owner → 400 rule_owner_mismatch.
 * - Otherwise → ok.
 */
export function decideSubscriptionPatch(args: {
  callerId: string | null;
  callerRole: Role | null;
  subscription: { user_id: string } | null;
  body: { push_interval_seconds?: number; propfirm_rule_id?: number | null };
  rule: { user_id: string } | null;   // pre-fetched when body.propfirm_rule_id is non-null
  ruleRequired: boolean;              // true when body.propfirm_rule_id is non-null
}): PatchDecision {
  const { callerId, callerRole, subscription, body, rule, ruleRequired } = args;

  if (!callerId) return { kind: "error", status: 401, code: "unauthenticated" };
  if (!subscription) return { kind: "error", status: 404, code: "not_found" };

  const isAdmin = callerRole === "admin";
  const isOwner = subscription.user_id === callerId;
  if (!isAdmin && !isOwner) return { kind: "error", status: 403, code: "forbidden" };

  if (body.push_interval_seconds !== undefined && !isAdmin) {
    return { kind: "error", status: 403, code: "forbidden" };
  }

  if (ruleRequired) {
    if (!rule) return { kind: "error", status: 400, code: "rule_not_found" };
    if (rule.user_id !== subscription.user_id) {
      return { kind: "error", status: 400, code: "rule_owner_mismatch" };
    }
  }

  return { kind: "ok" };
}

// ---------------------------------------------------------------------------
// decideOwnerAccess / decideListTarget (propfirm-rules route helpers)
// ---------------------------------------------------------------------------

export type OwnerAccessResult =
  | { kind: "ok" }
  | { kind: "not_found" };

/**
 * Decide whether a caller may access a specific propfirm rule.
 *
 * - Owner → ok.
 * - Admin (non-owner) → ok.
 * - Non-owner, non-admin → not_found (404 not 403, to avoid leaking ID existence).
 */
export function decideOwnerAccess(
  ruleUserId: string,
  callerId: string,
  callerRole: Role | null,
): OwnerAccessResult {
  if (ruleUserId === callerId) return { kind: "ok" };
  if (callerRole === "admin")  return { kind: "ok" };
  return { kind: "not_found" };
}

export type ListTargetResult =
  | { kind: "ok"; targetUserId: string }
  | { kind: "error"; status: 401 | 403; code: "unauthenticated" | "forbidden" };

/**
 * Decide which user's propfirm rules to list.
 *
 * - Unauthenticated callers → 401.
 * - Caller requesting another user's rules without admin role → 403.
 * - Admin requesting another user's rules → ok, that user's id.
 * - Caller requesting their own rules (or no ?user_id) → ok, caller's id.
 */
export function decideListTarget(
  callerId: string | null,
  callerRole: Role | null,
  queryUserId: string | null,
): ListTargetResult {
  if (!callerId) return { kind: "error", status: 401, code: "unauthenticated" };
  if (queryUserId && queryUserId !== callerId) {
    if (callerRole !== "admin") return { kind: "error", status: 403, code: "forbidden" };
    return { kind: "ok", targetUserId: queryUserId };
  }
  return { kind: "ok", targetUserId: callerId };
}
