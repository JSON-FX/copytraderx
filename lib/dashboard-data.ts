import { getSupabaseAdmin } from "@/lib/supabase/server";
import { PRODUCT_CODES } from "./products";
import type { Product } from "./products";
import type {
  DashboardProductGroup,
  DashboardSubscription,
  License,
  Subscription,
  SubscriptionExtension,
} from "./types";

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

  // Plan 6: load pending extensions for these subs in one batch.
  const { data: exts, error: extErr } = await sb
    .from("subscription_extensions")
    .select("*")
    .in("subscription_id", subIds)
    .eq("status", "pending");

  if (extErr) throw new Error(`extensions_fetch_failed: ${extErr.message}`);

  const bySub = new Map<number, { live: License | null; demo: License | null }>();
  for (const sub of subs) bySub.set(sub.id, { live: null, demo: null });
  for (const lic of (lics ?? []) as License[]) {
    const slot = bySub.get(lic.subscription_id);
    if (!slot) continue;
    if (lic.intended_account_type === "live") slot.live = lic;
    if (lic.intended_account_type === "demo") slot.demo = lic;
  }

  const extBySub = new Map<number, SubscriptionExtension>();
  for (const e of (exts ?? []) as SubscriptionExtension[]) {
    // Unique-pending-per-source index ensures at most one row per sub.
    extBySub.set(e.subscription_id, e);
  }

  const out: DashboardSubscription[] = subs.map((sub) => ({
    subscription: sub as Subscription,
    liveLicense: bySub.get(sub.id)!.live,
    demoLicense: bySub.get(sub.id)!.demo,
    pendingExtension: extBySub.get(sub.id) ?? null,
  }));

  out.sort((a, b) => {
    const da = STATUS_ORDER[a.subscription.status];
    const db = STATUS_ORDER[b.subscription.status];
    if (da !== db) return da - db;
    return new Date(b.subscription.created_at).getTime() - new Date(a.subscription.created_at).getTime();
  });

  return out;
}

/**
 * Group dashboard subscriptions by product. Within each product group, the
 * input ordering is preserved (so getDashboardData's status sort flows
 * through). Groups are emitted in PRODUCT_CODES canonical order so the
 * rendered dashboard is stable across refreshes.
 */
export function groupByProduct(
  items: DashboardSubscription[],
): DashboardProductGroup[] {
  const byProduct = new Map<Product, DashboardSubscription[]>();
  for (const item of items) {
    const code = item.subscription.product;
    const arr = byProduct.get(code);
    if (arr) arr.push(item);
    else byProduct.set(code, [item]);
  }
  const out: DashboardProductGroup[] = [];
  for (const code of PRODUCT_CODES) {
    const subs = byProduct.get(code);
    if (subs && subs.length > 0) out.push({ product: code, subscriptions: subs });
  }
  return out;
}
