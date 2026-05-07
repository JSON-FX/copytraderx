import { productDisplayName } from "@/lib/products";
import type { DashboardProductGroup } from "@/lib/types";
import { SubscriptionCard } from "./subscription-card";

export function ProductGroupCard({ group }: { group: DashboardProductGroup }) {
  const display = productDisplayName(group.product);
  const subs = group.subscriptions;

  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="mb-4">
        <h3 className="text-base font-semibold">{display}</h3>
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
