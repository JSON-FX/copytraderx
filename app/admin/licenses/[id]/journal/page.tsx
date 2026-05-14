import { notFound } from "next/navigation";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import {
  getAccountSnapshotCurrent, getAccountSnapshotsDaily, getDeals,
  getOpenPositions, getOrders,
} from "@/lib/journal/queries";
import { AdminSiteNav } from "@/components/admin/admin-site-nav";
import { JournalShell } from "@/components/journal/journal-shell";
import type { License, PropfirmRule } from "@/lib/types";

export const dynamic = "force-dynamic";

interface LicenseWithSubscription extends License {
  subscriptions: { push_interval_seconds: number; propfirm_rule_id: number | null } | null;
}

async function loadLicense(id: number): Promise<LicenseWithSubscription | null> {
  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .from("licenses")
    .select("*, subscriptions(push_interval_seconds, propfirm_rule_id)")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return (data as LicenseWithSubscription | null) ?? null;
}

async function loadPropfirmRule(ruleId: number): Promise<PropfirmRule | null> {
  const sb = getSupabaseAdmin();
  const { data, error } = await sb.from("propfirm_rules").select("*").eq("id", ruleId).maybeSingle();
  if (error) return null;
  return (data as PropfirmRule | null) ?? null;
}

export default async function JournalPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const n = Number(id);
  if (!Number.isFinite(n)) notFound();

  const license = await loadLicense(n);
  if (!license) notFound();

  const sub = license.subscriptions;
  const pushIntervalSeconds = sub?.push_interval_seconds ?? 10;
  const ruleId = sub?.propfirm_rule_id ?? null;

  const [snapshot, positions, deals, orders, daily, rule] = await Promise.all([
    getAccountSnapshotCurrent(license.mt5_account),
    getOpenPositions(license.mt5_account),
    getDeals(license.mt5_account),
    getOrders(license.mt5_account),
    getAccountSnapshotsDaily(license.mt5_account),
    ruleId ? loadPropfirmRule(ruleId) : Promise.resolve(null),
  ]);

  return (
    <>
      <AdminSiteNav />
      <JournalShell
        license={license}
        initialSnapshot={snapshot}
        initialDaily={daily}
        initialPositions={positions}
        initialDeals={deals}
        initialOrders={orders}
        rule={rule}
        pushIntervalSeconds={pushIntervalSeconds}
      />
    </>
  );
}
