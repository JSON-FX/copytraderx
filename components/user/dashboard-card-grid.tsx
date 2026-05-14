"use client";

import { useMemo, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { PRODUCT_CODES } from "@/lib/products";
import { SubscriptionCard } from "./subscription-card";
import { ExpiredBanner } from "@/components/shared/expired-banner";
import type {
  DashboardSubscription,
  SubscriptionStatus,
} from "@/lib/types";

const CURRENT_STATUSES: SubscriptionStatus[] = ["active", "pending"];
const PAST_STATUSES: SubscriptionStatus[] = ["expired", "revoked", "rejected"];

const currentStatusRank: Record<"active" | "pending", number> = {
  active: 0,
  pending: 1,
};

function sortCurrent(items: DashboardSubscription[]): DashboardSubscription[] {
  const productRank = new Map<string, number>(
    PRODUCT_CODES.map((p, i) => [p, i]),
  );
  return [...items].sort((a, b) => {
    const sa =
      currentStatusRank[a.subscription.status as "active" | "pending"] ?? 99;
    const sb =
      currentStatusRank[b.subscription.status as "active" | "pending"] ?? 99;
    if (sa !== sb) return sa - sb;
    const pa = productRank.get(a.subscription.product) ?? 99;
    const pb = productRank.get(b.subscription.product) ?? 99;
    if (pa !== pb) return pa - pb;
    return (
      new Date(b.subscription.created_at).getTime() -
      new Date(a.subscription.created_at).getTime()
    );
  });
}

function sortPast(items: DashboardSubscription[]): DashboardSubscription[] {
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
  const { current, past, renewableCount } = useMemo(() => {
    const cur: DashboardSubscription[] = [];
    const pst: DashboardSubscription[] = [];
    for (const item of items) {
      if (CURRENT_STATUSES.includes(item.subscription.status)) {
        cur.push(item);
      } else if (PAST_STATUSES.includes(item.subscription.status)) {
        pst.push(item);
      }
    }
    const renewable = pst.filter(
      (i) =>
        i.subscription.status === "expired" ||
        i.subscription.status === "revoked",
    ).length;
    return {
      current: sortCurrent(cur),
      past: sortPast(pst),
      renewableCount: renewable,
    };
  }, [items]);

  // When current is empty but past is non-empty, expand by default so the
  // user doesn't land on a visually empty page.
  const [pastOpen, setPastOpen] = useState(
    current.length === 0 && past.length > 0,
  );
  const pastRef = useRef<HTMLDetailsElement | null>(null);

  function openPastFromBanner() {
    setPastOpen(true);
    requestAnimationFrame(() => {
      pastRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  return (
    <div className="space-y-6">
      {renewableCount > 0 ? (
        <ExpiredBanner
          count={renewableCount}
          onOpenPast={openPastFromBanner}
        />
      ) : null}

      {current.length > 0 ? (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {current.map((item) => (
            <SubscriptionCard
              key={item.subscription.id}
              item={item}
              mode="current"
            />
          ))}
        </div>
      ) : past.length > 0 ? (
        <p className="text-sm text-muted-foreground">
          No active subscriptions.
        </p>
      ) : null}

      {past.length > 0 ? (
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
              {past.length}
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
            {past.map((item) => (
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
