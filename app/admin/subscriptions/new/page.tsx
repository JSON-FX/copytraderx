import Link from "next/link";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { AdminSiteNav } from "@/components/admin/admin-site-nav";
import { AdminCreateSubscriptionForm } from "@/components/admin/admin-create-subscription-form";

export default async function AdminCreateSubscriptionPage() {
  const sb = getSupabaseAdmin();
  const { data: rules, error } = await sb
    .from("propfirm_rules")
    .select("id, name")
    .order("name");

  return (
    <div className="min-h-screen">
      <AdminSiteNav />
      <main className="mx-auto max-w-2xl px-6 py-8">
        <div className="mb-6">
          <Link
            href="/admin/licenses"
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            ← Back to licenses
          </Link>
          <h1 className="mt-2 text-2xl font-semibold">Create subscription</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Provisions an active subscription for a user. The user can claim live + demo
            slots themselves once they sign in.
          </p>
        </div>
        {error ? (
          <p className="text-sm text-destructive">
            Failed to load propfirm rules: {error.message}
          </p>
        ) : (
          <AdminCreateSubscriptionForm rules={rules ?? []} />
        )}
      </main>
    </div>
  );
}
