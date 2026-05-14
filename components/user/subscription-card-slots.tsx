import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LicenseKeyCell } from "./license-key-cell";
import { ClaimSlotDialog } from "./claim-slot-dialog";
import { productDisplayName } from "@/lib/products";
import type {
  DashboardSubscription,
  License,
  SubscriptionStatus,
} from "@/lib/types";

type SlotType = "live" | "demo";

interface SlotRowProps {
  subStatus: SubscriptionStatus;
  subscriptionId: number;
  product: DashboardSubscription["subscription"]["product"];
  slotType: SlotType;
  license: License | null;
}

function slotPrimaryAction({
  subStatus,
  subscriptionId,
  product,
  slotType,
  license,
}: SlotRowProps) {
  // Filled, active slot on an active sub → primary "Open journal".
  if (
    license &&
    license.status === "active" &&
    subStatus === "active"
  ) {
    return (
      <Button asChild size="sm" variant="default">
        <Link href={`/dashboard/licenses/${license.id}`}>Open journal</Link>
      </Button>
    );
  }
  // Filled slot on an active sub but license is revoked/expired:
  // history-only, outline button.
  if (license && subStatus === "active") {
    return (
      <Button asChild size="sm" variant="outline">
        <Link href={`/dashboard/licenses/${license.id}`}>Open journal</Link>
      </Button>
    );
  }
  // Filled slot on a revoked/expired sub → outline, history-only.
  if (
    license &&
    (subStatus === "revoked" || subStatus === "expired")
  ) {
    return (
      <Button asChild size="sm" variant="outline">
        <Link href={`/dashboard/licenses/${license.id}`}>Open journal</Link>
      </Button>
    );
  }
  // Empty slot, sub still active → Claim.
  if (!license && subStatus === "active") {
    return (
      <ClaimSlotDialog
        subscriptionId={subscriptionId}
        intendedType={slotType}
        productDisplay={productDisplayName(product)}
      />
    );
  }
  // Empty slot on terminal sub → nothing.
  return <span className="text-muted-foreground text-xs">—</span>;
}

function SlotRow(props: SlotRowProps) {
  const { license, slotType, subStatus } = props;
  const isLicenseDegradedOnActiveSub =
    license &&
    subStatus === "active" &&
    license.status !== "active";

  return (
    <div className="border-t border-border/60 px-4 py-2.5 text-sm first:border-t-0">
      <div className="grid grid-cols-[3rem_minmax(0,7rem)_minmax(0,1fr)_auto] items-center gap-3">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          {slotType}
        </span>
        {license ? (
          <span className="truncate font-mono text-sm">{license.mt5_account}</span>
        ) : (
          <span className="text-xs italic text-muted-foreground">— empty —</span>
        )}
        {license ? (
          <LicenseKeyCell licenseKey={license.license_key} />
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
        <div className="justify-self-end">{slotPrimaryAction(props)}</div>
      </div>
      {isLicenseDegradedOnActiveSub ? (
        <p className="ml-12 mt-1 flex items-center gap-1 text-xs text-destructive">
          <AlertTriangle className="h-3 w-3" aria-hidden />
          License {license.status} — contact admin if unexpected
        </p>
      ) : null}
    </div>
  );
}

export function SubscriptionCardSlots({
  item,
}: {
  item: DashboardSubscription;
}) {
  const sub = item.subscription;
  return (
    <div>
      <SlotRow
        subStatus={sub.status}
        subscriptionId={sub.id}
        product={sub.product}
        slotType="live"
        license={item.liveLicense}
      />
      <SlotRow
        subStatus={sub.status}
        subscriptionId={sub.id}
        product={sub.product}
        slotType="demo"
        license={item.demoLicense}
      />
    </div>
  );
}
