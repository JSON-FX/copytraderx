import { KpiCard } from "@/components/journal/kpi-card";
import { fmtCash } from "@/lib/journal/format-pnl";
import type { PropFirmOverview } from "@/lib/prop-firm-data";

export function PropFirmSummaryStrip({ data }: { data: PropFirmOverview }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <KpiCard
        label="Total P&L"
        tone={data.totalPnl > 0 ? "positive" : data.totalPnl < 0 ? "negative" : "neutral"}
        value={fmtCash(data.totalPnl, "USD")}
        sub="active + funded accounts"
      />
      <KpiCard label="Avg Win Rate" value="—" sub="across active accounts" />
      <KpiCard label="Active" value={String(data.activeCount)} sub="on track + watch" />
      <KpiCard label="Funded" value={String(data.fundedCount)} sub="funded accounts" tone={data.fundedCount > 0 ? "positive" : "neutral"} />
    </div>
  );
}
