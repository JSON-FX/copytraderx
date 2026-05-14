"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { SortKey } from "@/lib/dashboard-filters";

const LABELS: Record<SortKey, string> = {
  status: "Status",
  "expires-soonest": "Expires soonest",
  "recently-created": "Recently created",
};

export function DashboardFilterSortChip({
  value,
  onChange,
}: {
  value: SortKey;
  onChange: (v: SortKey) => void;
}) {
  const isNonDefault = value !== "status";
  return (
    <Select value={value} onValueChange={(v) => onChange(v as SortKey)}>
      <SelectTrigger
        size="sm"
        className="h-8 gap-1.5 border-border bg-background text-xs font-medium"
        aria-label="Sort"
      >
        {isNonDefault ? (
          <span
            className="inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-foreground"
            aria-hidden
          />
        ) : null}
        <span className="text-muted-foreground">Sort:</span>
        <SelectValue placeholder={LABELS.status}>{LABELS[value]}</SelectValue>
      </SelectTrigger>
      <SelectContent align="end">
        <SelectItem value="status">Status</SelectItem>
        <SelectItem value="expires-soonest">Expires soonest</SelectItem>
        <SelectItem value="recently-created">Recently created</SelectItem>
      </SelectContent>
    </Select>
  );
}
