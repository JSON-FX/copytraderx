import { redirect } from "next/navigation";
import { getSupabaseSSR } from "@/lib/supabase/ssr";
import { getDashboardData } from "@/lib/dashboard-data";
import { SubscriptionManagementTable } from "@/components/settings/subscription-management-table";

export const dynamic = "force-dynamic";

export default async function SubscriptionsPage() {
  const sb = await getSupabaseSSR();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect("/login");

  const items = await getDashboardData(user.id);

  return <SubscriptionManagementTable items={items} />;
}
