import { getSupabaseAdmin } from "@/lib/supabase/server";
import { productDisplayName } from "@/lib/products";
import { tierLabel } from "@/lib/users";
import { PendingRequestsTable, type PendingRequestRow } from "@/components/admin/pending-requests-table";
import { PendingExtensionsTable, type PendingExtensionRow } from "@/components/admin/pending-extensions-table";
import { AdminSiteNav } from "@/components/admin/admin-site-nav";

export const dynamic = "force-dynamic";

export default async function AdminRequestsPage() {
  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .from("subscriptions")
    .select("id, product, tier, notes, requested_at, user_id, users!subscriptions_user_id_fkey(email, full_name)")
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

  // Plan 6: pending extensions, joined to the source subscription + user.
  const { data: rawExtensions, error: extError } = await sb
    .from("subscription_extensions")
    .select(
      "id, requested_tier, notes, requested_at, " +
        "subscription:subscriptions!subscription_extensions_subscription_id_fkey(product, tier, expires_at, user_id), " +
        "user:users!subscription_extensions_user_id_fkey(email, full_name)",
    )
    .eq("status", "pending")
    .order("requested_at", { ascending: true });

  type ExtRow = {
    id: number;
    requested_tier: string;
    notes: string | null;
    requested_at: string;
    subscription: { product: string; tier: string; expires_at: string | null; user_id: string };
    user: { email: string; full_name: string | null };
  };

  const extensionRows: PendingExtensionRow[] = ((rawExtensions as unknown as ExtRow[]) ?? []).map((r) => ({
    id: r.id,
    user_email: r.user.email,
    user_full_name: r.user.full_name,
    product_label: productDisplayName(r.subscription.product as never),
    source_tier: tierLabel(r.subscription.tier as never),
    source_expires_at: r.subscription.expires_at,
    requested_tier: tierLabel(r.requested_tier as never),
    notes: r.notes,
    requested_at: r.requested_at,
  }));

  return (
    <div className="min-h-screen">
      <AdminSiteNav />
      <main className="mx-auto max-w-6xl px-6 py-8 space-y-8">
        <section className="space-y-4">
          <h1 className="text-2xl font-semibold">Pending requests</h1>
          <PendingRequestsTable rows={rows} />
        </section>

        <section className="space-y-4">
          <h2 className="text-xl font-semibold">Pending extensions</h2>
          {extError ? (
            <p className="text-sm text-red-600">Failed to load extensions: {extError.message}</p>
          ) : (
            <PendingExtensionsTable rows={extensionRows} />
          )}
        </section>
      </main>
    </div>
  );
}
