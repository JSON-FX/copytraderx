import { cn } from "@/lib/utils";

type State = "ok" | "warn" | "bad" | "neutral";

export function ObjectiveCard({
  name, state, value, sub, fillPct, tickLow, tickHigh,
}: {
  name: string;
  state: State;
  value: React.ReactNode;
  sub: React.ReactNode;
  fillPct: number;
  tickLow: string;
  tickHigh: string;
}) {
  const stateStyles = {
    ok:      { pill: "bg-emerald-50 text-emerald-700", bar: "bg-emerald-500" },
    warn:    { pill: "bg-amber-50 text-amber-700",     bar: "bg-amber-500" },
    bad:     { pill: "bg-red-50 text-red-700",         bar: "bg-red-500" },
    neutral: { pill: "bg-muted text-muted-foreground", bar: "bg-foreground/40" },
  }[state];
  const stateLabel = state === "ok" ? "Safe" : state === "warn" ? "Watch" : state === "bad" ? "Breach" : "—";
  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="flex items-center justify-between">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{name}</div>
        <span className={cn("rounded px-2 py-0.5 text-[11px] font-bold uppercase", stateStyles.pill)}>{stateLabel}</span>
      </div>
      <div className="mt-2 text-2xl font-bold tabular-nums">{value}</div>
      <div className="text-[11px] text-muted-foreground">{sub}</div>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted">
        <div className={cn("h-full rounded-full", stateStyles.bar)} style={{ width: `${Math.max(0, Math.min(100, fillPct))}%` }} />
      </div>
      <div className="mt-1 flex justify-between text-[10px] text-muted-foreground tabular-nums">
        <span>{tickLow}</span><span>{tickHigh}</span>
      </div>
    </div>
  );
}
