import type { Role } from "./role";

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
