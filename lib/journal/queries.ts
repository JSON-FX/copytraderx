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

export async function getAccountSnapshotsDaily(
  mt5_account: number,
  days = 90,
): Promise<AccountSnapshotDaily[]> {
  const sb = getSupabaseAdmin();
  const fromDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
    .toISOString().slice(0, 10);
  const { data, error } = await sb
    .from("account_snapshots_daily")
    .select("*")
    .eq("mt5_account", mt5_account)
    .gte("trade_date", fromDate)
    .order("trade_date", { ascending: true });
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

export async function getDeals(
  mt5_account: number,
  days = 90,
): Promise<Deal[]> {
  const sb = getSupabaseAdmin();
  const fromIso = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await sb
    .from("deals")
    .select("*")
    .eq("mt5_account", mt5_account)
    .gte("close_time", fromIso)
    .order("close_time", { ascending: false });
  if (error) throw error;
  return (data ?? []) as Deal[];
}

export async function getOrders(mt5_account: number, days = 90): Promise<OrderRow[]> {
  const sb = getSupabaseAdmin();
  const fromIso = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await sb
    .from("orders")
    .select("*")
    .eq("mt5_account", mt5_account)
    .gte("time_setup", fromIso)
    .order("time_setup", { ascending: false });
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
