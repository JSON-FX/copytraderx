import { Badge } from "@/components/ui/badge";
import { productDisplayName } from "@/lib/products";
import { formatExpiry } from "@/lib/expiry";
import type { DashboardSubscription } from "@/lib/types";
import { SlotCard } from "./slot-card";
import { CancelRequestButton } from "./cancel-request-button";
import { RenewDialog } from "./renew-dialog";
import { ExtendDialog } from "./extend-dialog";
import { ExtensionStatusLine } from "./extension-status-line";

export function SubscriptionCard({
  data,
  compact = false,
}: {
  data: DashboardSubscription;
  compact?: boolean;
}) {
  const sub = data.subscription;
  const productDisplay = productDisplayName(sub.product);
  const isPending = sub.status === "pending";
  const isActive = sub.status === "active";
  const canRenew = sub.status === "expired" || sub.status === "revoked";
  const hasPendingExtension = data.pendingExtension !== null;

  return (
    <div className={compact ? "space-y-3" : "rounded-lg border bg-card p-4"}>
      {compact ? (
        <div className="mb-3 flex justify-end">
          <Badge
            variant={isActive ? "default" : isPending ? "secondary" : "outline"}
            className="whitespace-nowrap"
          >
            {sub.status}
            {` · ${sub.tier}`}
            {sub.expires_at ? ` · expires ${formatExpiry(sub.expires_at)}` : ""}
          </Badge>
        </div>
      ) : (
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
      )}

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

      {isActive ? (
        <div className="mt-3 flex justify-end">
          <ExtendDialog
            sourceSubscriptionId={sub.id}
            productDisplay={productDisplay}
            sourceTier={sub.tier}
            disabled={hasPendingExtension}
          />
        </div>
      ) : null}

      {data.pendingExtension ? (
        <ExtensionStatusLine extension={data.pendingExtension} />
      ) : null}

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
