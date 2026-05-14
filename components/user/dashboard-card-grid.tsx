"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { PRODUCT_CODES } from "@/lib/products";
import type { Product } from "@/lib/products";
import { SubscriptionCard } from "./subscription-card";
import { ExpiredBanner } from "@/components/shared/expired-banner";
import { DashboardFilterToolbar } from "./dashboard-filter-toolbar";
import type { ProductOption } from "./dashboard-filter-product-chip";
import { DashboardPagination } from "./dashboard-pagination";
import {
  CARDS_PER_PAGE,
  DEFAULT_FILTERS,
  applyFilters,
  isDefault,
  loadFilters,
  saveFilters,
  sortItems,
  statusGroupOf,
  type FilterState,
} from "@/lib/dashboard-filters";
import { Button } from "@/components/ui/button";
import type { DashboardSubscription } from "@/lib/types";

function pastSortedByCreated(
  items: DashboardSubscription[],
): DashboardSubscription[] {
  return [...items].sort(
    (a, b) =>
      new Date(b.subscription.created_at).getTime() -
      new Date(a.subscription.created_at).getTime(),
  );
}

export function DashboardCardGrid({
  items,
}: {
  items: DashboardSubscription[];
}) {
  const [state, setState] = useState<FilterState>(DEFAULT_FILTERS);

  useEffect(() => {
    const loaded = loadFilters();
    if (loaded !== null) setState(loaded);
  }, []);

  useEffect(() => {
    saveFilters(state);
  }, [state]);

  // Partition: hidden subs are excluded from filter-based rendering entirely.
  const visibleItems = useMemo(
    () => items.filter((i) => i.subscription.hidden_at === null),
    [items],
  );
  const hiddenItems = useMemo(
    () => items.filter((i) => i.subscription.hidden_at !== null),
    [items],
  );

  // Product options use the FULL set of items so the user can still filter
  // products even if the only sub in that product is hidden.
  const productOptions = useMemo<ProductOption[]>(() => {
    const counts = new Map<Product, number>();
    for (const item of items) {
      const p = item.subscription.product;
      counts.set(p, (counts.get(p) ?? 0) + 1);
    }
    return PRODUCT_CODES.filter((p) => counts.has(p)).map((p) => ({
      product: p,
      count: counts.get(p)!,
    }));
  }, [items]);

  const statusAtDefault =
    state.statuses.length === DEFAULT_FILTERS.statuses.length &&
    DEFAULT_FILTERS.statuses.every((s) => state.statuses.includes(s));

  // Main grid: filter + sort the VISIBLE set only.
  const filtered = useMemo(
    () => applyFilters(visibleItems, state),
    [visibleItems, state],
  );
  const sortedMain = useMemo(
    () => sortItems(filtered, state.sort),
    [filtered, state.sort],
  );

  // Past section: derived from VISIBLE past items + (optionally) hidden past items.
  const pastVisible = useMemo(
    () =>
      pastSortedByCreated(
        visibleItems.filter(
          (i) => statusGroupOf(i.subscription.status) === "past",
        ),
      ),
    [visibleItems],
  );
  const pastHidden = useMemo(
    () =>
      pastSortedByCreated(
        hiddenItems.filter(
          (i) => statusGroupOf(i.subscription.status) === "past",
        ),
      ),
    [hiddenItems],
  );

  // Renewable banner counts VISIBLE past subs only.
  const renewableCount = pastVisible.filter(
    (i) =>
      i.subscription.status === "expired" ||
      i.subscription.status === "revoked",
  ).length;

  // Past section open/show-hidden state. Default: expand the section and
  // surface hidden cards if there are no visible past items but hidden ones
  // exist (otherwise the section header would say "(0)" and feel wrong).
  const initialPastOpen =
    sortedMain.length === 0 &&
    (pastVisible.length > 0 || pastHidden.length > 0);
  const initialShowHidden = pastVisible.length === 0 && pastHidden.length > 0;
  const [pastOpen, setPastOpen] = useState(initialPastOpen);
  const [showHiddenPast, setShowHiddenPast] = useState(initialShowHidden);
  const pastRef = useRef<HTMLDetailsElement | null>(null);

  // Pagination state.
  const [mainPage, setMainPage] = useState(1);
  const [pastPage, setPastPage] = useState(1);

  function openPastFromBanner() {
    setPastOpen(true);
    requestAnimationFrame(() => {
      pastRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  const pastCombined = showHiddenPast
    ? [...pastVisible, ...pastHidden]
    : pastVisible;

  // Compute totals and clamp current page.
  const mainTotalPages = Math.max(
    1,
    Math.ceil(sortedMain.length / CARDS_PER_PAGE),
  );
  const mainCurrentPage = Math.min(mainPage, mainTotalPages);
  const mainSlice = sortedMain.slice(
    (mainCurrentPage - 1) * CARDS_PER_PAGE,
    mainCurrentPage * CARDS_PER_PAGE,
  );

  const pastTotalPages = Math.max(
    1,
    Math.ceil(pastCombined.length / CARDS_PER_PAGE),
  );
  const pastCurrentPage = Math.min(pastPage, pastTotalPages);
  const pastSlice = pastCombined.slice(
    (pastCurrentPage - 1) * CARDS_PER_PAGE,
    pastCurrentPage * CARDS_PER_PAGE,
  );

  const mainGridEmpty = sortedMain.length === 0;
  const filterIsDefault = isDefault(state);

  return (
    <div className="space-y-4">
      <DashboardFilterToolbar
        state={state}
        onChange={setState}
        products={productOptions}
      />

      {statusAtDefault && renewableCount > 0 ? (
        <ExpiredBanner
          count={renewableCount}
          onOpenPast={openPastFromBanner}
        />
      ) : null}

      {!mainGridEmpty ? (
        <>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {mainSlice.map((item) => (
              <SubscriptionCard
                key={item.subscription.id}
                item={item}
                mode={
                  statusGroupOf(item.subscription.status) === "past"
                    ? "past"
                    : "current"
                }
              />
            ))}
          </div>
          <DashboardPagination
            page={mainCurrentPage}
            totalPages={mainTotalPages}
            onChange={setMainPage}
          />
        </>
      ) : filterIsDefault &&
        (pastVisible.length > 0 || pastHidden.length > 0) ? (
        <p className="text-sm text-muted-foreground">No active subscriptions.</p>
      ) : (
        <div className="flex flex-col items-start gap-2 rounded-md border border-dashed p-6">
          <p className="text-sm text-muted-foreground">
            No subscriptions match these filters.
          </p>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => setState(DEFAULT_FILTERS)}
          >
            Clear filters
          </Button>
        </div>
      )}

      {statusAtDefault &&
      (pastVisible.length > 0 || pastHidden.length > 0) ? (
        <details
          ref={pastRef}
          open={pastOpen}
          onToggle={(e) => setPastOpen(e.currentTarget.open)}
          id="past-subscriptions"
          className="group"
        >
          <summary className="flex cursor-pointer list-none items-center gap-3 py-2 text-sm font-semibold text-foreground/80 hover:text-foreground">
            <span>Past subscriptions</span>
            <span className="inline-flex h-5 items-center justify-center rounded-full bg-muted px-2 text-xs font-semibold text-foreground/70">
              {pastVisible.length}
            </span>
            {pastHidden.length > 0 ? (
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setShowHiddenPast((v) => !v);
                }}
                className="text-xs font-normal text-muted-foreground hover:text-foreground"
              >
                {showHiddenPast
                  ? `Hide ${pastHidden.length} hidden`
                  : `Show ${pastHidden.length} hidden`}
              </button>
            ) : null}
            <span className="h-px flex-1 bg-border" aria-hidden />
            <ChevronDown
              className="h-4 w-4 transition-transform group-open:rotate-180"
              aria-hidden
            />
          </summary>
          <p className="mb-3 mt-1 text-xs text-muted-foreground">
            Revoked, expired, or rejected. You can still renew expired or
            revoked subs, or re-open the journal of historic licenses.
          </p>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {pastSlice.map((item) => (
              <SubscriptionCard
                key={item.subscription.id}
                item={item}
                mode="past"
              />
            ))}
          </div>
          <DashboardPagination
            page={pastCurrentPage}
            totalPages={pastTotalPages}
            onChange={setPastPage}
          />
        </details>
      ) : null}
    </div>
  );
}
