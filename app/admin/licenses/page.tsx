import { getSupabaseAdmin } from "@/lib/supabase/server";
import { LicenseTable } from "@/components/license-table";
import { SiteNav } from "@/components/site-nav";
import type { License } from "@/lib/types";

export const dynamic = "force-dynamic";

async function fetchLicenses(): Promise<License[]> {
  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .from("licenses")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) {
    console.error("Failed to fetch licenses:", error);
    return [];
  }
  return data as License[];
}

export default async function LicensesPage() {
  const licenses = await fetchLicenses();
  return (
    <div className="min-h-screen">
      <SiteNav />
      <main className="mx-auto max-w-6xl px-6 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold">Licenses</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {licenses.length} {licenses.length === 1 ? "license" : "licenses"} total
          </p>
        </div>
        <LicenseTable initialLicenses={licenses} />
      </main>
    </div>
  );
}
