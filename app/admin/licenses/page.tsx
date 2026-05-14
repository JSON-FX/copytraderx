import { getSupabaseAdmin } from "@/lib/supabase/server";
import { LicenseTable, type LicenseRow } from "@/components/license-table";
import { AdminSiteNav } from "@/components/admin/admin-site-nav";

export const dynamic = "force-dynamic";

interface RawLicenseWithOwner {
  id: number;
  license_key: string;
  mt5_account: number;
  product: string;
  subscription_id: number | null;
  user_id: string | null;
  status: "active" | "revoked" | "expired";
  tier: string | null;
  expires_at: string | null;
  activated_at: string | null;
  purchase_date: string | null;
  last_validated_at: string | null;
  broker_name: string | null;
  account_type: string | null;
  intended_account_type: string | null;
  notes: string | null;
  created_at: string;
  subscriptions:
    | { users: { email: string } | null }
    | null;
}

async function fetchLicensesWithOwner(): Promise<LicenseRow[]> {
  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .from("licenses")
    .select(
      `
      *,
      subscriptions:subscriptions!licenses_subscription_id_fkey (
        users:users!subscriptions_user_id_fkey ( email )
      )
      `,
    )
    .order("created_at", { ascending: false });
  if (error) {
    console.error("Failed to fetch licenses:", error);
    return [];
  }
  return (data as unknown as RawLicenseWithOwner[]).map((r) => ({
    ...r,
    owner_email: r.subscriptions?.users?.email ?? null,
  })) as unknown as LicenseRow[];
}

export default async function LicensesPage() {
  const licenses = await fetchLicensesWithOwner();
  return (
    <div className="min-h-screen">
      <AdminSiteNav />
      <main className="mx-auto max-w-6xl px-6 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold">Licenses <span className="text-muted-foreground text-base font-normal">(ops)</span></h1>
          <p className="mt-1 text-sm text-muted-foreground">
            EA-side view — use <a className="underline" href="/admin/subscriptions">Subscriptions</a> to manage entitlements.
            {" "}{licenses.length} {licenses.length === 1 ? "license" : "licenses"} total.
          </p>
        </div>
        <LicenseTable initialLicenses={licenses} />
      </main>
    </div>
  );
}
