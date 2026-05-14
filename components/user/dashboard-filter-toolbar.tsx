"use client";

import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DEFAULT_FILTERS,
  isDefault,
  type FilterState,
} from "@/lib/dashboard-filters";
import {
  DashboardFilterProductChip,
  type ProductOption,
} from "./dashboard-filter-product-chip";
import { DashboardFilterStatusChip } from "./dashboard-filter-status-chip";
import { DashboardFilterSlotsChip } from "./dashboard-filter-slots-chip";
import { DashboardFilterSortChip } from "./dashboard-filter-sort-chip";

export function DashboardFilterToolbar({
  state,
  onChange,
  products,
}: {
  state: FilterState;
  onChange: (s: FilterState) => void;
  products: ProductOption[];
}) {
  const nonDefault = !isDefault(state);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <DashboardFilterProductChip
        value={state.products}
        onChange={(products) => onChange({ ...state, products })}
        options={products}
      />
      <DashboardFilterStatusChip
        value={state.statuses}
        onChange={(statuses) => onChange({ ...state, statuses })}
      />
      <DashboardFilterSlotsChip
        value={state.slots}
        onChange={(slots) => onChange({ ...state, slots })}
      />
      <div className="hidden flex-1 sm:block" />
      <DashboardFilterSortChip
        value={state.sort}
        onChange={(sort) => onChange({ ...state, sort })}
      />
      {nonDefault ? (
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-8 gap-1 text-xs text-muted-foreground"
          onClick={() => onChange(DEFAULT_FILTERS)}
        >
          <X className="h-3 w-3" aria-hidden />
          Clear all
        </Button>
      ) : null}
    </div>
  );
}
