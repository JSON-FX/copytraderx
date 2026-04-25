import { addMonths, addYears } from "date-fns";
import type { LicenseTier, LicenseStatus, DisplayStatus } from "./types";

export function calculateExpiresAt(tier: LicenseTier, from: Date): Date {
  switch (tier) {
    case "monthly":
      return addMonths(from, 1);
    case "quarterly":
      return addMonths(from, 3);
    case "yearly":
      return addYears(from, 1);
  }
}

export function isExpired(expiresAt: string | null): boolean {
  if (expiresAt === null) return false;
  return new Date(expiresAt).getTime() <= Date.now();
}

export function computeDisplayStatus(
  status: LicenseStatus,
  expiresAt: string | null,
): DisplayStatus {
  if (status === "revoked") return "revoked";
  if (status === "expired") return "expired";
  if (isExpired(expiresAt)) return "expired";
  return "active";
}

export function formatExpiry(expiresAt: string | null): string {
  if (expiresAt === null) return "Not activated";
  // Use UTC components to avoid timezone-dependent off-by-one.
  const d = new Date(expiresAt);
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}
