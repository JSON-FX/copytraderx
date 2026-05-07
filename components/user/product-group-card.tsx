import { Badge } from "@/components/ui/badge";
import { productDisplayName } from "@/lib/products";
import type { DashboardProductGroup } from "@/lib/types";
import { SubscriptionCard } from "./subscription-card";

export function ProductGroupCard({ group }: { group: DashboardProductGroup }) {
  const display = productDisplayName(group.product);
  const subs = group.subscriptions;

  // Header summary: count + the most-active status across the group's subs.
  const activeCount = subs.filter((s) => s.subscription.status === "active").length;
  const pendingCount = subs.filter((s) => s.subscription.status === "pending").length;
  const headlineStatus =
    activeCount > 0
      ? "active"
      : pendingCount > 0
        ? "pending"
        : (subs[0]?.subscription.status ?? "expired");

  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="mb-4 flex items-start justify-between">
        <div>
          <h3 className="text-base font-semibold">{display}</h3>
          <p className="text-sm text-muted-foreground">
            {subs.length === 1 ? "1 subscription" : `${subs.length} subscriptions`}
          </p>
        </div>
        <Badge
          variant={
            activeCount > 0 ? "default" : pendingCount > 0 ? "secondary" : "outline"
          }
        >
          {headlineStatus}
        </Badge>
      </div>

      <div className="space-y-4 divide-y">
        {subs.map((s, i) => (
          <div key={s.subscription.id} className={i === 0 ? "" : "pt-4"}>
            <SubscriptionCard data={s} compact />
          </div>
        ))}
      </div>
    </div>
  );
}
