import { getSupabaseAdmin } from "@/lib/supabase/server";
import type { DashboardSubscription, License, Subscription } from "./types";

const STATUS_ORDER: Record<Subscription["status"], number> = {
  active: 0,
  pending: 1,
  expired: 2,
  revoked: 3,
  rejected: 4,
};

export async function getDashboardData(
  userId: string,
): Promise<DashboardSubscription[]> {
  const sb = getSupabaseAdmin();

  const { data: subs, error: subsErr } = await sb
    .from("subscriptions")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (subsErr) throw new Error(`subscriptions_fetch_failed: ${subsErr.message}`);
  if (!subs || subs.length === 0) return [];

  const subIds = subs.map((s) => s.id);
  const { data: lics, error: licErr } = await sb
    .from("licenses")
    .select("*")
    .in("subscription_id", subIds);

  if (licErr) throw new Error(`licenses_fetch_failed: ${licErr.message}`);

  const bySub = new Map<number, { live: License | null; demo: License | null }>();
  for (const sub of subs) bySub.set(sub.id, { live: null, demo: null });
  type LicenseRow = License & { subscription_id: number | null };
  for (const lic of (lics ?? []) as LicenseRow[]) {
    if (lic.subscription_id === null) continue;
    const slot = bySub.get(lic.subscription_id);
    if (!slot) continue;
    if (lic.intended_account_type === "live") slot.live = lic;
    if (lic.intended_account_type === "demo") slot.demo = lic;
  }

  const out: DashboardSubscription[] = subs.map((sub) => ({
    subscription: sub as Subscription,
    liveLicense: bySub.get(sub.id)!.live,
    demoLicense: bySub.get(sub.id)!.demo,
  }));

  out.sort((a, b) => {
    const da = STATUS_ORDER[a.subscription.status];
    const db = STATUS_ORDER[b.subscription.status];
    if (da !== db) return da - db;
    return new Date(b.subscription.created_at).getTime() - new Date(a.subscription.created_at).getTime();
  });

  return out;
}
