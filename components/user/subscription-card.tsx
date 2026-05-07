import { Badge } from "@/components/ui/badge";
import { productDisplayName } from "@/lib/products";
import { formatExpiry } from "@/lib/expiry";
import type { DashboardSubscription } from "@/lib/types";
import { SlotCard } from "./slot-card";
import { CancelRequestButton } from "./cancel-request-button";
import { RenewDialog } from "./renew-dialog";

export function SubscriptionCard({ data }: { data: DashboardSubscription }) {
  const sub = data.subscription;
  const productDisplay = productDisplayName(sub.product);
  const isPending = sub.status === "pending";
  const isActive = sub.status === "active";
  const canRenew = sub.status === "expired" || sub.status === "revoked";

  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="mb-3 flex items-start justify-between">
        <div>
          <h3 className="text-base font-semibold">{productDisplay}</h3>
          <p className="text-sm text-muted-foreground">
            {sub.tier}
            {sub.expires_at ? ` — expires ${formatExpiry(sub.expires_at)}` : ""}
          </p>
        </div>
        <Badge variant={isActive ? "default" : isPending ? "secondary" : "outline"}>
          {sub.status}
        </Badge>
      </div>

      {isPending ? (
        <div className="flex items-center justify-between rounded-md border-dashed border p-3">
          <p className="text-sm text-muted-foreground">
            Awaiting admin approval.
            {sub.notes ? ` Note: ${sub.notes}` : ""}
          </p>
          <CancelRequestButton subscriptionId={sub.id} />
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <SlotCard
            subscriptionId={sub.id}
            intendedType="live"
            productDisplay={productDisplay}
            license={data.liveLicense}
            canClaim={isActive}
          />
          <SlotCard
            subscriptionId={sub.id}
            intendedType="demo"
            productDisplay={productDisplay}
            license={data.demoLicense}
            canClaim={isActive}
          />
        </div>
      )}

      {canRenew ? (
        <div className="mt-3 flex justify-end">
          <RenewDialog
            sourceSubscriptionId={sub.id}
            productDisplay={productDisplay}
            sourceTier={sub.tier}
          />
        </div>
      ) : null}

      {sub.status === "rejected" && sub.rejection_reason ? (
        <p className="mt-3 text-sm text-destructive">Rejected: {sub.rejection_reason}</p>
      ) : null}
    </div>
  );
}
