"use client";

import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import type { StatusGroup } from "@/lib/dashboard-filters";
import { DEFAULT_FILTERS } from "@/lib/dashboard-filters";

const ORDER: StatusGroup[] = ["active", "pending", "past"];
const LABEL: Record<StatusGroup, string> = {
  active: "Active",
  pending: "Pending",
  past: "Past (revoked / expired / rejected)",
};

function isDefaultStatus(value: StatusGroup[]): boolean {
  if (value.length !== DEFAULT_FILTERS.statuses.length) return false;
  for (const s of DEFAULT_FILTERS.statuses) {
    if (!value.includes(s)) return false;
  }
  return true;
}

function summary(value: StatusGroup[]): string {
  if (value.length === 0) return "none";
  if (value.length === ORDER.length) return "All";
  if (value.length === 1) return LABEL[value[0]].split(" ")[0];
  return `${value.length} selected`;
}

export function DashboardFilterStatusChip({
  value,
  onChange,
}: {
  value: StatusGroup[];
  onChange: (v: StatusGroup[]) => void;
}) {
  const nonDefault = !isDefaultStatus(value);
  function toggle(s: StatusGroup) {
    if (value.includes(s)) onChange(value.filter((x) => x !== s));
    else onChange([...value, s]);
  }
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          size="sm"
          variant="outline"
          className="h-8 gap-1.5 text-xs font-medium"
          aria-label="Status filter"
        >
          {nonDefault ? (
            <span
              className="inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-foreground"
              aria-hidden
            />
          ) : null}
          <span className="text-muted-foreground">Status:</span>
          <span>{summary(value)}</span>
          <ChevronDown className="h-3 w-3 opacity-60" aria-hidden />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-56 p-2">
        <div className="flex flex-col gap-1">
          {ORDER.map((s) => (
            <label
              key={s}
              className="flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-muted"
            >
              <Checkbox
                checked={value.includes(s)}
                onCheckedChange={() => toggle(s)}
              />
              <span>{LABEL[s]}</span>
            </label>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
