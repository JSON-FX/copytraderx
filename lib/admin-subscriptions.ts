import "server-only";
import { getSupabaseAdmin } from "./supabase/server";
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

export interface AdminSubsFilterState {
  search: string;
  statuses: SubscriptionStatus[];
  products: Product[];
}

function matchesSearch(row: AdminSubscriptionRow, q: string): boolean {
  if (q.length === 0) return true;
  const needle = q.toLowerCase();
  const haystacks: string[] = [
    row.user_email,
    row.user_full_name ?? "",
    row.product,
    row.tier,
    row.status,
    row.live_license?.license_key ?? "",
    row.demo_license?.license_key ?? "",
    row.live_license ? String(row.live_license.mt5_account) : "",
    row.demo_license ? String(row.demo_license.mt5_account) : "",
    row.live_license?.broker_name ?? "",
    row.demo_license?.broker_name ?? "",
  ];
  return haystacks.some((h) => h.toLowerCase().includes(needle));
}

export function filterRows(
  rows: AdminSubscriptionRow[],
  state: AdminSubsFilterState,
): AdminSubscriptionRow[] {
  return rows.filter((row) => {
    if (state.statuses.length > 0 && !state.statuses.includes(row.status)) {
      return false;
    }
    if (state.products.length > 0 && !state.products.includes(row.product)) {
      return false;
    }
    if (!matchesSearch(row, state.search.trim())) return false;
    return true;
  });
}

export interface PaginatedGroups {
  groups: AdminUserGroup[];
  page: number;
  totalPages: number;
  totalGroups: number;
}

export function paginateGroups(
  groups: AdminUserGroup[],
  opts: { page: number; pageSize: number },
): PaginatedGroups {
  const totalGroups = groups.length;
  const totalPages = Math.max(1, Math.ceil(totalGroups / opts.pageSize));
  const clamped = Math.min(Math.max(1, opts.page), totalPages);
  const start = (clamped - 1) * opts.pageSize;
  const end = start + opts.pageSize;
  return {
    groups: groups.slice(start, end),
    page: clamped,
    totalPages,
    totalGroups,
  };
}

// ── Server-only data fetcher ──────────────────────────────────────────────────

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
