"use client";

import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import type { Position } from "@/lib/types";
import { cn } from "@/lib/utils";

function fmtNum(n: number, frac = 2): string {
  return n.toLocaleString("en-US", { minimumFractionDigits: frac, maximumFractionDigits: frac });
}

export function OpenPositionsTable({ positions, currency }: { positions: Position[]; currency: string }) {
  if (positions.length === 0) {
    return <p className="rounded border p-4 text-center text-sm text-muted-foreground">No open positions.</p>;
  }
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Symbol</TableHead>
          <TableHead>Side</TableHead>
          <TableHead className="text-right">Volume</TableHead>
          <TableHead className="text-right">Open</TableHead>
          <TableHead className="text-right">Current</TableHead>
          <TableHead className="text-right">SL</TableHead>
          <TableHead className="text-right">TP</TableHead>
          <TableHead className="text-right">P/L ({currency})</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {positions.map((p) => (
          <TableRow key={p.ticket}>
            <TableCell className="font-medium">{p.symbol}</TableCell>
            <TableCell className={cn("uppercase", p.side === "buy" ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400")}>
              {p.side}
            </TableCell>
            <TableCell className="text-right tabular-nums">{fmtNum(p.volume, 2)}</TableCell>
            <TableCell className="text-right tabular-nums">{fmtNum(p.open_price, 5)}</TableCell>
            <TableCell className="text-right tabular-nums">{fmtNum(p.current_price, 5)}</TableCell>
            <TableCell className="text-right tabular-nums">{p.sl === null ? "—" : fmtNum(p.sl, 5)}</TableCell>
            <TableCell className="text-right tabular-nums">{p.tp === null ? "—" : fmtNum(p.tp, 5)}</TableCell>
            <TableCell className={cn("text-right tabular-nums",
              p.profit > 0 ? "text-emerald-600 dark:text-emerald-400" :
              p.profit < 0 ? "text-red-600 dark:text-red-400" : "")}>
              {fmtNum(p.profit, 2)}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
