"use client";

import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

export function ExpiredBanner({
  count,
  onOpenPast,
}: {
  count: number;
  onOpenPast?: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-md border border-yellow-300/60 bg-yellow-50 p-3 text-yellow-900 dark:border-yellow-700/60 dark:bg-yellow-950/40 dark:text-yellow-200">
      <div className="flex items-center gap-2">
        <AlertTriangle className="h-4 w-4 shrink-0" />
        <p className="text-sm">
          {count} past subscription{count === 1 ? "" : "s"} available to renew.
        </p>
      </div>
      {onOpenPast ? (
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={onOpenPast}
        >
          View past subscriptions
        </Button>
      ) : null}
    </div>
  );
}
