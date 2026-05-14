import Link from "next/link";
import { AdminSiteNav } from "@/components/admin/admin-site-nav";
import { Button } from "@/components/ui/button";
import { SubscriptionTable } from "@/components/admin/subscription-table";
import { fetchAdminSubscriptions } from "@/lib/admin-subscriptions-server";

export const dynamic = "force-dynamic";

export default async function AdminSubscriptionsPage() {
  const rows = await fetchAdminSubscriptions();
  const userCount = new Set(rows.map((r) => r.user_id)).size;

  return (
    <div className="min-h-screen">
      <AdminSiteNav />
      <main className="mx-auto max-w-6xl px-6 py-8">
        <div className="mb-6 flex items-end justify-between">
          <div>
            <h1 className="text-2xl font-semibold">Subscriptions</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {rows.length} {rows.length === 1 ? "subscription" : "subscriptions"} · {userCount}{" "}
              {userCount === 1 ? "user" : "users"}
            </p>
          </div>
          <Button asChild>
            <Link href="/admin/subscriptions/new">+ Create subscription</Link>
          </Button>
        </div>
        <SubscriptionTable rows={rows} />
      </main>
    </div>
  );
}
