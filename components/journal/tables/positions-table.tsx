"use client";

import type { Position } from "@/lib/types";
import { SidePill } from "./side-pill";
import { RowRailCell } from "./row-rail";
import { fmtCash, fmtPct, fmtPctOrCash } from "@/lib/journal/format-pnl";
import { usePnlDisplay } from "@/components/journal/preferences/journal-chrome-context";
import { cn } from "@/lib/utils";

export function PositionsTable({ positions, currency, baseline }: {
  positions: Position[]; currency: string; baseline: number;
}) {
  const { mode } = usePnlDisplay();

  if (positions.length === 0) {
    return (
      <div className="rounded-lg border border-dashed py-8 text-center text-sm text-muted-foreground">
        No open positions.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-[11px] uppercase tracking-wider text-muted-foreground">
            <th className="px-2 py-2 text-left font-medium">Symbol</th>
            <th className="px-2 py-2 text-left font-medium">Side</th>
            <th className="px-2 py-2 text-right font-medium">Vol</th>
            <th className="px-2 py-2 text-right font-medium">Open</th>
            <th className="px-2 py-2 text-right font-medium">Current</th>
            <th className="px-2 py-2 text-right font-medium">SL</th>
            <th className="px-2 py-2 text-right font-medium">TP</th>
            <th className="px-2 py-2 text-right font-medium">P/L</th>
          </tr>
        </thead>
        <tbody>
          {positions.map((p) => {
            const pnlPct = baseline > 0 ? (p.profit / baseline) * 100 : 0;
            return (
              <tr key={p.ticket} className="border-b hover:bg-muted/40">
                <RowRailCell variant={p.side}>
                  <span className="font-semibold">{p.symbol}</span>
                </RowRailCell>
                <td className="px-2 py-2"><SidePill variant={p.side}>{p.side}</SidePill></td>
                <td className="px-2 py-2 text-right tabular-nums">{p.volume.toFixed(2)}</td>
                <td className="px-2 py-2 text-right tabular-nums">{p.open_price.toFixed(5)}</td>
                <td className="px-2 py-2 text-right tabular-nums">{p.current_price.toFixed(5)}</td>
                <td className="px-2 py-2 text-right tabular-nums">{p.sl === null ? "—" : p.sl.toFixed(5)}</td>
                <td className="px-2 py-2 text-right tabular-nums">{p.tp === null ? "—" : p.tp.toFixed(5)}</td>
                <td className={cn("px-2 py-2 text-right tabular-nums font-semibold",
                  p.profit > 0 && "text-emerald-600 dark:text-emerald-400",
                  p.profit < 0 && "text-red-600 dark:text-red-400")}
                  title={`${fmtCash(p.profit, currency)} cash · ${fmtPct(pnlPct)} of baseline`}>
                  {fmtPctOrCash(p.profit, mode, baseline, currency)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
