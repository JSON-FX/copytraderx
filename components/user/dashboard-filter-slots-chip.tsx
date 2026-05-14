"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { SlotFilter } from "@/lib/dashboard-filters";

const LABELS: Record<SlotFilter, string> = {
  any: "any",
  "has-empty": "has empty",
  "all-filled": "all filled",
};

export function DashboardFilterSlotsChip({
  value,
  onChange,
}: {
  value: SlotFilter;
  onChange: (v: SlotFilter) => void;
}) {
  const isNonDefault = value !== "any";
  return (
    <Select value={value} onValueChange={(v) => onChange(v as SlotFilter)}>
      <SelectTrigger
        className="h-8 gap-1.5 border-border bg-background text-xs font-medium"
        size="sm"
        aria-label="Slots filter"
      >
        {isNonDefault ? (
          <span
            className="inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-foreground"
            aria-hidden
          />
        ) : null}
        <span className="text-muted-foreground">Slots:</span>
        <SelectValue placeholder={LABELS.any}>{LABELS[value]}</SelectValue>
      </SelectTrigger>
      <SelectContent align="end">
        <SelectItem value="any">Any</SelectItem>
        <SelectItem value="has-empty">Has empty slot</SelectItem>
        <SelectItem value="all-filled">All slots filled</SelectItem>
      </SelectContent>
    </Select>
  );
}
