"use client";

import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { productDisplayName } from "@/lib/products";
import type { Product } from "@/lib/products";

export interface ProductOption {
  product: Product;
  count: number;
}

function summary(
  value: Product[],
  options: ProductOption[],
): string {
  if (value.length === 0) return "All";
  if (value.length === 1) return productDisplayName(value[0]);
  if (value.length === options.length) return "All";
  return `${value.length} products`;
}

export function DashboardFilterProductChip({
  value,
  onChange,
  options,
}: {
  value: Product[];
  onChange: (v: Product[]) => void;
  options: ProductOption[];
}) {
  // value === [] semantically means "all"; chip is non-default when the user
  // has narrowed to a strict subset of the available products.
  const nonDefault = value.length > 0 && value.length < options.length;
  function toggle(p: Product) {
    // Normalize empty (= "all") into the explicit full list before mutating,
    // so unchecking from "all" yields "all except p" rather than "only p".
    const normalized =
      value.length === 0 ? options.map((o) => o.product) : value;
    const next = normalized.includes(p)
      ? normalized.filter((x) => x !== p)
      : [...normalized, p];
    // Collapse "every option selected" back to the canonical empty array
    // so isDefault() agrees with the visible "All" label and the toolbar's
    // "Clear all" link doesn't appear for an effectively-default state.
    onChange(next.length === options.length ? [] : next);
  }
  function selectAll() {
    onChange([]);
  }
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          size="sm"
          variant="outline"
          className="h-8 gap-1.5 text-xs font-medium"
          aria-label="Product filter"
        >
          {nonDefault ? (
            <span
              className="inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-foreground"
              aria-hidden
            />
          ) : null}
          <span className="text-muted-foreground">Product:</span>
          <span>{summary(value, options)}</span>
          <ChevronDown className="h-3 w-3 opacity-60" aria-hidden />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 p-2">
        <div className="mb-1 border-b pb-1">
          <button
            type="button"
            className="text-xs text-muted-foreground hover:text-foreground"
            onClick={selectAll}
          >
            Select all
          </button>
        </div>
        <div className="flex flex-col gap-1">
          {options.map((opt) => {
            const checked = value.length === 0 || value.includes(opt.product);
            return (
              <label
                key={opt.product}
                className="flex cursor-pointer items-center justify-between gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-muted"
              >
                <span className="flex items-center gap-2">
                  <Checkbox
                    checked={checked}
                    onCheckedChange={() => toggle(opt.product)}
                  />
                  <span>{productDisplayName(opt.product)}</span>
                </span>
                <span className="text-xs text-muted-foreground">
                  ({opt.count})
                </span>
              </label>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
