import { notFound } from "next/navigation";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { AdminSiteNav } from "@/components/admin/admin-site-nav";
import { TrialActions } from "@/components/trial-actions";
import { deriveTrialDisplayStatus } from "@/lib/trial-state";
import type { TrialLead, TrialLicense } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function TrialDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: idRaw } = await params;
  const id = Number(idRaw);
  if (!Number.isInteger(id) || id <= 0) notFound();

  const sb = getSupabaseAdmin();
  const { data: lead, error: leadErr } = await sb
    .from("trial_leads")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (leadErr || !lead) notFound();

  const { data: license, error: licErr } = await sb
    .from("trial_licenses")
    .select("*")
    .eq("trial_lead_id", id)
    .maybeSingle();
  if (licErr || !license) notFound();

  const typedLead = lead as TrialLead;
  const typedLicense = license as TrialLicense;
  const display = deriveTrialDisplayStatus({
    status: typedLicense.status,
    expires_at: typedLicense.expires_at,
  });

  return (
    <div className="min-h-screen">
      <AdminSiteNav />
      <main className="mx-auto max-w-3xl px-6 py-10">
        <h1 className="text-2xl font-semibold">Trial #{typedLead.id}</h1>

        <section className="mt-6 grid grid-cols-2 gap-4 text-sm">
          <Field label="License key" value={typedLicense.license_key} mono />
          <Field label="Status" value={display} />
          <Field label="Product" value={typedLicense.product} />
          <Field label="MT5 account" value={String(typedLicense.mt5_account)} mono />
          <Field label="Expires at" value={typedLicense.expires_at} />
          <Field label="Activated at" value={typedLicense.activated_at ?? "—"} />
          <Field label="Last validated" value={typedLicense.last_validated_at ?? "—"} />
          <Field label="Account type (reported)" value={typedLicense.account_type ?? "—"} />
          <Field label="Broker (reported)" value={typedLicense.broker_name ?? "—"} />
          <Field label="Lead status" value={typedLead.status} />
          <Field label="Email" value={typedLead.email} />
          <Field label="Telegram" value={typedLead.telegram_handle ?? "—"} />
          <Field label="Discord" value={typedLead.discord_handle ?? "—"} />
          <Field label="Converted user_id" value={typedLead.converted_user_id ?? "—"} mono />
          <Field label="Notes" value={typedLead.notes ?? "—"} />
          <Field label="Created at" value={typedLead.created_at} />
        </section>

        <div className="mt-8">
          <h2 className="text-sm font-medium uppercase text-muted-foreground">Actions</h2>
          <div className="mt-3">
            <TrialActions
              trialLeadId={typedLead.id}
              licenseStatus={typedLicense.status}
              leadStatus={typedLead.status}
            />
          </div>
        </div>
      </main>
    </div>
  );
}

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <div className="text-xs uppercase text-muted-foreground">{label}</div>
      <div className={mono ? "mt-0.5 font-mono" : "mt-0.5"}>{value}</div>
    </div>
  );
}
