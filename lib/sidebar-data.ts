// lib/sidebar-data.ts
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { productDisplayName, type Product } from "./products";

const STATUS_ORDER: Record<string, number> = {
  active: 0, pending: 1, expired: 2, revoked: 3, rejected: 4,
};

export interface SidebarAccount {
  licenseId: number;
  mt5Account: number;
  slotType: "live" | "demo";
  status: string;
  product: string;
}

export interface SidebarSubscriptionGroup {
  subscriptionId: number;
  product: string;
  productDisplayName: string;
  ruleName: string | null;
  status: string;
  liveSlot: SidebarAccount | null;
  demoSlot: SidebarAccount | null;
}

export interface SidebarData {
  active: SidebarSubscriptionGroup[];
  past: SidebarSubscriptionGroup[];
}

export async function getSidebarData(userId: string): Promise<SidebarData> {
  const sb = getSupabaseAdmin();

  const { data: subs, error: subsErr } = await sb
    .from("subscriptions")
    .select("*, propfirm_rules(name)")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (subsErr) throw new Error(`sidebar_subs_fetch: ${subsErr.message}`);
  if (!subs || subs.length === 0) return { active: [], past: [] };

  const subIds = subs.map((s: { id: number }) => s.id);
  const { data: lics, error: licErr } = await sb
    .from("licenses")
    .select("id, mt5_account, intended_account_type, subscription_id, status, product")
    .in("subscription_id", subIds);

  if (licErr) throw new Error(`sidebar_lics_fetch: ${licErr.message}`);

  const licBySub = new Map<number, { live: SidebarAccount | null; demo: SidebarAccount | null }>();
  for (const sub of subs) licBySub.set(sub.id, { live: null, demo: null });
  for (const lic of lics ?? []) {
    const slot = licBySub.get(lic.subscription_id);
    if (!slot) continue;
    const acct: SidebarAccount = {
      licenseId: lic.id,
      mt5Account: lic.mt5_account,
      slotType: lic.intended_account_type === "demo" ? "demo" : "live",
      status: lic.status,
      product: lic.product,
    };
    if (lic.intended_account_type === "demo") slot.demo = acct;
    else slot.live = acct;
  }

  const groups: SidebarSubscriptionGroup[] = subs.map((sub: Record<string, unknown>) => ({
    subscriptionId: sub.id as number,
    product: sub.product as string,
    productDisplayName: productDisplayName(sub.product as Product),
    ruleName: (sub.propfirm_rules as { name: string } | null)?.name ?? null,
    status: sub.status as string,
    liveSlot: licBySub.get(sub.id as number)?.live ?? null,
    demoSlot: licBySub.get(sub.id as number)?.demo ?? null,
  }));

  groups.sort((a, b) => (STATUS_ORDER[a.status] ?? 9) - (STATUS_ORDER[b.status] ?? 9));

  const active = groups.filter((g) => g.status === "active" || g.status === "pending");
  const past = groups.filter((g) => g.status !== "active" && g.status !== "pending");

  return { active, past };
}
