"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface Props {
  page: number;
  totalPages: number;
  onChange: (p: number) => void;
  pageSize?: number;
  pageSizeOptions?: readonly number[];
  onPageSizeChange?: (size: number) => void;
}

export function DashboardPagination({
  page,
  totalPages,
  onChange,
  pageSize,
  pageSizeOptions,
  onPageSizeChange,
}: Props) {
  const showSelector =
    pageSize !== undefined &&
    pageSizeOptions !== undefined &&
    onPageSizeChange !== undefined;

  if (totalPages <= 1 && !showSelector) return null;

  return (
    <div className="flex items-center justify-center gap-3 pt-2 text-sm text-muted-foreground">
      {showSelector && (
        <div className="mr-auto flex items-center gap-2">
          <span>Show</span>
          <Select
            value={String(pageSize)}
            onValueChange={(v) => onPageSizeChange(Number(v))}
          >
            <SelectTrigger className="h-8 w-[80px]" aria-label="Rows per page">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {pageSizeOptions.map((opt) => (
                <SelectItem key={opt} value={String(opt)}>
                  {opt}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span>per page</span>
        </div>
      )}
      <Button
        type="button"
        size="sm"
        variant="ghost"
        className="h-8 gap-1"
        onClick={() => onChange(page - 1)}
        disabled={page <= 1}
        aria-label="Previous page"
      >
        <ChevronLeft className="h-4 w-4" aria-hidden />
        Prev
      </Button>
      <span>
        Page <span className="font-medium text-foreground">{page}</span> of{" "}
        {totalPages}
      </span>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        className="h-8 gap-1"
        onClick={() => onChange(page + 1)}
        disabled={page >= totalPages}
        aria-label="Next page"
      >
        Next
        <ChevronRight className="h-4 w-4" aria-hidden />
      </Button>
    </div>
  );
}
