"use client";

import { useMemo } from "react";
import { format, parseISO } from "date-fns";
import type { Deal } from "@/lib/types";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { applyTradeFilters } from "@/lib/journal/trade-filters";
import { fmtCash, fmtPctOrCash } from "@/lib/journal/format-pnl";
import { useTableState, type SortValue } from "@/components/journal/filters/use-table-state";
import { FilterSearch } from "@/components/journal/filters/filter-search";
import { Pagination } from "@/components/journal/filters/pagination";
import { Th, computePips } from "@/components/journal/tables/trades-table";
import { SidePill } from "@/components/journal/tables/side-pill";
import { RowRailCell } from "@/components/journal/tables/row-rail";
import { usePnlDisplay } from "@/components/journal/preferences/journal-chrome-context";
import { cn } from "@/lib/utils";

interface Props {
  /** YYYY-MM-DD (UTC) — the clicked calendar day. */
  date: string;
  /** Deals already filtered to `date` by the caller (utcDateKey on close_time). */
  deals: Deal[];
  currency: string;
  baseline: number;
  /** Target for the "Open in Journal" footer link. */
  journalHref: string;
  onClose: () => void;
}

export function DayTradesModal({ date, deals, currency, baseline, journalHref, onClose }: Props) {
  const { mode } = usePnlDisplay();
  // Ascending close time: read the day chronologically (journal default is desc).
  const { state, setSort, setPage, setSize, setSearch } =
    useTableState({ defaultSort: "closed_asc" as SortValue, defaultSize: 10 });

  const result = useMemo(() => applyTradeFilters(deals, state), [deals, state]);

  const { dayNet, wins, losses } = useMemo(() => ({
    dayNet: deals.reduce((a, d) => a + d.profit, 0),
    wins: deals.filter((d) => d.profit > 0).length,
    losses: deals.filter((d) => d.profit < 0).length,
  }), [deals]);

  // Visual accent: a subtle left-border on the header signals the day's polarity.
  const accentClass =
    dayNet > 0
      ? "border-l-2 border-l-emerald-500/60 pl-3"
      : dayNet < 0
        ? "border-l-2 border-l-red-500/60 pl-3"
        : "border-l-2 border-l-muted pl-3";

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      {/*
       * max-w-3xl override: DialogContent defaults to sm:max-w-sm; we widen it
       * here so the 8-column table has enough room. On small screens the dialog
       * falls back to the full-width mobile size (max-w-[calc(100%-2rem)]).
       */}
      <DialogContent className="sm:max-w-3xl gap-3">
        {/* ── Header ── */}
        <DialogHeader className={accentClass}>
          <DialogTitle className="text-sm font-semibold tracking-tight">
            {format(parseISO(date), "EEE, MMM d yyyy")}
          </DialogTitle>
          <DialogDescription className="tabular-nums text-xs leading-relaxed">
            <span>{deals.length} trade{deals.length === 1 ? "" : "s"}</span>
            <span className="mx-1.5 text-muted-foreground/40">·</span>
            <span>
              net{" "}
              <span
                className={cn(
                  "font-semibold",
                  dayNet > 0 && "text-emerald-600 dark:text-emerald-400",
                  dayNet < 0 && "text-red-600 dark:text-red-400",
                )}
              >
                {fmtPctOrCash(dayNet, mode, baseline, currency)}
              </span>
            </span>
            <span className="mx-1.5 text-muted-foreground/40">·</span>
            <span className="text-muted-foreground">
              {wins}W / {losses}L
            </span>
          </DialogDescription>
        </DialogHeader>

        {/* ── Search bar ── */}
        <div className="flex items-center justify-end">
          <FilterSearch
            value={state.search}
            onChange={setSearch}
            placeholder="Search ticket, symbol…"
          />
        </div>

        {/* ── Trades table (scrollable) ── */}
        <div className="max-h-[55vh] overflow-y-auto overflow-x-auto rounded-sm ring-1 ring-border/50 bg-popover">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10 bg-popover">
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
                <tr>
                  <td colSpan={8}>
                    <div className="my-4 rounded-lg border border-dashed py-8 text-center text-sm text-muted-foreground">
                      No trades match.
                    </div>
                  </td>
                </tr>
              ) : (
                result.rows.map((d) => {
                  const pips = computePips(d);
                  return (
                    <tr
                      key={d.ticket}
                      className={cn("border-b hover:bg-muted/40 transition-colors duration-75")}
                    >
                      <RowRailCell variant={d.side}>
                        <span className="text-xs tabular-nums text-muted-foreground">
                          {format(parseISO(d.close_time), "HH:mm:ss")}
                        </span>
                      </RowRailCell>
                      <td className="px-2 py-2 font-semibold">{d.symbol}</td>
                      <td className="px-2 py-2">
                        <SidePill variant={d.side}>{d.side}</SidePill>
                      </td>
                      <td className="px-2 py-2 text-right tabular-nums text-muted-foreground">
                        {d.volume.toFixed(2)}
                      </td>
                      <td className="px-2 py-2 text-right tabular-nums text-muted-foreground">
                        {d.open_price.toFixed(5)}
                      </td>
                      <td className="px-2 py-2 text-right tabular-nums text-muted-foreground">
                        {d.close_price.toFixed(5)}
                      </td>
                      <td
                        className={cn(
                          "px-2 py-2 text-right tabular-nums",
                          pips > 0
                            ? "text-emerald-600 dark:text-emerald-400"
                            : pips < 0
                              ? "text-red-600 dark:text-red-400"
                              : "text-muted-foreground",
                        )}
                      >
                        {pips > 0 ? "+" : ""}{pips.toFixed(1)}
                      </td>
                      <td
                        className="px-2 py-2 text-right"
                        title={`${fmtCash(d.profit, currency)} cash`}
                      >
                        <span
                          className={cn(
                            "tabular-nums font-semibold",
                            d.profit > 0
                              ? "text-emerald-600 dark:text-emerald-400"
                              : d.profit < 0
                                ? "text-red-600 dark:text-red-400"
                                : "text-muted-foreground",
                          )}
                        >
                          {fmtPctOrCash(d.profit, mode, baseline, currency)}
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* ── Pagination ── */}
        <Pagination
          total={result.total}
          page={state.page}
          pageSize={state.size}
          pageSizeOptions={[10, 25, 50]}
          onPageChange={setPage}
          onPageSizeChange={setSize}
        />

        {/* ── Footer ── */}
        <div className="flex items-center justify-between border-t pt-3">
          <a
            href={journalHref}
            onClick={onClose}
            className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline transition-colors duration-75"
          >
            Open in Journal →
          </a>
        </div>
      </DialogContent>
    </Dialog>
  );
}
