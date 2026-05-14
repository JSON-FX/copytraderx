import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { productDisplayName } from "@/lib/products";
import { formatExpiry } from "@/lib/expiry";
import { SubscriptionCardSlots } from "./subscription-card-slots";
import { ExtensionStatusLine } from "./extension-status-line";
import { RenewDialog } from "./renew-dialog";
import { ExtendDialog } from "./extend-dialog";
import { CancelRequestButton } from "./cancel-request-button";
import type { DashboardSubscription } from "@/lib/types";

type Mode = "current" | "past";

type HeaderStatus =
  | "active"
  | "no-slots"
  | "pending"
  | "rejected"
  | "expired"
  | "revoked";

function deriveHeaderStatus(item: DashboardSubscription): HeaderStatus {
  const sub = item.subscription;
  if (sub.status === "active") {
    return item.liveLicense || item.demoLicense ? "active" : "no-slots";
  }
  return sub.status;
}

function headerStatusLabel(s: HeaderStatus): string {
  switch (s) {
    case "active":
      return "Active";
    case "no-slots":
      return "No slots claimed";
    case "pending":
      return "Pending";
    case "rejected":
      return "Rejected";
    case "expired":
      return "Expired";
    case "revoked":
      return "Revoked";
  }
}

function headerStatusVariant(s: HeaderStatus):
  | "default"
  | "secondary"
  | "outline"
  | "destructive" {
  if (s === "active") return "default";
  if (s === "pending") return "secondary";
  if (s === "rejected") return "destructive";
  return "outline";
}

function headerDateLine(item: DashboardSubscription): string {
  const sub = item.subscription;
  const tier = sub.tier; // monthly | quarterly | yearly
  switch (sub.status) {
    case "active":
      return `${tier} · expires ${formatExpiry(sub.expires_at)}`;
    case "pending":
      return `${tier} · requested ${formatExpiry(sub.requested_at)}`;
    case "expired":
      return `${tier} · expired ${formatExpiry(sub.expires_at)}`;
    case "revoked":
      return `${tier} · expired ${formatExpiry(sub.expires_at)}`;
    case "rejected":
      return `${tier} · requested ${formatExpiry(sub.requested_at)}`;
  }
}

export function SubscriptionCard({
  item,
  mode,
}: {
  item: DashboardSubscription;
  mode: Mode;
}) {
  const sub = item.subscription;
  const headerStatus = deriveHeaderStatus(item);
  const productDisplay = productDisplayName(sub.product);
  const showSlots =
    sub.status === "active" ||
    sub.status === "revoked" ||
    sub.status === "expired";

  return (
    <Card
      size="sm"
      className={mode === "past" ? "bg-muted/30" : undefined}
      data-status={sub.status}
    >
      <CardHeader className="border-b pb-3">
        <CardTitle>{productDisplay}</CardTitle>
        <CardDescription className="capitalize">
          {headerDateLine(item)}
        </CardDescription>
        <CardAction>
          <Badge variant={headerStatusVariant(headerStatus)}>
            {headerStatusLabel(headerStatus)}
          </Badge>
        </CardAction>
      </CardHeader>

      {showSlots ? (
        <SubscriptionCardSlots item={item} />
      ) : sub.status === "pending" ? (
        <CardContent className="text-xs/relaxed text-muted-foreground">
          Waiting for admin approval. You&apos;ll be able to claim a slot once
          it&apos;s approved.
        </CardContent>
      ) : sub.status === "rejected" ? (
        <CardContent>
          <div className="rounded-none border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {sub.rejection_reason
              ? `Rejected: ${sub.rejection_reason}`
              : "Request rejected."}
          </div>
        </CardContent>
      ) : null}

      {item.pendingExtension ? (
        <div className="px-4">
          <ExtensionStatusLine extension={item.pendingExtension} />
        </div>
      ) : null}

      <CardFooter className="justify-end gap-2 bg-muted/30">
        {sub.status === "active" ? (
          <ExtendDialog
            sourceSubscriptionId={sub.id}
            productDisplay={productDisplay}
            sourceTier={sub.tier}
            disabled={item.pendingExtension !== null}
          />
        ) : null}
        {sub.status === "pending" ? (
          <CancelRequestButton subscriptionId={sub.id} />
        ) : null}
        {sub.status === "expired" || sub.status === "revoked" ? (
          <RenewDialog
            sourceSubscriptionId={sub.id}
            productDisplay={productDisplay}
            sourceTier={sub.tier}
          />
        ) : null}
        {sub.status === "rejected" ? (
          <span className="text-xs text-muted-foreground">—</span>
        ) : null}
      </CardFooter>
    </Card>
  );
}
