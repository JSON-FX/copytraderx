"use client";

import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import type { Deal } from "@/lib/types";
import { cn } from "@/lib/utils";
import { format, parseISO } from "date-fns";

function fmtNum(n: number, frac = 2): string {
  return n.toLocaleString("en-US", { minimumFractionDigits: frac, maximumFractionDigits: frac });
}

export function DealsTable({ deals, currency }: { deals: Deal[]; currency: string }) {
  if (deals.length === 0) {
    return <p className="rounded border p-4 text-center text-sm text-muted-foreground">No closed trades in window.</p>;
  }
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Closed</TableHead>
          <TableHead>Symbol</TableHead>
          <TableHead>Side</TableHead>
          <TableHead className="text-right">Vol</TableHead>
          <TableHead className="text-right">Entry</TableHead>
          <TableHead className="text-right">Exit</TableHead>
          <TableHead className="text-right">Profit ({currency})</TableHead>
          <TableHead className="text-right">Comm</TableHead>
          <TableHead className="text-right">Swap</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {deals.map((d) => (
          <TableRow key={d.ticket}>
            <TableCell className="tabular-nums text-xs">{format(parseISO(d.close_time), "yyyy-MM-dd HH:mm")}</TableCell>
            <TableCell className="font-medium">{d.symbol}</TableCell>
            <TableCell className={cn("uppercase", d.side === "buy" ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400")}>
              {d.side}
            </TableCell>
            <TableCell className="text-right tabular-nums">{fmtNum(d.volume, 2)}</TableCell>
            <TableCell className="text-right tabular-nums">{fmtNum(d.open_price, 5)}</TableCell>
            <TableCell className="text-right tabular-nums">{fmtNum(d.close_price, 5)}</TableCell>
            <TableCell className={cn("text-right tabular-nums",
              d.profit > 0 ? "text-emerald-600 dark:text-emerald-400" :
              d.profit < 0 ? "text-red-600 dark:text-red-400" : "")}>
              {fmtNum(d.profit, 2)}
            </TableCell>
            <TableCell className="text-right tabular-nums">{fmtNum(d.commission, 2)}</TableCell>
            <TableCell className="text-right tabular-nums">{fmtNum(d.swap, 2)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
