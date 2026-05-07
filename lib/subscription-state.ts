import type { SubscriptionStatus } from "./types";

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
