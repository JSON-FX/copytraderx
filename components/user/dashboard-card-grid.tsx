"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { PRODUCT_CODES } from "@/lib/products";
import type { Product } from "@/lib/products";
import { SubscriptionCard } from "./subscription-card";
import { ExpiredBanner } from "@/components/shared/expired-banner";
import { DashboardFilterToolbar } from "./dashboard-filter-toolbar";
import type { ProductOption } from "./dashboard-filter-product-chip";
import {
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

  // Hydrate from localStorage after first client render to avoid SSR mismatch.
  useEffect(() => {
    const loaded = loadFilters();
    if (loaded !== null) setState(loaded);
  }, []);

  // Persist on every change.
  useEffect(() => {
    saveFilters(state);
  }, [state]);

  // Compute product options with counts, ordered by canonical product order.
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

  // Show the collapsible Past section only when Status filter is at its
  // default (Active + Pending). Once user opts Past into the main grid the
  // collapsible section would be redundant.
  const statusAtDefault =
    state.statuses.length === DEFAULT_FILTERS.statuses.length &&
    DEFAULT_FILTERS.statuses.every((s) => state.statuses.includes(s));

  const filtered = useMemo(
    () => applyFilters(items, state),
    [items, state],
  );
  const sortedMain = useMemo(
    () => sortItems(filtered, state.sort),
    [filtered, state.sort],
  );

  // Past items (used only when statusAtDefault is true).
  const pastUnfiltered = useMemo(
    () =>
      pastSortedByCreated(
        items.filter((i) => statusGroupOf(i.subscription.status) === "past"),
      ),
    [items],
  );
  const renewableCount = pastUnfiltered.filter(
    (i) =>
      i.subscription.status === "expired" ||
      i.subscription.status === "revoked",
  ).length;

  // Past expansion state — only relevant when statusAtDefault.
  const [pastOpen, setPastOpen] = useState(
    () => sortedMain.length === 0 && pastUnfiltered.length > 0,
  );
  const pastRef = useRef<HTMLDetailsElement | null>(null);

  function openPastFromBanner() {
    setPastOpen(true);
    requestAnimationFrame(() => {
      pastRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

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

      {/* Main grid OR empty-state messages */}
      {!mainGridEmpty ? (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {sortedMain.map((item) => (
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
      ) : filterIsDefault && pastUnfiltered.length > 0 ? (
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

      {/* Past section — only when Status filter is at default */}
      {statusAtDefault && pastUnfiltered.length > 0 ? (
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
              {pastUnfiltered.length}
            </span>
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
            {pastUnfiltered.map((item) => (
              <SubscriptionCard
                key={item.subscription.id}
                item={item}
                mode="past"
              />
            ))}
          </div>
        </details>
      ) : null}
    </div>
  );
}
