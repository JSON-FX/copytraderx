"use client";

import { format, parseISO } from "date-fns";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { usePnlDisplay, useRangeScope, type RangeDays } from "./preferences/journal-chrome-context";

const RANGES: { label: string; value: RangeDays }[] = [
  { label: "7d", value: 7 },
  { label: "30d", value: 30 },
  { label: "90d", value: 90 },
  { label: "All", value: 0 },
];

export function JournalToolbar({ pushedAt }: { pushedAt: string | null }) {
  const { mode, setMode, source } = usePnlDisplay();
  const { range, setRange } = useRangeScope();

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-muted/30 px-3 py-2">
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <span className="font-medium">Display:</span>
        <Segment>
          <SegmentButton on={mode === "percent"} onClick={() => setMode("percent")}>%</SegmentButton>
          <SegmentButton on={mode === "dollar"} onClick={() => setMode("dollar")}>$</SegmentButton>
        </Segment>
        {source === "override" && <span className="text-[10px] uppercase tracking-wider text-amber-600 dark:text-amber-400">overridden</span>}
        <Divider />
        <span className="font-medium">Range:</span>
        <Segment>
          {RANGES.map((r) => (
            <SegmentButton key={r.value} on={range === r.value} onClick={() => setRange(r.value)}>
              {r.label}
            </SegmentButton>
          ))}
        </Segment>
      </div>
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span className="inline-flex size-1.5 rounded-full bg-emerald-500 ring-2 ring-emerald-500/20" />
        Live · {pushedAt ? format(parseISO(pushedAt), "HH:mm:ss") : "—"}
      </div>
    </div>
  );
}

function Segment({ children }: { children: React.ReactNode }) {
  return <div className="inline-flex rounded-md border bg-background p-0.5">{children}</div>;
}

function SegmentButton({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      onClick={onClick}
      className={cn(
        "h-6 px-2.5 text-[11px] font-medium",
        on && "bg-foreground text-background hover:bg-foreground/90 hover:text-background"
      )}
    >
      {children}
    </Button>
  );
}

function Divider() {
  return <span aria-hidden className="mx-1 h-4 w-px bg-border" />;
}
