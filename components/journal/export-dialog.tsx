"use client";

import { useMemo, useState } from "react";
import { DownloadSimpleIcon } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { ExportFormat, ExportKind } from "@/lib/journal/export";

type Preset = "today" | "week" | "month" | "7d" | "30d" | "all" | "custom";

const PRESET_LABELS: Record<Preset, string> = {
  today: "Today",
  week: "This Week",
  month: "This Month",
  "7d": "Last 7d",
  "30d": "Last 30d",
  all: "All time",
  custom: "Custom",
};
const PRESET_ORDER: Preset[] = ["today", "week", "month", "7d", "30d", "all", "custom"];

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}
function endOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}
function startOfWeek(d: Date): Date {
  const x = startOfDay(d);
  // Monday-based week. JS getDay: 0 = Sun.
  const day = x.getDay();
  const diff = (day + 6) % 7;
  x.setDate(x.getDate() - diff);
  return x;
}
function startOfMonth(d: Date): Date {
  const x = startOfDay(d);
  x.setDate(1);
  return x;
}
function isoOrNull(d: Date | null): string | null {
  return d ? d.toISOString() : null;
}

function resolvePreset(preset: Preset, customFrom: string, customTo: string): { from: string | null; to: string | null } {
  const now = new Date();
  switch (preset) {
    case "today":
      return { from: isoOrNull(startOfDay(now)), to: isoOrNull(endOfDay(now)) };
    case "week":
      return { from: isoOrNull(startOfWeek(now)), to: isoOrNull(endOfDay(now)) };
    case "month":
      return { from: isoOrNull(startOfMonth(now)), to: isoOrNull(endOfDay(now)) };
    case "7d": {
      const f = new Date(now);
      f.setDate(f.getDate() - 7);
      return { from: isoOrNull(startOfDay(f)), to: isoOrNull(endOfDay(now)) };
    }
    case "30d": {
      const f = new Date(now);
      f.setDate(f.getDate() - 30);
      return { from: isoOrNull(startOfDay(f)), to: isoOrNull(endOfDay(now)) };
    }
    case "all":
      return { from: null, to: null };
    case "custom": {
      const f = customFrom ? new Date(`${customFrom}T00:00:00`) : null;
      const t = customTo ? new Date(`${customTo}T23:59:59.999`) : null;
      return { from: f ? f.toISOString() : null, to: t ? t.toISOString() : null };
    }
  }
}

export interface ExportDialogProps {
  kind: ExportKind;
  mt5Account: number;
}

export function ExportDialog({ kind, mt5Account }: ExportDialogProps) {
  const [open, setOpen] = useState(false);
  const [preset, setPreset] = useState<Preset>("30d");
  const [format, setFormat] = useState<ExportFormat>("csv");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");

  const { from, to, invalidRange } = useMemo(() => {
    const r = resolvePreset(preset, customFrom, customTo);
    let bad = false;
    if (preset === "custom" && r.from && r.to && new Date(r.from) > new Date(r.to)) {
      bad = true;
    }
    return { ...r, invalidRange: bad };
  }, [preset, customFrom, customTo]);

  const title = kind === "trades" ? "Export Trades" : "Export Orders";

  function onExport() {
    const params = new URLSearchParams();
    params.set("kind", kind);
    params.set("format", format);
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    const url = `/api/journal/${mt5Account}/export?${params.toString()}`;
    window.location.assign(url);
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="rounded-lg">
          <DownloadSimpleIcon data-icon="inline-start" />
          Export
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            Pick a date range and format. Exports are pulled fresh from the database, not the on-screen filter.
          </DialogDescription>
        </DialogHeader>

        <section className="space-y-2">
          <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Date range</div>
          <div className="flex flex-wrap gap-1.5">
            {PRESET_ORDER.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setPreset(p)}
                className={cn(
                  "inline-flex items-center rounded-full border px-3 py-1 text-xs transition-colors",
                  preset === p
                    ? "border-foreground bg-foreground text-background"
                    : "border-border bg-background text-muted-foreground hover:text-foreground",
                )}
              >
                {PRESET_LABELS[p]}
              </button>
            ))}
          </div>
          {preset === "custom" && (
            <div className="grid grid-cols-2 gap-2 pt-1">
              <label className="flex flex-col gap-1 text-[11px] uppercase tracking-wider text-muted-foreground">
                From
                <Input
                  type="date"
                  value={customFrom}
                  onChange={(e) => setCustomFrom(e.currentTarget.value)}
                  className="h-8 text-xs"
                />
              </label>
              <label className="flex flex-col gap-1 text-[11px] uppercase tracking-wider text-muted-foreground">
                To
                <Input
                  type="date"
                  value={customTo}
                  onChange={(e) => setCustomTo(e.currentTarget.value)}
                  className="h-8 text-xs"
                />
              </label>
            </div>
          )}
          {invalidRange && (
            <p className="text-[11px] text-red-600 dark:text-red-400">
              "From" date must be on or before "To" date.
            </p>
          )}
        </section>

        <section className="space-y-2">
          <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Format</div>
          <div className="inline-flex rounded-md border bg-background p-0.5">
            <FormatBtn on={format === "csv"} onClick={() => setFormat("csv")}>CSV</FormatBtn>
            <FormatBtn on={format === "json"} onClick={() => setFormat("json")}>JSON</FormatBtn>
          </div>
        </section>

        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Cancel</Button>
          </DialogClose>
          <Button onClick={onExport} disabled={invalidRange}>
            <DownloadSimpleIcon data-icon="inline-start" />
            Export
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function FormatBtn({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      onClick={onClick}
      className={cn(
        "h-6 px-3 text-[11px] font-medium",
        on && "bg-foreground text-background hover:bg-foreground/90 hover:text-background",
      )}
    >
      {children}
    </Button>
  );
}
