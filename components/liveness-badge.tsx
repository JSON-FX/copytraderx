import { Badge } from "@/components/ui/badge";
import type { LivenessState } from "@/lib/types";

const STYLES: Record<LivenessState, string> = {
  online:
    "rounded-full border-green-200 bg-green-50 text-green-700 dark:border-green-900 dark:bg-green-950 dark:text-green-300",
  stale:
    "rounded-full border-yellow-200 bg-yellow-50 text-yellow-700 dark:border-yellow-900 dark:bg-yellow-950 dark:text-yellow-300",
  offline:
    "rounded-full border-gray-200 bg-gray-50 text-gray-700 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-300",
  not_activated:
    "rounded-full border-gray-200 bg-gray-50 text-gray-600 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-400",
  expired:
    "rounded-full border-orange-200 bg-orange-50 text-orange-700 dark:border-orange-900 dark:bg-orange-950 dark:text-orange-300",
  revoked:
    "rounded-full border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300",
};

const LABELS: Record<LivenessState, string> = {
  online: "Online",
  stale: "Stale",
  offline: "Offline",
  not_activated: "Not activated",
  expired: "Expired",
  revoked: "Revoked",
};

export function LivenessBadge({ state }: { state: LivenessState }) {
  return (
    <Badge variant="outline" className={STYLES[state]}>
      {LABELS[state]}
    </Badge>
  );
}
