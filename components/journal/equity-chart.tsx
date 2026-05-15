"use client";

import { Area, AreaChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useTheme } from "next-themes";
import { useMemo } from "react";
import { format, parseISO } from "date-fns";
import type { Deal } from "@/lib/types";
import { fmtCash, fmtPct } from "@/lib/journal/format-pnl";
import { computeTradeEquity } from "@/lib/journal/trade-equity";
import { usePnlDisplay } from "./preferences/journal-chrome-context";

export function EquityChart({ deals, currency, baseline }: { deals: Deal[]; currency: string; baseline: number }) {
  const { resolvedTheme } = useTheme();
  const { mode } = usePnlDisplay();
  const showPct = mode === "percent" && baseline > 0;

  const trade = useMemo(() => computeTradeEquity(deals), [deals]);

  const series = useMemo(() => trade.curve.map((p) => ({
    date: format(parseISO(p.ts), "MMM dd"),
    value: showPct
      ? (baseline > 0 ? (p.cumPnl / baseline) * 100 : 0)
      : p.cumPnl,
  })), [trade.curve, baseline, showPct]);

  if (trade.curve.length === 0) {
    return <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">No closed trades yet.</p>;
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
          <XAxis dataKey="date" tick={{ fontSize: 11 }} minTickGap={32} />
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
