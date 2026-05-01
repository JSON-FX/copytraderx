import "server-only";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import type {
  AccountSnapshotCurrent, AccountSnapshotDaily, Deal, OrderRow,
  Position, PropfirmRule,
} from "@/lib/types";

export async function getAccountSnapshotCurrent(
  mt5_account: number,
): Promise<AccountSnapshotCurrent | null> {
  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .from("account_snapshots_current")
    .select("*")
    .eq("mt5_account", mt5_account)
    .maybeSingle();
  if (error) throw error;
  return (data as AccountSnapshotCurrent | null) ?? null;
}

// days = 0 means "all history" (no time filter). Default is full lifetime.
export async function getAccountSnapshotsDaily(
  mt5_account: number,
  days = 0,
): Promise<AccountSnapshotDaily[]> {
  const sb = getSupabaseAdmin();
  let q = sb
    .from("account_snapshots_daily")
    .select("*")
    .eq("mt5_account", mt5_account);
  if (days > 0) {
    const fromDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
      .toISOString().slice(0, 10);
    q = q.gte("trade_date", fromDate);
  }
  const { data, error } = await q.order("trade_date", { ascending: true });
  if (error) throw error;
  return (data ?? []) as AccountSnapshotDaily[];
}

export async function getOpenPositions(mt5_account: number): Promise<Position[]> {
  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .from("positions")
    .select("*")
    .eq("mt5_account", mt5_account)
    .order("open_time", { ascending: false });
  if (error) throw error;
  return (data ?? []) as Position[];
}

// days = 0 means "all history" (no time filter).
export async function getDeals(
  mt5_account: number,
  days = 0,
): Promise<Deal[]> {
  const sb = getSupabaseAdmin();
  let q = sb
    .from("deals")
    .select("*")
    .eq("mt5_account", mt5_account);
  if (days > 0) {
    const fromIso = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
    q = q.gte("close_time", fromIso);
  }
  const { data, error } = await q.order("close_time", { ascending: false });
  if (error) throw error;
  return (data ?? []) as Deal[];
}

export async function getOrders(mt5_account: number, days = 0): Promise<OrderRow[]> {
  const sb = getSupabaseAdmin();
  let q = sb
    .from("orders")
    .select("*")
    .eq("mt5_account", mt5_account);
  if (days > 0) {
    const fromIso = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
    q = q.gte("time_setup", fromIso);
  }
  const { data, error } = await q.order("time_setup", { ascending: false });
  if (error) throw error;
  return (data ?? []) as OrderRow[];
}

export async function listPropfirmRules(): Promise<PropfirmRule[]> {
  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .from("propfirm_rules")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as PropfirmRule[];
}

export async function getPropfirmRule(id: number): Promise<PropfirmRule | null> {
  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .from("propfirm_rules")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return (data as PropfirmRule | null) ?? null;
}
