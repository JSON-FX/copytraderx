import { redirect } from "next/navigation";
import { getSupabaseSSR } from "@/lib/supabase/ssr";
import { getDashboardData, groupByProduct } from "@/lib/dashboard-data";
import { ProductGroupCard } from "@/components/user/product-group-card";
import { RequestLicenseDialog } from "@/components/user/request-license-dialog";
import { ExpiredBanner } from "@/components/shared/expired-banner";

export default async function DashboardPage() {
  const sb = await getSupabaseSSR();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) redirect("/login");

  const items = await getDashboardData(user.id);
  const groups = groupByProduct(items);
  const expiredCount = items.filter(
    (i) =>
      (i.subscription.status === "expired" || i.subscription.status === "revoked") &&
      // exclude when user already has a pending renewal — Plan 4 doesn't track
      // the link explicitly, so we only suppress when ANY pending exists. Good
      // enough heuristic; refined in Plan 5 once approve/reject lands.
      !items.some((j) => j.subscription.status === "pending"),
  ).length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">My subscriptions</h1>
        <RequestLicenseDialog />
      </div>

      {expiredCount > 0 ? <ExpiredBanner count={expiredCount} /> : null}

      {groups.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center">
          <p className="text-sm text-muted-foreground">
            You don&apos;t have any subscriptions yet. Click &quot;Request New License&quot; to get started, or contact your admin.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
          {groups.map((g) => (
            <ProductGroupCard key={g.product} group={g} />
          ))}
        </div>
      )}
    </div>
  );
}
