import Link from "next/link";
import { notFound } from "next/navigation";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { LicenseForm } from "@/components/license-form";
import { SiteNav } from "@/components/site-nav";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { isExpired } from "@/lib/expiry";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertTriangle } from "lucide-react";
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

  const pastExpiry =
    license.status === "active" && isExpired(license.expires_at);

  return (
    <div className="min-h-screen">
      <SiteNav />
      <main className="mx-auto max-w-6xl px-6 py-8">
        <div className="mb-6">
          <Link href="/licenses" className="text-sm text-muted-foreground hover:underline">
            ← Back to licenses
          </Link>
          <h1 className="mt-2 text-2xl font-semibold">Edit License</h1>
        </div>

        {pastExpiry && (
          <Alert className="mb-6">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              License is past expiry — customer&apos;s EA stopped trading on{" "}
              {new Date(license.expires_at!).toLocaleDateString()}. Renew below to reactivate.
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
              label="Last Validated"
              value={license.last_validated_at ?? "Never"}
            />
            <Row label="Broker (last seen)" value={license.broker_name ?? "—"} />
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
