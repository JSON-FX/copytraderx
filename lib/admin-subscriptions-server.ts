import "server-only";
import { getSupabaseAdmin } from "./supabase/server";
import type { Product } from "./products";
import type { LicenseTier, SubscriptionStatus } from "./types";
import type { AdminSubscriptionRow } from "./admin-subscriptions";

interface RawSubscriptionRow {
  id: number;
  user_id: string;
  product: Product;
  tier: LicenseTier;
  status: SubscriptionStatus;
  expires_at: string | null;
  created_at: string;
  hidden_at: string | null;
  users: { email: string; full_name: string | null } | null;
  propfirm_rules: { name: string } | null;
  licenses: {
    id: number;
    license_key: string;
    mt5_account: number;
    broker_name: string | null;
    intended_account_type: "live" | "demo" | "contest" | null;
    status: "active" | "revoked" | "expired";
    last_validated_at: string | null;
    activated_at: string | null;
  }[];
}

function rawToRow(raw: RawSubscriptionRow): AdminSubscriptionRow {
  const live =
    raw.licenses.find((l) => l.intended_account_type === "live") ?? null;
  const demo =
    raw.licenses.find((l) => l.intended_account_type === "demo") ?? null;
  return {
    id: raw.id,
    user_id: raw.user_id,
    user_email: raw.users?.email ?? "(unknown)",
    user_full_name: raw.users?.full_name ?? null,
    product: raw.product,
    tier: raw.tier,
    status: raw.status,
    expires_at: raw.expires_at,
    created_at: raw.created_at,
    hidden_at: raw.hidden_at,
    propfirm_rule_name: raw.propfirm_rules?.name ?? null,
    live_license: live,
    demo_license: demo,
  };
}

export async function fetchAdminSubscriptions(): Promise<AdminSubscriptionRow[]> {
  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .from("subscriptions")
    .select(
      `
      id, user_id, product, tier, status, expires_at, created_at, hidden_at,
      users:users!subscriptions_user_id_fkey ( email, full_name ),
      propfirm_rules:propfirm_rules!subscriptions_propfirm_rule_id_fkey ( name ),
      licenses:licenses!licenses_subscription_id_fkey (
        id, license_key, mt5_account, broker_name, intended_account_type,
        status, last_validated_at, activated_at
      )
      `,
    )
    .order("created_at", { ascending: false });
  if (error) {
    console.error("fetchAdminSubscriptions failed:", error);
    return [];
  }
  return (data as unknown as RawSubscriptionRow[]).map(rawToRow);
}
