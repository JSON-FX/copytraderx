"use client";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useRangeScope, type RangeDays } from "@/components/journal/preferences/journal-chrome-context";

const RANGES: { label: string; days: RangeDays }[] = [
  { label: "Last 7 days", days: 7 },
  { label: "Last 30 days", days: 30 },
  { label: "Last 90 days", days: 90 },
  { label: "All time", days: 0 },
];

export function DateRangeSelector() {
  const { range, setRange } = useRangeScope();

  return (
    <Select value={String(range)} onValueChange={(v) => setRange(Number(v) as RangeDays)}>
      <SelectTrigger className="h-8 w-[140px] text-xs">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {RANGES.map((r) => (
          <SelectItem key={r.days} value={String(r.days)} className="text-xs">
            {r.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
