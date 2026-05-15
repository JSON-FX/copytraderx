"use client";

import { Area, AreaChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useTheme } from "next-themes";
import { useMemo } from "react";
import type { AccountSnapshotDaily } from "@/lib/types";
import { fmtCash, fmtPct } from "@/lib/journal/format-pnl";
import { usePnlDisplay } from "./preferences/journal-chrome-context";

export function EquityChart({ data, currency, baseline }: { data: AccountSnapshotDaily[]; currency: string; baseline: number }) {
  const { resolvedTheme } = useTheme();
  const { mode } = usePnlDisplay();
  const showPct = mode === "percent" && baseline > 0;

  const series = useMemo(() => data.map((d) => ({
    date: d.trade_date,
    delta: d.balance_close - baseline,
    deltaPct: baseline > 0 ? ((d.balance_close - baseline) / baseline) * 100 : 0,
    value: showPct
      ? (baseline > 0 ? ((d.balance_close - baseline) / baseline) * 100 : 0)
      : d.balance_close - baseline,
  })), [data, baseline, showPct]);

  if (data.length === 0) {
    return <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">No equity history yet.</p>;
  }

  const posStroke = resolvedTheme === "dark" ? "rgb(110, 231, 183)" : "rgb(5, 150, 105)";

  const formatY = (v: number): string =>
    showPct ? fmtPct(v) : fmtCash(v, currency);

  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={series} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="equityGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={posStroke} stopOpacity={0.3}/>
              <stop offset="100%" stopColor={posStroke} stopOpacity={0}/>
            </linearGradient>
          </defs>
          <XAxis dataKey="date" tick={{ fontSize: 11 }} />
          <YAxis tick={{ fontSize: 11 }} domain={["auto", "auto"]} tickFormatter={(v) => formatY(v as number)} width={70} />
          <ReferenceLine y={0} stroke="#94a3b8" strokeDasharray="3 3" />
          <Tooltip
            formatter={(v) => formatY(v as number)}
            contentStyle={{ background: resolvedTheme === "dark" ? "#0a0a0a" : "#fff", border: "1px solid #888" }}
          />
          <Area type="monotone" dataKey="value" stroke={posStroke} fill="url(#equityGradient)" strokeWidth={2}/>
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
