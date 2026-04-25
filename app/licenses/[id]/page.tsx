import Link from "next/link";
import { notFound } from "next/navigation";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { LicenseForm } from "@/components/license-form";
import { LivenessBadge } from "@/components/liveness-badge";
import { ActivateNowButton } from "@/components/activate-now-button";
import { SiteNav } from "@/components/site-nav";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { isExpired } from "@/lib/expiry";
import { deriveLiveness } from "@/lib/liveness";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertTriangle, Clock } from "lucide-react";
import type { License } from "@/lib/types";

export const dynamic = "force-dynamic";

async function fetchLicense(id: number): Promise<License | null> {
  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .from("licenses")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) return null;
  return data as License | null;
}

function daysSince(iso: string): number {
  const ms = Date.now() - new Date(iso).getTime();
  return Math.max(0, Math.floor(ms / (24 * 60 * 60 * 1000)));
}

export default async function EditLicensePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const numericId = Number(id);
  if (!Number.isInteger(numericId) || numericId <= 0) notFound();

  const license = await fetchLicense(numericId);
  if (!license) notFound();

  const liveness = deriveLiveness(license, new Date());
  const pastExpiry =
    license.status === "active" && isExpired(license.expires_at);
  const notActivated =
    license.status === "active" && license.activated_at === null;

  return (
    <div className="min-h-screen">
      <SiteNav />
      <main className="mx-auto max-w-6xl px-6 py-8">
        <div className="mb-6">
          <Link
            href="/licenses"
            className="text-sm text-muted-foreground hover:underline"
          >
            ← Back to licenses
          </Link>
          <div className="mt-2 flex items-center gap-3">
            <h1 className="text-2xl font-semibold">Edit License</h1>
            <LivenessBadge state={liveness} />
          </div>
        </div>

        {notActivated && license.tier && (
          <Alert className="mb-6 border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
            <Clock className="h-4 w-4" />
            <AlertDescription className="flex items-center justify-between gap-4">
              <span>
                License sold {daysSince(license.created_at)} day(s) ago — customer
                hasn&apos;t activated yet. Subscription clock starts on first EA
                validation, or click below to start it now.
              </span>
              <ActivateNowButton licenseId={license.id} tier={license.tier} />
            </AlertDescription>
          </Alert>
        )}

        {pastExpiry && (
          <Alert className="mb-6">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              License is past expiry — customer&apos;s EA stopped trading on{" "}
              {new Date(license.expires_at!).toLocaleDateString()}. Renew below
              to reactivate.
            </AlertDescription>
          </Alert>
        )}

        <LicenseForm mode="edit" initial={license} />

        <Card className="mt-10 max-w-xl">
          <CardHeader>
            <CardTitle className="text-base">Metadata</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2 text-sm">
            <Row label="ID" value={license.id} />
            <Row label="Created" value={license.created_at} />
            <Row label="Purchase Date" value={license.purchase_date ?? "—"} />
            <Row
              label="Activated"
              value={
                license.activated_at
                  ? `${license.activated_at} (${daysSince(license.created_at) - daysSince(license.activated_at)} day(s) after purchase)`
                  : "Not yet activated"
              }
            />
            <Row
              label="Last Validated"
              value={license.last_validated_at ?? "Never"}
            />
            <Row
              label="Broker (last seen)"
              value={license.broker_name ?? "—"}
            />
          </CardContent>
        </Card>
      </main>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex justify-between gap-4 border-b py-1.5 last:border-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-mono text-xs">{value}</span>
    </div>
  );
}
