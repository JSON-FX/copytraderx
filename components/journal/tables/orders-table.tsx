"use client";

import { useMemo } from "react";
import { format, parseISO } from "date-fns";
import type { OrderRow } from "@/lib/types";
import { applyOrderFilters, classifyOrderState } from "@/lib/journal/order-filters";
import { humanizeOrderState, humanizeOrderType } from "@/lib/journal/order-display";
import { useTableState, type SortValue } from "@/components/journal/filters/use-table-state";
import { ToggleChip, SelectChip } from "@/components/journal/filters/filter-chip";
import { FilterSearch } from "@/components/journal/filters/filter-search";
import { Pagination } from "@/components/journal/filters/pagination";
import { ExportDialog } from "@/components/journal/export-dialog";
import { SidePill } from "./side-pill";
import { StatePill } from "./state-pill";
import { RowRailCell } from "./row-rail";
import { cn } from "@/lib/utils";

export function OrdersTable({ orders, mt5Account }: { orders: OrderRow[]; mt5Account: number }) {
  const { state, setSort, setPage, setSize, setFilter, setSearch } =
    useTableState({ defaultSort: "setup_desc" as SortValue, defaultSize: 25 });

  const symbolOptions = useMemo(() => {
    const set = new Set<string>(); for (const o of orders) set.add(o.symbol);
    return [...set].sort().map((s) => ({ value: s, label: s }));
  }, [orders]);
  const typeOptions = useMemo(() => {
    const set = new Set<string>(); for (const o of orders) set.add(o.type);
    return [...set].sort().map((t) => ({ value: t, label: humanizeOrderType(t).label }));
  }, [orders]);

  const result = useMemo(() => applyOrderFilters(orders, state), [orders, state]);
  const totalFilled = orders.reduce((a, o) => a + (classifyOrderState(o.state) === "filled" ? 1 : 0), 0);
  const totalCanceled = orders.reduce((a, o) => a + (classifyOrderState(o.state) === "canceled" ? 1 : 0), 0);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold">Orders</h3>
        <div className="text-xs text-muted-foreground tabular-nums">
          {orders.length} orders · {totalFilled} filled · {totalCanceled} canceled
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-b pb-3">
        <ToggleChip label="All" count={orders.length}
          active={!state.filters.state}
          onClick={() => setFilter("state", null)} />
        <ToggleChip label="Filled" count={totalFilled}
          active={state.filters.state === "filled"}
          onClick={() => setFilter("state", state.filters.state === "filled" ? null : "filled")} />
        <ToggleChip label="Canceled" count={totalCanceled}
          active={state.filters.state === "canceled"}
          onClick={() => setFilter("state", state.filters.state === "canceled" ? null : "canceled")} />
        <SelectChip label="Type" value={state.filters.type ?? null} options={typeOptions}
          onChange={(v) => setFilter("type", v)} />
        <SelectChip label="Symbol" value={state.filters.symbol ?? null} options={symbolOptions}
          onChange={(v) => setFilter("symbol", v)} />
        <FilterSearch value={state.search} onChange={setSearch} placeholder="Search ticket, symbol…" className="ml-auto" />
        <ExportDialog kind="orders" mt5Account={mt5Account} />
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-[11px] uppercase tracking-wider text-muted-foreground">
              <Th k="setup"  state={state.sort} onClick={() => setSort("setup")}>Setup</Th>
              <Th k="symbol" state={state.sort} onClick={() => setSort("symbol")}>Symbol</Th>
              <Th k="type"   state={state.sort} onClick={() => setSort("type")}>Type</Th>
              <Th k="state"  state={state.sort} onClick={() => setSort("state")}>State</Th>
              <th className="px-2 py-2 text-right font-medium">Vol Init</th>
              <th className="px-2 py-2 text-right font-medium">Vol Now</th>
              <th className="px-2 py-2 text-right font-medium">Price</th>
              <th className="px-2 py-2 font-medium">Done</th>
            </tr>
          </thead>
          <tbody>
            {result.rows.length === 0 ? (
              <tr><td colSpan={8}>
                <div className="my-4 rounded-lg border border-dashed py-8 text-center text-sm text-muted-foreground">No orders match this filter.</div>
              </td></tr>
            ) : result.rows.map((o) => {
              const type = humanizeOrderType(o.type);
              const st = humanizeOrderState(o.state);
              const rail = type.variant === "buy" || type.variant === "sell" ? type.variant : "neutral";
              return (
                <tr key={o.ticket} className="border-b hover:bg-muted/40">
                  <RowRailCell variant={rail}>
                    <span className="text-xs tabular-nums">{format(parseISO(o.time_setup), "MMM dd · HH:mm")}</span>
                  </RowRailCell>
                  <td className="px-2 py-2 font-semibold">{o.symbol}</td>
                  <td className="px-2 py-2"><SidePill variant={type.variant} outline={type.outline}>{type.label}</SidePill></td>
                  <td className="px-2 py-2"><StatePill variant={st.variant}>{st.label}</StatePill></td>
                  <td className="px-2 py-2 text-right tabular-nums">{o.volume_initial.toFixed(2)}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{o.volume_current.toFixed(2)}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{o.price_open === null ? "—" : o.price_open.toFixed(5)}</td>
                  <td className="px-2 py-2 text-xs tabular-nums text-muted-foreground">{o.time_done ? format(parseISO(o.time_done), "MMM dd · HH:mm") : "—"}</td>
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

function Th({ k, state, onClick, children }: {
  k: string; state: string; onClick: () => void; children: React.ReactNode;
}) {
  const [key, dir] = state.split(/_(?=asc$|desc$)/) as [string, "asc" | "desc"];
  const active = key === k;
  return (
    <th className="px-2 py-2 font-medium">
      <button type="button" onClick={onClick} className={cn("inline-flex items-center gap-1 hover:text-foreground", active && "text-foreground")}>
        {children}
        <span aria-hidden className={cn("text-[10px]", !active && "text-muted-foreground/40")}>{active && dir === "asc" ? "↑" : "↓"}</span>
      </button>
    </th>
  );
}
