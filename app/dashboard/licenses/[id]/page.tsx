import { notFound, redirect } from "next/navigation";
import { getSupabaseSSR } from "@/lib/supabase/ssr";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import {
  getAccountSnapshotCurrent,
  getAccountSnapshotsDaily,
  getDeals,
  getOpenPositions,
  getOrders,
  getPropfirmRule,
} from "@/lib/journal/queries";
import { JournalShell } from "@/components/journal/journal-shell";
import type { License } from "@/lib/types";

export const dynamic = "force-dynamic";

async function loadLicense(id: number): Promise<License | null> {
  const sb = getSupabaseAdmin();
  const { data, error } = await sb.from("licenses").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return (data as License | null) ?? null;
}

export default async function UserJournalPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: idRaw } = await params;
  const id = Number(idRaw);
  if (!Number.isFinite(id) || id <= 0) notFound();

  const ssr = await getSupabaseSSR();
  const {
    data: { user },
  } = await ssr.auth.getUser();
  if (!user) redirect("/login");

  const license = await loadLicense(id);
  if (!license) notFound();

  const role = (user.app_metadata?.role as "admin" | "user" | undefined) ?? null;
  if (role !== "admin" && license.user_id !== user.id) {
    notFound();
  }

  const [snapshot, positions, deals, orders, daily, rule] = await Promise.all([
    getAccountSnapshotCurrent(license.mt5_account),
    getOpenPositions(license.mt5_account),
    getDeals(license.mt5_account),
    getOrders(license.mt5_account),
    getAccountSnapshotsDaily(license.mt5_account),
    license.propfirm_rule_id ? getPropfirmRule(license.propfirm_rule_id) : null,
  ]);

  return (
    <JournalShell
      license={license}
      initialSnapshot={snapshot}
      initialDaily={daily}
      initialPositions={positions}
      initialDeals={deals}
      initialOrders={orders}
      rule={rule}
    />
  );
}
