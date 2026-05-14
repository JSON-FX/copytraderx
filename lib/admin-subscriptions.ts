import type { Product } from "./products";
import type {
  LicenseTier,
  SubscriptionStatus,
} from "./types";

export interface AdminLicenseSlot {
  id: number;
  license_key: string;
  mt5_account: number;
  broker_name: string | null;
  intended_account_type: "live" | "demo" | "contest" | null;
  status: "active" | "revoked" | "expired";
  last_validated_at: string | null;
  activated_at: string | null;
}

export interface AdminSubscriptionRow {
  id: number;
  user_id: string;
  user_email: string;
  user_full_name: string | null;
  product: Product;
  tier: LicenseTier;
  status: SubscriptionStatus;
  expires_at: string | null;
  created_at: string;
  hidden_at: string | null;
  propfirm_rule_name: string | null;
  live_license: AdminLicenseSlot | null;
  demo_license: AdminLicenseSlot | null;
}

export interface AdminUserGroup {
  user_id: string;
  user_email: string;
  user_full_name: string | null;
  subscriptions: AdminSubscriptionRow[];
}

export type StatusCounts = Record<SubscriptionStatus, number>;

export function groupByUser(
  rows: AdminSubscriptionRow[],
): AdminUserGroup[] {
  const byId = new Map<string, AdminUserGroup>();
  const order: string[] = [];
  for (const row of rows) {
    let group = byId.get(row.user_id);
    if (!group) {
      group = {
        user_id: row.user_id,
        user_email: row.user_email,
        user_full_name: row.user_full_name,
        subscriptions: [],
      };
      byId.set(row.user_id, group);
      order.push(row.user_id);
    }
    group.subscriptions.push(row);
  }
  return order.map((id) => byId.get(id)!);
}

export function summarizeStatuses(
  rows: AdminSubscriptionRow[],
): StatusCounts {
  const counts: StatusCounts = {
    active: 0,
    pending: 0,
    rejected: 0,
    expired: 0,
    revoked: 0,
  };
  for (const row of rows) {
    counts[row.status]++;
  }
  return counts;
}
