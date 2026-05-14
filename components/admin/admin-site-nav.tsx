import { getSupabaseAdmin } from "@/lib/supabase/server";
import { SiteNav } from "@/components/site-nav";

export async function AdminSiteNav() {
  const sb = getSupabaseAdmin();
  const { count } = await sb
    .from("subscriptions")
    .select("id", { count: "exact", head: true })
    .eq("status", "pending");

  return <SiteNav pendingRequestsCount={count ?? 0} />;
}
