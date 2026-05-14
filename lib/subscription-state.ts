import type { SubscriptionStatus, LicenseTier } from "./types";

export type GuardResult =
  | { ok: true }
  | { ok: false; reason: string };

export function canCancel(s: { status: SubscriptionStatus }): GuardResult {
  if (s.status === "pending") return { ok: true };
  return { ok: false, reason: "not_pending" };
}

export function canClaimOn(s: { status: SubscriptionStatus }): GuardResult {
  if (s.status === "active") return { ok: true };
  return { ok: false, reason: "subscription_not_active" };
}

export function canRenewFrom(s: { status: SubscriptionStatus }): GuardResult {
  if (s.status === "expired" || s.status === "revoked") return { ok: true };
  return { ok: false, reason: "not_renewable" };
}

export function canApprove(s: { status: SubscriptionStatus }): GuardResult {
  if (s.status === "pending") return { ok: true };
  return { ok: false, reason: "not_pending" };
}

export function canReject(s: { status: SubscriptionStatus }): GuardResult {
  if (s.status === "pending") return { ok: true };
  return { ok: false, reason: "not_pending" };
}

export function canRevoke(s: { status: SubscriptionStatus }): GuardResult {
  if (s.status === "active") return { ok: true };
  return { ok: false, reason: "not_active" };
}

export const tierRank = { monthly: 1, quarterly: 2, yearly: 3 } as const;

export function canExtendFrom(s: { status: SubscriptionStatus }): GuardResult {
  if (s.status === "active") return { ok: true };
  return { ok: false, reason: "subscription_not_active" };
}

export function canExtendToTier(
  sourceTier: LicenseTier,
  requestedTier: LicenseTier,
): GuardResult {
  if (tierRank[requestedTier] >= tierRank[sourceTier]) return { ok: true };
  return { ok: false, reason: "tier_downgrade_not_allowed" };
}

export function canHide(
  s: { status: SubscriptionStatus; hidden_at: string | null },
): GuardResult {
  if (s.hidden_at !== null) return { ok: false, reason: "already_hidden" };
  if (s.status === "expired" || s.status === "revoked" || s.status === "rejected") {
    return { ok: true };
  }
  return { ok: false, reason: "not_hideable" };
}
