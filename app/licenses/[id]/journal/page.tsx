import { notFound } from "next/navigation";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import {
  getAccountSnapshotCurrent, getAccountSnapshotsDaily, getDeals,
  getOpenPositions, getOrders, getPropfirmRule,
} from "@/lib/journal/queries";
import { SiteNav } from "@/components/site-nav";
import { JournalShell } from "@/components/journal/journal-shell";
import type { License } from "@/lib/types";

export const dynamic = "force-dynamic";

async function loadLicense(id: number): Promise<License | null> {
  const sb = getSupabaseAdmin();
  const { data, error } = await sb.from("licenses").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return (data as License | null) ?? null;
}

export default async function JournalPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const n = Number(id);
  if (!Number.isFinite(n)) notFound();

  const license = await loadLicense(n);
  if (!license) notFound();

  const [snapshot, positions, deals, orders, daily, rule] = await Promise.all([
    getAccountSnapshotCurrent(license.mt5_account),
    getOpenPositions(license.mt5_account),
    getDeals(license.mt5_account, 90),
    getOrders(license.mt5_account, 90),
    getAccountSnapshotsDaily(license.mt5_account, 90),
    license.propfirm_rule_id ? getPropfirmRule(license.propfirm_rule_id) : null,
  ]);

  return (
    <>
      <SiteNav />
      <JournalShell
        license={license}
        initialSnapshot={snapshot}
        initialDaily={daily}
        initialPositions={positions}
        initialDeals={deals}
        initialOrders={orders}
        rule={rule}
      />
    </>
  );
}
