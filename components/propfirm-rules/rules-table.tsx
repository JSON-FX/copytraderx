"use client";

import { useMemo } from "react";
import Link from "next/link";
import { parseISO, formatDistanceToNow } from "date-fns";
import type { PropfirmRule } from "@/lib/types";
import { useTableState, type SortValue } from "@/components/journal/filters/use-table-state";
import { FilterSearch } from "@/components/journal/filters/filter-search";
import { Pagination } from "@/components/journal/filters/pagination";
import { fmtCash } from "@/lib/journal/format-pnl";
import { cn } from "@/lib/utils";

interface Props {
  rules: PropfirmRule[];
  basePath: string;
}

export function RulesTable({ rules, basePath }: Props) {
  const { state, setSort, setPage, setSize, setSearch } = useTableState({
    defaultSort: "created_desc" as SortValue,
    defaultSize: 25,
  });

  const result = useMemo(() => {
    const q = state.search.trim().toLowerCase();
    const filtered = q ? rules.filter((r) => r.name.toLowerCase().includes(q)) : rules.slice();

    const [key, dir] = state.sort.split(/_(?=asc$|desc$)/) as [string, "asc" | "desc"];
    filtered.sort((a, b) => {
      const av = sortKey(a, key);
      const bv = sortKey(b, key);
      const cmp = av < bv ? -1 : av > bv ? 1 : 0;
      return dir === "asc" ? cmp : -cmp;
    });

    const total = filtered.length;
    const offset = (state.page - 1) * state.size;
    const rows = filtered.slice(offset, offset + state.size);
    return { rows, total };
  }, [rules, state.search, state.sort, state.page, state.size]);

  if (rules.length === 0) {
    return <EmptyState basePath={basePath} />;
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-muted-foreground tabular-nums">
          {result.total === rules.length
            ? `${rules.length} rule${rules.length === 1 ? "" : "s"}`
            : `${result.total} of ${rules.length} match`}
        </span>
        <FilterSearch
          value={state.search}
          onChange={setSearch}
          placeholder="Search rule name…"
          className="ml-auto"
        />
      </div>

      {result.rows.length === 0 ? (
        <div className="rounded-lg border border-dashed py-10 text-center text-sm text-muted-foreground">
          No rules match this search.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-muted/30">
              <tr className="border-b text-[11px] uppercase tracking-wider text-muted-foreground">
                <Th sortKey="name" state={state.sort} onClick={() => setSort("name")}>Name</Th>
                <Th sortKey="account_size" state={state.sort} num onClick={() => setSort("account_size")}>Account</Th>
                <Th sortKey="max_daily_loss" state={state.sort} num onClick={() => setSort("max_daily_loss")}>Daily Loss</Th>
                <Th sortKey="max_total_loss" state={state.sort} num onClick={() => setSort("max_total_loss")}>Total Loss</Th>
                <Th sortKey="profit_target" state={state.sort} num onClick={() => setSort("profit_target")}>Target</Th>
                <Th sortKey="created" state={state.sort} num onClick={() => setSort("created")}>Created</Th>
              </tr>
            </thead>
            <tbody>
              {result.rows.map((r) => (
                <tr key={r.id} className="border-b last:border-b-0 transition-colors hover:bg-muted/40">
                  <td className="px-3 py-2.5">
                    <Link href={`${basePath}/${r.id}`} className="font-medium hover:underline">
                      {r.name}
                    </Link>
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{fmtCash(r.account_size, "USD")}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{r.max_daily_loss}{unitSuffix(r.daily_loss_type)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{r.max_total_loss}{unitSuffix(r.total_loss_type)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{r.profit_target}{unitSuffix(r.target_type)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground" title={r.created_at}>
                    {formatDistanceToNow(parseISO(r.created_at), { addSuffix: true })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Pagination
        total={result.total}
        page={state.page}
        pageSize={state.size}
        onPageChange={setPage}
        onPageSizeChange={setSize}
      />
    </div>
  );
}

function unitSuffix(type: "percent" | "money"): string {
  return type === "percent" ? "%" : "$";
}

function sortKey(r: PropfirmRule, key: string): string | number {
  switch (key) {
    case "name": return r.name.toLowerCase();
    case "account_size": return r.account_size;
    case "max_daily_loss": return r.max_daily_loss;
    case "max_total_loss": return r.max_total_loss;
    case "profit_target": return r.profit_target;
    case "created":
    default:
      return r.created_at;
  }
}

function Th({
  sortKey,
  state,
  num,
  onClick,
  children,
}: {
  sortKey: string;
  state: string;
  num?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  const [key, dir] = state.split(/_(?=asc$|desc$)/) as [string, "asc" | "desc"];
  const active = key === sortKey;
  return (
    <th className={cn("px-3 py-2 font-medium", num && "text-right")}>
      <button
        type="button"
        onClick={onClick}
        className={cn(
          "inline-flex items-center gap-1 hover:text-foreground",
          active && "text-foreground",
        )}
      >
        {children}
        <span aria-hidden className={cn("text-[10px]", !active && "text-muted-foreground/40")}>
          {active && dir === "asc" ? "↑" : "↓"}
        </span>
      </button>
    </th>
  );
}

function EmptyState({ basePath }: { basePath: string }) {
  return (
    <div className="rounded-xl border border-dashed bg-muted/20 px-6 py-12 text-center">
      <div className="mx-auto mb-3 inline-flex h-10 w-10 items-center justify-center rounded-full bg-background text-foreground/40">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 7h18M3 12h18M3 17h12" />
        </svg>
      </div>
      <p className="font-serif text-lg">No rules yet</p>
      <p className="mt-1 text-sm text-muted-foreground">
        A rule is a reusable challenge setup — profit target, loss limits, trading days.<br />
        Create one, then assign it to any of your subscriptions.
      </p>
      <div className="mt-4">
        <Link
          href={`${basePath}/new`}
          className="inline-flex items-center rounded-md bg-foreground px-3 py-1.5 text-xs font-semibold text-background hover:bg-foreground/90"
        >
          Create your first rule
        </Link>
      </div>
    </div>
  );
}
