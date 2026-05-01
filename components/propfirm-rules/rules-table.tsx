"use client";

import Link from "next/link";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { PropfirmRule } from "@/lib/types";

export function RulesTable({ rules }: { rules: PropfirmRule[] }) {
  if (rules.length === 0) {
    return <p className="rounded border p-6 text-center text-sm text-muted-foreground">No rules yet.</p>;
  }
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Name</TableHead>
          <TableHead className="text-right">Account</TableHead>
          <TableHead className="text-right">Daily Loss</TableHead>
          <TableHead className="text-right">Total Loss</TableHead>
          <TableHead className="text-right">Target</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rules.map((r) => (
          <TableRow key={r.id} className="cursor-pointer hover:bg-muted/50">
            <TableCell><Link href={`/propfirm-rules/${r.id}`} className="hover:underline">{r.name}</Link></TableCell>
            <TableCell className="text-right tabular-nums">${r.account_size.toLocaleString()}</TableCell>
            <TableCell className="text-right tabular-nums">{r.max_daily_loss}{r.daily_loss_type === "percent" ? "%" : "$"}</TableCell>
            <TableCell className="text-right tabular-nums">{r.max_total_loss}{r.total_loss_type === "percent" ? "%" : "$"}</TableCell>
            <TableCell className="text-right tabular-nums">{r.profit_target}{r.target_type === "percent" ? "%" : "$"}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
