import { cn } from "@/lib/utils";

type Variant = "buy" | "sell" | "neutral";

const STYLES: Record<Variant, string> = {
  buy:     "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400",
  sell:    "bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-400",
  neutral: "bg-muted text-muted-foreground",
};

export function SidePill({ variant, outline, children }: {
  variant: Variant;
  outline?: boolean;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-wider",
        STYLES[variant],
        outline && "border border-dashed",
        outline && variant === "buy" && "border-emerald-400/70",
        outline && variant === "sell" && "border-red-400/70",
        outline && variant === "neutral" && "border-muted-foreground/30",
      )}
    >
      {children}
    </span>
  );
}
