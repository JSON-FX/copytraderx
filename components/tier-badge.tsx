import { Badge } from "@/components/ui/badge";
import type { LicenseTier } from "@/lib/types";

const LABELS: Record<LicenseTier, string> = {
  monthly: "Monthly",
  quarterly: "Quarterly",
  yearly: "Yearly",
  lifetime: "Lifetime",
};

export function TierBadge({ tier }: { tier: LicenseTier | null }) {
  if (tier === null) {
    return (
      <Badge
        variant="outline"
        className="rounded-full text-muted-foreground"
      >
        &mdash;
      </Badge>
    );
  }
  return (
    <Badge variant="secondary" className="rounded-full">
      {LABELS[tier]}
    </Badge>
  );
}
