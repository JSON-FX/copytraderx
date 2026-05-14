import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import type { License } from "@/lib/types";
import { ClaimSlotDialog } from "./claim-slot-dialog";

export function SlotCard({
  subscriptionId,
  intendedType,
  productDisplay,
  license,
  canClaim,
}: {
  subscriptionId: number;
  intendedType: "live" | "demo";
  productDisplay: string;
  license: License | null;
  canClaim: boolean;
}) {
  return (
    <div className="rounded-md border p-3">
      <div className="mb-1 flex items-center justify-between">
        <span className="text-xs font-semibold uppercase text-muted-foreground">
          {intendedType}
        </span>
        {license ? (
          <Badge variant={license.status === "active" ? "default" : "secondary"}>
            {license.status}
          </Badge>
        ) : (
          <Badge variant="outline">empty</Badge>
        )}
      </div>
      {license ? (
        <div className="flex items-center justify-between">
          <div>
            <div className="font-mono text-sm">{license.mt5_account}</div>
            <div className="text-xs text-muted-foreground">{license.license_key}</div>
          </div>
          <Link
            href={`/dashboard/licenses/${license.id}`}
            className="text-sm underline"
          >
            Open journal
          </Link>
        </div>
      ) : canClaim ? (
        <ClaimSlotDialog
          subscriptionId={subscriptionId}
          intendedType={intendedType}
          productDisplay={productDisplay}
        />
      ) : (
        <p className="text-xs text-muted-foreground">Unavailable until subscription is active.</p>
      )}
    </div>
  );
}
