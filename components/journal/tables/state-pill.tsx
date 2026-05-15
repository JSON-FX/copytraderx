import { cn } from "@/lib/utils";

type Variant = "ok" | "warn" | "bad" | "info" | "neutral";

const STYLES: Record<Variant, string> = {
  ok:      "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400",
  warn:    "bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-400",
  bad:     "bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-400",
  info:    "bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400",
  neutral: "bg-muted text-muted-foreground",
};

export function StatePill({ variant, children }: { variant: Variant; children: React.ReactNode }) {
  return (
    <span className={cn("inline-flex items-center rounded-md px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-wider", STYLES[variant])}>
      {children}
    </span>
  );
}
