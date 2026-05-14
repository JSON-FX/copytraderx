import Link from "next/link";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { TrialTable } from "@/components/trial-table";
import type { TrialLead, TrialLicense } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function TrialsPage() {
  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .from("trial_leads")
    .select("*, trial_licenses(*)")
    .order("created_at", { ascending: false });

  if (error) {
    return (
      <main className="mx-auto max-w-6xl px-6 py-10">
        <h1 className="text-2xl font-semibold">Trials</h1>
        <p className="mt-4 text-sm text-red-600">Failed to load trials: {error.message}</p>
      </main>
    );
  }

  const rows = (data ?? [])
    .flatMap((lead) => {
      const licenses = Array.isArray(lead.trial_licenses)
        ? lead.trial_licenses
        : lead.trial_licenses
          ? [lead.trial_licenses]
          : [];
      return licenses.map((license: TrialLicense) => ({
        trial_lead: lead as TrialLead,
        trial_license: license,
      }));
    });

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Trials</h1>
        <Link
          href="/admin/trials/new"
          className="rounded-md bg-foreground px-3 py-1.5 text-sm text-background hover:opacity-90"
        >
          + New trial
        </Link>
      </div>
      <div className="mt-6">
        <TrialTable rows={rows} />
      </div>
    </main>
  );
}
