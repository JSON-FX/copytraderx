import { cn } from "@/lib/utils";
import type { ObjectiveStatus } from "@/lib/journal/objectives";

const STYLE = {
  passed: { box: "bg-emerald-50 border-emerald-300 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300", icon: "bg-emerald-500 text-white" },
  failed: { box: "bg-red-50 border-red-300 text-red-800 dark:bg-red-950/40 dark:text-red-300", icon: "bg-red-500 text-white" },
  in_progress: { box: "bg-amber-50 border-amber-300 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300", icon: "bg-amber-500 text-white" },
} as const;

export function ObjectiveBanner({ status, title, detail }: { status: ObjectiveStatus; title: string; detail: string }) {
  const s = STYLE[status];
  const glyph = status === "passed" ? "✓" : status === "failed" ? "✕" : "!";
  return (
    <div className={cn("flex items-center gap-3 rounded-lg border p-3 text-sm", s.box)}>
      <div className={cn("inline-flex size-7 items-center justify-center rounded-md text-base font-bold", s.icon)}>{glyph}</div>
      <div className="flex-1">
        <div className="font-semibold">{title}</div>
        <div className="text-xs opacity-85">{detail}</div>
      </div>
    </div>
  );
}
