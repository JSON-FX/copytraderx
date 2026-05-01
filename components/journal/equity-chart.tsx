"use client";

import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useTheme } from "next-themes";
import type { AccountSnapshotDaily } from "@/lib/types";

export function EquityChart({ data, currency }: { data: AccountSnapshotDaily[]; currency: string }) {
  const { resolvedTheme } = useTheme();
  const stroke = resolvedTheme === "dark" ? "rgb(110, 231, 183)" : "rgb(5, 150, 105)";
  if (data.length === 0) {
    return <p className="rounded border p-6 text-center text-sm text-muted-foreground">No equity history yet.</p>;
  }
  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data}>
          <defs>
            <linearGradient id="equityGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={stroke} stopOpacity={0.4}/>
              <stop offset="100%" stopColor={stroke} stopOpacity={0}/>
            </linearGradient>
          </defs>
          <XAxis dataKey="trade_date" tick={{ fontSize: 11 }} />
          <YAxis tick={{ fontSize: 11 }} domain={["auto", "auto"]} tickFormatter={(v) =>
            new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 0 }).format(v as number)} />
          <Tooltip
            formatter={(v) => new Intl.NumberFormat("en-US", { style: "currency", currency }).format(v as number)}
            contentStyle={{ background: resolvedTheme === "dark" ? "#0a0a0a" : "#fff", border: "1px solid #888" }}
          />
          <Area type="monotone" dataKey="equity_close" stroke={stroke} fill="url(#equityGradient)" strokeWidth={2}/>
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
