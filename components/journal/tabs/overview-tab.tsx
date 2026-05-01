import { OpenPositionsTable } from "../open-positions-table";
import type { Position } from "@/lib/types";

export function OverviewTab({ positions, currency }: { positions: Position[]; currency: string }) {
  return (
    <section className="space-y-4">
      <h2 className="text-sm font-semibold text-muted-foreground">Open Positions ({positions.length})</h2>
      <OpenPositionsTable positions={positions} currency={currency} />
    </section>
  );
}
