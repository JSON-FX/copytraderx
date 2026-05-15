"use client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface Props {
  total: number;
  page: number;             // 1-based
  pageSize: number;
  pageSizeOptions?: number[];
  onPageChange: (p: number) => void;
  onPageSizeChange: (n: number) => void;
}

export function Pagination({
  total, page, pageSize, pageSizeOptions = [10, 25, 50, 100], onPageChange, onPageSizeChange,
}: Props) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const startIdx = total === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const endIdx = Math.min(total, safePage * pageSize);

  const windowSize = 5;
  const half = Math.floor(windowSize / 2);
  let first = Math.max(1, safePage - half);
  let last = Math.min(totalPages, first + windowSize - 1);
  first = Math.max(1, last - windowSize + 1);
  const pages: number[] = [];
  for (let p = first; p <= last; p++) pages.push(p);

  return (
    <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
      <label className="flex items-center gap-2">
        <span>Show</span>
        <select
          className="rounded border bg-background px-2 py-1 text-xs"
          value={pageSize}
          onChange={(e) => onPageSizeChange(Number(e.currentTarget.value))}
        >
          {pageSizeOptions.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
        <span>per page</span>
      </label>

      <span className="tabular-nums">Showing {startIdx}–{endIdx} of {total}</span>

      <div className="flex items-center gap-1">
        <Button variant="outline" size="sm" className="h-7 px-2 text-xs"
          disabled={safePage <= 1} onClick={() => onPageChange(safePage - 1)}>
          ‹ Prev
        </Button>
        {pages.map((p) => (
          <Button
            key={p}
            size="sm"
            className={cn("h-7 min-w-7 px-2 text-xs", p === safePage && "bg-foreground text-background hover:bg-foreground/90 hover:text-background")}
            variant={p === safePage ? "default" : "outline"}
            aria-current={p === safePage ? "page" : undefined}
            onClick={() => onPageChange(p)}
          >
            {p}
          </Button>
        ))}
        <Button variant="outline" size="sm" className="h-7 px-2 text-xs"
          disabled={safePage >= totalPages} onClick={() => onPageChange(safePage + 1)}>
          Next ›
        </Button>
      </div>
    </div>
  );
}
