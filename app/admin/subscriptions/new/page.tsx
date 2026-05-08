import { getSupabaseAdmin } from "@/lib/supabase/server";
import { AdminCreateSubscriptionForm } from "@/components/admin/admin-create-subscription-form";

export default async function AdminCreateSubscriptionPage() {
  const sb = getSupabaseAdmin();
  const { data: rules, error } = await sb
    .from("propfirm_rules")
    .select("id, name")
    .order("name");
  if (error) {
    return <div className="p-6 text-red-600">Failed to load rules: {error.message}</div>;
  }
  return (
    <div className="p-6 space-y-4">
      <h1 className="text-2xl font-semibold">Create subscription</h1>
      <p className="text-sm text-muted-foreground">
        Provisions an active subscription for a user. The user can claim live + demo slots
        themselves once they sign in.
      </p>
      <AdminCreateSubscriptionForm rules={rules ?? []} />
    </div>
  );
}
