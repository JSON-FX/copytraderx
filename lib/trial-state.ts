import type { TrialDisplayStatus, TrialLicenseStatus } from "./types";

export function deriveTrialDisplayStatus(
  license: { status: TrialLicenseStatus; expires_at: string },
  now: Date = new Date(),
): TrialDisplayStatus {
  if (license.status === "revoked") return "revoked";
  const expires = new Date(license.expires_at).getTime();
  if (expires <= now.getTime()) return "expired";
  return "active";
}
