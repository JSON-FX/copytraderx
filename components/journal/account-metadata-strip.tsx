import type { AccountSnapshotCurrent } from "@/lib/types";
import { fmtCash } from "@/lib/journal/format-pnl";

export function AccountMetadataStrip({ snapshot }: { snapshot: AccountSnapshotCurrent | null }) {
  if (!snapshot) return null;
  const parts: Array<[string, string]> = [
    ["Margin", fmtCash(snapshot.margin, snapshot.currency)],
    ["Free", fmtCash(snapshot.free_margin, snapshot.currency)],
    ["Margin Level", snapshot.margin_level === null ? "—" : `${snapshot.margin_level.toFixed(2)}%`],
    ["Leverage", `1:${snapshot.leverage}`],
  ];
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-1 text-xs text-muted-foreground">
      {parts.map(([k, v], i) => (
        <span key={k} className="inline-flex items-center gap-1.5 tabular-nums">
          <span>{k}</span>
          <span className="text-foreground">{v}</span>
          {i < parts.length - 1 && <span aria-hidden className="text-muted-foreground/50">·</span>}
        </span>
      ))}
    </div>
  );
}
