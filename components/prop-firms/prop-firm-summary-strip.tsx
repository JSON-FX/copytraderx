import { KpiCard } from "@/components/journal/kpi-card";
import { fmtPctOrCash, type PnlDisplay } from "@/lib/journal/format-pnl";
import type { PropFirmOverview } from "@/lib/prop-firm-data";

export function PropFirmSummaryStrip({ data, mode }: { data: PropFirmOverview; mode: PnlDisplay }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <KpiCard
        label="Total P&L"
        tone={data.totalPnl > 0 ? "positive" : data.totalPnl < 0 ? "negative" : "neutral"}
        // totalPnl is summed across accounts without FX conversion; the USD
        // fallback (when no account sizes exist) assumes single-currency users.
        value={fmtPctOrCash(data.totalPnl, mode, data.totalAccountSize, "USD")}
        sub="active + funded accounts"
      />
      <KpiCard label="Avg Win Rate" value="—" sub="across active accounts" />
      <KpiCard label="Active" value={String(data.activeCount)} sub="on track + watch" />
      <KpiCard label="Funded" value={String(data.fundedCount)} sub="funded accounts" tone={data.fundedCount > 0 ? "positive" : "neutral"} />
    </div>
  );
}
