import { getSupabaseAdmin } from "@/lib/supabase/server";
import { productDisplayName } from "@/lib/products";
import { tierLabel } from "@/lib/users";
import { PendingRequestsTable, type PendingRequestRow } from "@/components/admin/pending-requests-table";
import { AdminSiteNav } from "@/components/admin/admin-site-nav";

export const dynamic = "force-dynamic";

export default async function AdminRequestsPage() {
  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .from("subscriptions")
    .select("id, product, tier, notes, requested_at, user_id, users!inner(email, full_name)")
    .eq("status", "pending")
    .order("requested_at", { ascending: true });

  if (error) {
    return <div className="p-6 text-red-600">Failed to load requests: {error.message}</div>;
  }

  type Row = {
    id: number;
    product: string;
    tier: string;
    notes: string | null;
    requested_at: string;
    user_id: string;
    users: { email: string; full_name: string | null };
  };

  const rows: PendingRequestRow[] = ((data as unknown as Row[]) ?? []).map((r) => ({
    id: r.id,
    user_email: r.users.email,
    user_full_name: r.users.full_name,
    product_label: productDisplayName(r.product as never),
    tier_label: tierLabel(r.tier as never),
    notes: r.notes,
    requested_at: r.requested_at,
  }));

  return (
    <div className="min-h-screen">
      <AdminSiteNav />
      <main className="mx-auto max-w-6xl px-6 py-8 space-y-4">
        <h1 className="text-2xl font-semibold">Pending requests</h1>
        <PendingRequestsTable rows={rows} />
      </main>
    </div>
  );
}
