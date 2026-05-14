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
    if (value.includes(p)) onChange(value.filter((x) => x !== p));
    else onChange([...value, p]);
  }
  function selectAll() {
    onChange([]);
  }
  function clearAll() {
    onChange(options.map((o) => o.product));
    // Note: clearAll selects ALL options so the visible chip says "All";
    // semantic empty array would mean the same thing. Either is fine.
    // We use the explicit array to keep counts in the popover correct.
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
        <div className="mb-1 flex items-center justify-between gap-2 border-b pb-1">
          <button
            type="button"
            className="text-xs text-muted-foreground hover:text-foreground"
            onClick={selectAll}
          >
            Select all
          </button>
          <button
            type="button"
            className="text-xs text-muted-foreground hover:text-foreground"
            onClick={clearAll}
          >
            Clear
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
