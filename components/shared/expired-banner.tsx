import { AlertTriangle } from "lucide-react";

export function ExpiredBanner({ count }: { count: number }) {
  return (
    <div className="mb-4 flex items-center gap-2 rounded-md border border-yellow-300/60 bg-yellow-50 p-3 text-yellow-900 dark:border-yellow-700/60 dark:bg-yellow-950/40 dark:text-yellow-200">
      <AlertTriangle className="h-4 w-4 shrink-0" />
      <p className="text-sm">
        You have {count} expired subscription{count === 1 ? "" : "s"}. Use the Renew button on the affected card to request a renewal.
      </p>
    </div>
  );
}
