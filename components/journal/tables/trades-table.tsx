"use client";

import { useMemo } from "react";
import { format, parseISO } from "date-fns";
import type { Deal } from "@/lib/types";
import { applyTradeFilters } from "@/lib/journal/trade-filters";
import { fmtCash, fmtPct, fmtPctOrCash } from "@/lib/journal/format-pnl";
import { useTableState, type SortValue } from "@/components/journal/filters/use-table-state";
import { ToggleChip, SelectChip } from "@/components/journal/filters/filter-chip";
import { FilterSearch } from "@/components/journal/filters/filter-search";
import { Pagination } from "@/components/journal/filters/pagination";
import { SidePill } from "./side-pill";
import { RowRailCell } from "./row-rail";
import { usePnlDisplay } from "@/components/journal/preferences/journal-chrome-context";
import { cn } from "@/lib/utils";

export function TradesTable({ deals, currency, baseline }: { deals: Deal[]; currency: string; baseline: number }) {
  const { mode } = usePnlDisplay();
  const { state, setSort, setPage, setSize, setFilter, setSearch } =
    useTableState({ defaultSort: "closed_desc" as SortValue, defaultSize: 25 });

  const symbolOptions = useMemo(() => {
    const set = new Set<string>(); for (const d of deals) set.add(d.symbol);
    return [...set].sort().map((s) => ({ value: s, label: s }));
  }, [deals]);

  const result = useMemo(() => applyTradeFilters(deals, state), [deals, state]);
  const maxAbsPct = useMemo(() => {
    if (baseline <= 0) return 0;
    return Math.max(0.0001, ...result.rows.map((d) => Math.abs((d.profit / baseline) * 100)));
  }, [result.rows, baseline]);

  const winRatePct = result.summary.count > 0 ? (result.summary.wins / result.summary.count) * 100 : 0;
  const netDisplay = mode === "percent" && baseline > 0
    ? fmtPct((result.summary.netCash / baseline) * 100)
    : fmtCash(result.summary.netCash, currency);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold">Closed Trades</h3>
        <div
          className="text-xs text-muted-foreground tabular-nums"
          title="Sum of gross profit on the filtered deals (commissions and swaps not included). May not match the balance delta in the Net Return card, which reflects every balance event recorded in the account."
        >
          {result.summary.count} trades · net <span className={cn(
            result.summary.netCash > 0 && "text-emerald-600 dark:text-emerald-400 font-semibold",
            result.summary.netCash < 0 && "text-red-600 dark:text-red-400 font-semibold",
          )}>{netDisplay}</span>
          {result.summary.count > 0 && <> · win rate {fmtPct(winRatePct).replace("+","")}</>}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-b pb-3">
        <ToggleChip label="All" count={deals.length}
          active={!state.filters.outcome}
          onClick={() => setFilter("outcome", null)} />
        <ToggleChip label="▲ Wins" count={deals.filter((d) => d.profit > 0).length}
          active={state.filters.outcome === "wins"}
          onClick={() => setFilter("outcome", state.filters.outcome === "wins" ? null : "wins")} />
        <ToggleChip label="▼ Losses" count={deals.filter((d) => d.profit < 0).length}
          active={state.filters.outcome === "losses"}
          onClick={() => setFilter("outcome", state.filters.outcome === "losses" ? null : "losses")} />
        <SelectChip label="Symbol" value={state.filters.symbol ?? null} options={symbolOptions}
          onChange={(v) => setFilter("symbol", v)} />
        <SelectChip label="Side" value={state.filters.side ?? null}
          options={[{ value: "buy", label: "Buy" }, { value: "sell", label: "Sell" }]}
          onChange={(v) => setFilter("side", v)} />
        <FilterSearch value={state.search} onChange={setSearch} placeholder="Search ticket, symbol…" className="ml-auto" />
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-[11px] uppercase tracking-wider text-muted-foreground">
              <Th sortKey="closed" state={state.sort} onClick={() => setSort("closed")}>Closed</Th>
              <Th sortKey="symbol" state={state.sort} onClick={() => setSort("symbol")}>Symbol</Th>
              <Th sortKey="side" state={state.sort} onClick={() => setSort("side")}>Side</Th>
              <Th sortKey="vol" state={state.sort} num onClick={() => setSort("vol")}>Vol</Th>
              <th className="px-2 py-2 text-right font-medium">Entry</th>
              <th className="px-2 py-2 text-right font-medium">Exit</th>
              <th className="px-2 py-2 text-right font-medium">Pips</th>
              <Th sortKey="profit" state={state.sort} num onClick={() => setSort("profit")}>P/L</Th>
            </tr>
          </thead>
          <tbody>
            {result.rows.length === 0 ? (
              <tr><td colSpan={8}>
                <div className="my-4 rounded-lg border border-dashed py-8 text-center text-sm text-muted-foreground">No trades match this filter.</div>
              </td></tr>
            ) : result.rows.map((d) => {
              const pips = computePips(d);
              const pnlPct = baseline > 0 ? (d.profit / baseline) * 100 : 0;
              const barW = maxAbsPct > 0 ? Math.min(100, (Math.abs(pnlPct) / maxAbsPct) * 100) : 0;
              return (
                <tr key={d.ticket} className="border-b hover:bg-muted/40">
                  <RowRailCell variant={d.side}>
                    <span className="text-xs tabular-nums">{format(parseISO(d.close_time), "MMM dd · HH:mm")}</span>
                  </RowRailCell>
                  <td className="px-2 py-2 font-semibold">{d.symbol}</td>
                  <td className="px-2 py-2"><SidePill variant={d.side}>{d.side}</SidePill></td>
                  <td className="px-2 py-2 text-right tabular-nums">{d.volume.toFixed(2)}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{d.open_price.toFixed(5)}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{d.close_price.toFixed(5)}</td>
                  <td className={cn("px-2 py-2 text-right tabular-nums", pips > 0 ? "text-emerald-600 dark:text-emerald-400" : pips < 0 ? "text-red-600 dark:text-red-400" : "")}>{pips > 0 ? "+" : ""}{pips.toFixed(1)}</td>
                  <td className="px-2 py-2 text-right" title={`${fmtCash(d.profit, currency)} cash · ${fmtPct(pnlPct)} of baseline`}>
                    <span className={cn("tabular-nums font-semibold", d.profit > 0 ? "text-emerald-600 dark:text-emerald-400" : d.profit < 0 ? "text-red-600 dark:text-red-400" : "")}>
                      {fmtPctOrCash(d.profit, mode, baseline, currency)}
                    </span>
                    <span aria-hidden className="ml-1.5 inline-block h-1 w-[38px] rounded-sm align-middle"
                      style={{
                        background: d.profit >= 0
                          ? `linear-gradient(to right, #10b981 ${barW}%, var(--border) ${barW}%)`
                          : `linear-gradient(to left, #ef4444 ${barW}%, var(--border) ${barW}%)`,
                      }}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <Pagination total={result.total} page={state.page} pageSize={state.size}
        onPageChange={setPage} onPageSizeChange={setSize} />
    </div>
  );
}

function computePips(d: Deal): number {
  const factor = d.symbol.endsWith("JPY") ? 100 : 10_000;
  const diff = (d.close_price - d.open_price) * factor;
  return d.side === "buy" ? diff : -diff;
}

function Th({ sortKey, state, num, onClick, children }: {
  sortKey: string; state: string; num?: boolean; onClick: () => void; children: React.ReactNode;
}) {
  const [key, dir] = state.split(/_(?=asc$|desc$)/) as [string, "asc" | "desc"];
  const active = key === sortKey;
  return (
    <th className={cn("px-2 py-2 font-medium", num && "text-right")}>
      <button type="button" onClick={onClick} className={cn("inline-flex items-center gap-1 hover:text-foreground", active && "text-foreground")}>
        {children}
        <span aria-hidden className={cn("text-[10px]", !active && "text-muted-foreground/40")}>{active && dir === "asc" ? "↑" : "↓"}</span>
      </button>
    </th>
  );
}
