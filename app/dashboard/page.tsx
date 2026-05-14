import { redirect } from "next/navigation";
import { getSupabaseSSR } from "@/lib/supabase/ssr";
import { getDashboardData } from "@/lib/dashboard-data";
import { DashboardCardGrid } from "@/components/user/dashboard-card-grid";
import { RequestLicenseDialog } from "@/components/user/request-license-dialog";

export default async function DashboardPage() {
  const sb = await getSupabaseSSR();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) redirect("/login");

  const items = await getDashboardData(user.id);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">My subscriptions</h1>
        <RequestLicenseDialog />
      </div>

      {items.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center">
          <p className="text-sm text-muted-foreground">
            You don&apos;t have any subscriptions yet. Click &quot;Request New License&quot; to get started, or contact your admin.
          </p>
        </div>
      ) : (
        <DashboardCardGrid items={items} />
      )}
    </div>
  );
}
