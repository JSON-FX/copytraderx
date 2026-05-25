"use client";

import { useAccountContext } from "@/lib/hooks/use-account-context";
import { TradesTable } from "@/components/journal/tables/trades-table";
import { PositionsTable } from "@/components/journal/tables/positions-table";
import { OrdersTable } from "@/components/journal/tables/orders-table";
import { usePnlDisplay } from "@/components/journal/preferences/journal-chrome-context";
import { fmtPctOrCash } from "@/lib/journal/format-pnl";

export default function JournalPage() {
  const { deals, positions, orders, license, snapshot, baseline, currency } = useAccountContext();
  const { mode } = usePnlDisplay();

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Journal</h1>

      {positions.length > 0 && (
        <section>
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Open Positions · <span className="text-foreground">{positions.length}</span>
            </h2>
            <span className="text-[11px] text-muted-foreground">
              Floating {fmtPctOrCash(snapshot?.floating_pnl ?? 0, mode, baseline.baseline, currency)}
            </span>
          </div>
          <div className="rounded-xl border bg-card p-4">
            <PositionsTable positions={positions} currency={currency} baseline={baseline.baseline} />
          </div>
        </section>
      )}

      <section>
        <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Closed Trades · <span className="text-foreground">{deals.length}</span>
        </h2>
        <TradesTable deals={deals} currency={currency} baseline={baseline.baseline} mt5Account={license.mt5_account} />
      </section>

      {orders.length > 0 && (
        <details className="group">
          <summary className="cursor-pointer text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Orders · <span className="text-foreground">{orders.length}</span>
            <span className="ml-1 text-xs group-open:hidden">▸</span>
            <span className="ml-1 text-xs hidden group-open:inline">▾</span>
          </summary>
          <div className="mt-2">
            <OrdersTable orders={orders} mt5Account={license.mt5_account} />
          </div>
        </details>
      )}
    </div>
  );
}
