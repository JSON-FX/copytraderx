import { cn } from "@/lib/utils";

type Variant = "buy" | "sell" | "neutral";

export function RowRailCell({ variant, children, className }: {
  variant: Variant;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <td className={cn("relative py-3 pl-3.5 pr-2", className)}>
      <span
        aria-hidden
        className={cn(
          "pointer-events-none absolute left-0 top-2 bottom-2 w-[3px] rounded-sm",
          variant === "buy" && "bg-emerald-500",
          variant === "sell" && "bg-red-500",
          variant === "neutral" && "bg-slate-300 dark:bg-slate-600",
        )}
      />
      {children}
    </td>
  );
}
