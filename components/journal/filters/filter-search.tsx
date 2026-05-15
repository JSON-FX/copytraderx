"use client";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export function FilterSearch({ value, onChange, placeholder = "Search…", className }: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
}) {
  return (
    <Input
      type="search"
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.currentTarget.value)}
      className={cn("h-7 w-44 rounded-lg text-xs", className)}
    />
  );
}
