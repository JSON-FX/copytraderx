export type LicenseStatus = "active" | "revoked" | "expired";
export type LicenseTier = "monthly" | "quarterly" | "yearly";

export interface License {
  id: number;
  license_key: string;
  mt5_account: number;
  status: LicenseStatus;
  tier: LicenseTier | null;
  expires_at: string | null;            // ISO 8601 or null (null = not yet activated)
  activated_at: string | null;          // ISO 8601 or null (null = never activated)
  customer_email: string | null;
  purchase_date: string | null;
  last_validated_at: string | null;
  broker_name: string | null;
  notes: string | null;
  created_at: string;
}

/** Derived "display" status: revoked > expired (date-based) > active. */
export type DisplayStatus = "active" | "revoked" | "expired";

/** Liveness state — derived from activated_at + last_validated_at + status. */
export type LivenessState =
  | "revoked"
  | "expired"
  | "not_activated"
  | "online"
  | "stale"
  | "offline";
