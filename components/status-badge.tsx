import { Badge } from "@/components/ui/badge";
import type { DisplayStatus } from "@/lib/types";

const STYLES: Record<DisplayStatus, string> = {
  active:
    "rounded-full border-green-200 bg-green-50 text-green-700 dark:border-green-900 dark:bg-green-950 dark:text-green-300",
  revoked:
    "rounded-full border-gray-200 bg-gray-50 text-gray-700 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-300",
  expired:
    "rounded-full border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300",
};

const LABELS: Record<DisplayStatus, string> = {
  active: "Active",
  revoked: "Revoked",
  expired: "Expired",
};

export function StatusBadge({ status }: { status: DisplayStatus }) {
  return (
    <Badge variant="outline" className={STYLES[status]}>
      {LABELS[status]}
    </Badge>
  );
}
