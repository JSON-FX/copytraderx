"use client";

import { useCallback, useState } from "react";

export type SortKey = string;
export type SortValue = `${SortKey}_asc` | `${SortKey}_desc`;

export interface TableState {
  sort: SortValue;
  page: number;
  size: number;
  filters: Record<string, string | null>;
  search: string;
}

export interface UseTableStateOptions {
  defaultSort: SortValue;
  defaultSize: number;
}

export function useTableState({ defaultSort, defaultSize }: UseTableStateOptions) {
  const [state, setState] = useState<TableState>({
    sort: defaultSort, page: 1, size: defaultSize, filters: {}, search: "",
  });

  const setSort = useCallback((key: SortKey) => {
    setState((s) => {
      const [currentKey, currentDir] = s.sort.split(/_(?=asc$|desc$)/) as [SortKey, "asc" | "desc"];
      if (currentKey === key) {
        const nextDir = currentDir === "asc" ? "desc" : "asc";
        return { ...s, sort: `${key}_${nextDir}` as SortValue, page: 1 };
      }
      return { ...s, sort: `${key}_desc` as SortValue, page: 1 };
    });
  }, []);

  const setPage = useCallback((page: number) => setState((s) => ({ ...s, page })), []);
  const setSize = useCallback((size: number) => setState((s) => ({ ...s, size, page: 1 })), []);
  const setFilter = useCallback((key: string, value: string | null) => setState((s) => ({
    ...s, filters: { ...s.filters, [key]: value }, page: 1,
  })), []);
  const setSearch = useCallback((search: string) => setState((s) => ({ ...s, search, page: 1 })), []);
  const reset = useCallback(() => setState({
    sort: defaultSort, page: 1, size: defaultSize, filters: {}, search: "",
  }), [defaultSort, defaultSize]);

  return { state, setSort, setPage, setSize, setFilter, setSearch, reset };
}
