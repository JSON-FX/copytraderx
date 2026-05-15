"use client";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface Option { value: string; label: string }

interface BaseProps {
  label: string;
  active?: boolean;
  className?: string;
}

export function ToggleChip({ label, active, count, onClick }: BaseProps & {
  count?: number; onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs transition-colors",
        active
          ? "border-foreground bg-foreground text-background"
          : "border-border bg-background text-muted-foreground hover:text-foreground"
      )}
    >
      {label}
      {typeof count === "number" && (
        <span className={cn(
          "rounded px-1.5 text-[10px] font-bold",
          active ? "bg-background text-foreground" : "bg-muted text-muted-foreground"
        )}>{count}</span>
      )}
    </button>
  );
}

export function SelectChip({ label, value, options, onChange, className }: BaseProps & {
  value: string | null;
  options: Option[];
  onChange: (v: string | null) => void;
}) {
  const current = options.find((o) => o.value === value) ?? null;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-3 py-1 text-xs text-muted-foreground hover:text-foreground",
            current && "text-foreground",
            className
          )}
        >
          <span>{label}: {current?.label ?? "All"}</span>
          <span aria-hidden>▾</span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-48 p-1">
        <Button variant="ghost" size="sm" className="w-full justify-start text-xs" onClick={() => onChange(null)}>
          Clear
        </Button>
        {options.map((o) => (
          <Button
            key={o.value}
            variant="ghost"
            size="sm"
            className={cn(
              "w-full justify-start text-xs",
              value === o.value && "bg-muted"
            )}
            onClick={() => onChange(o.value)}
          >
            {o.label}
          </Button>
        ))}
      </PopoverContent>
    </Popover>
  );
}
