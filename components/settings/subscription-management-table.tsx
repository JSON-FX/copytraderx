"use client";

import { useState } from "react";
import { format, parseISO, formatDistanceToNow } from "date-fns";
import { productDisplayName } from "@/lib/products";
import { cn } from "@/lib/utils";
import type { DashboardSubscription } from "@/lib/types";

const STATUS_STYLE: Record<string, string> = {
  active: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  pending: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  expired: "bg-muted text-muted-foreground",
  revoked: "bg-red-500/15 text-red-600 dark:text-red-400",
  rejected: "bg-red-500/15 text-red-600 dark:text-red-400",
};

export function SubscriptionManagementTable({ items }: { items: DashboardSubscription[] }) {
  const active = items.filter((i) => i.subscription.status === "active" || i.subscription.status === "pending");
  const past = items.filter((i) => i.subscription.status !== "active" && i.subscription.status !== "pending");
  const [showPast, setShowPast] = useState(false);

  return (
    <div className="space-y-4">
      <SubTable rows={active} />
      {past.length > 0 && (
        <details open={showPast} onToggle={(e) => setShowPast((e.target as HTMLDetailsElement).open)}>
          <summary className="cursor-pointer text-sm text-muted-foreground">
            Past subscriptions ({past.length})
          </summary>
          <div className="mt-2">
            <SubTable rows={past} />
          </div>
        </details>
      )}
    </div>
  );
}

function SubTable({ rows }: { rows: DashboardSubscription[] }) {
  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground">No subscriptions.</p>;
  }

  return (
    <div className="overflow-x-auto rounded-xl border bg-card">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-muted/30 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            <th className="px-4 py-3 text-left">Subscription</th>
            <th className="px-4 py-3 text-left">Status</th>
            <th className="px-4 py-3 text-left">Live Slot</th>
            <th className="px-4 py-3 text-left">Demo Slot</th>
            <th className="px-4 py-3 text-left">Expires</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((item) => {
            const sub = item.subscription;
            return (
              <tr key={sub.id} className="border-b">
                <td className="px-4 py-3 font-medium">
                  {productDisplayName(sub.product)}
                  <div className="text-[11px] text-muted-foreground">{sub.tier}</div>
                </td>
                <td className="px-4 py-3">
                  <span className={cn("rounded-md px-2 py-0.5 text-[10px] font-semibold", STATUS_STYLE[sub.status])}>
                    {sub.status.toUpperCase()}
                  </span>
                </td>
                <td className="px-4 py-3 text-xs">
                  {item.liveLicense
                    ? `MT5 #${item.liveLicense.mt5_account}`
                    : <span className="text-muted-foreground">Empty</span>
                  }
                </td>
                <td className="px-4 py-3 text-xs">
                  {item.demoLicense
                    ? `MT5 #${item.demoLicense.mt5_account}`
                    : <span className="text-muted-foreground">Empty</span>
                  }
                </td>
                <td className="px-4 py-3 text-xs text-muted-foreground">
                  {sub.expires_at
                    ? <>{format(parseISO(sub.expires_at), "MMM dd, yyyy")} <span className="text-[10px]">({formatDistanceToNow(parseISO(sub.expires_at), { addSuffix: true })})</span></>
                    : "—"
                  }
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
