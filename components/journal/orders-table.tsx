"use client";

import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import type { OrderRow } from "@/lib/types";
import { format, parseISO } from "date-fns";

function fmtNum(n: number | null, frac = 2): string {
  if (n === null) return "—";
  return n.toLocaleString("en-US", { minimumFractionDigits: frac, maximumFractionDigits: frac });
}

export function OrdersTable({ orders }: { orders: OrderRow[] }) {
  if (orders.length === 0) {
    return <p className="rounded border p-4 text-center text-sm text-muted-foreground">No orders in window.</p>;
  }
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Setup</TableHead>
          <TableHead>Symbol</TableHead>
          <TableHead>Type</TableHead>
          <TableHead>State</TableHead>
          <TableHead className="text-right">Vol Init</TableHead>
          <TableHead className="text-right">Vol Now</TableHead>
          <TableHead className="text-right">Price</TableHead>
          <TableHead>Done</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {orders.map((o) => (
          <TableRow key={o.ticket}>
            <TableCell className="tabular-nums text-xs">{format(parseISO(o.time_setup), "yyyy-MM-dd HH:mm")}</TableCell>
            <TableCell className="font-medium">{o.symbol}</TableCell>
            <TableCell className="lowercase">{o.type}</TableCell>
            <TableCell className="lowercase">{o.state}</TableCell>
            <TableCell className="text-right tabular-nums">{fmtNum(o.volume_initial, 2)}</TableCell>
            <TableCell className="text-right tabular-nums">{fmtNum(o.volume_current, 2)}</TableCell>
            <TableCell className="text-right tabular-nums">{fmtNum(o.price_open, 5)}</TableCell>
            <TableCell className="tabular-nums text-xs">
              {o.time_done ? format(parseISO(o.time_done), "yyyy-MM-dd HH:mm") : "—"}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
