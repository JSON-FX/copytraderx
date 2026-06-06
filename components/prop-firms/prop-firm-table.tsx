"use client";

import { useRouter } from "next/navigation";
import { fmtPctOrCash, type PnlDisplay } from "@/lib/journal/format-pnl";
import { cn } from "@/lib/utils";
import type { PropFirmRow, PropFirmStatus } from "@/lib/prop-firm-data";

const STATUS_STYLE: Record<PropFirmStatus, string> = {
  on_track: "bg-emerald-500/15 text-emerald-500",
  watch: "bg-amber-500/15 text-amber-500",
  funded: "bg-blue-500/15 text-blue-500",
  breached: "bg-red-500/15 text-red-500",
};

const STATUS_LABEL: Record<PropFirmStatus, string> = {
  on_track: "ON TRACK",
  watch: "WATCH",
  funded: "FUNDED",
  breached: "BREACHED",
};

export function PropFirmTable({ rows, mode }: { rows: PropFirmRow[]; mode: PnlDisplay }) {
  const router = useRouter();

  if (rows.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
        No prop firm accounts found.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border bg-card">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-muted/30 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            <th className="sticky left-0 bg-muted/30 px-4 py-3 text-left">Account</th>
            <th className="px-4 py-3 text-left">Status</th>
            <th className="px-4 py-3 text-right">P&amp;L</th>
            <th className="px-4 py-3 text-right">Drawdown</th>
            <th className="px-4 py-3 text-left">Progress</th>
            <th className="px-4 py-3 text-right">Days</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.licenseId}
              onClick={() => {
                localStorage.setItem("ctx.activeAccountId", String(row.licenseId));
                document.cookie = `ctx.activeAccountId=${row.licenseId};path=/;max-age=${60 * 60 * 24 * 365};SameSite=Lax`;
                router.push(`/dashboard/${row.licenseId}`);
              }}
              className={cn(
                "cursor-pointer border-b transition-colors hover:bg-muted/20",
                row.status === "breached" && "opacity-40",
              )}
            >
              <td className="sticky left-0 bg-card px-4 py-3">
                <div className="font-medium">{row.name}</div>
                <div className="text-[11px] text-muted-foreground">#{row.mt5Account}</div>
              </td>
              <td className="px-4 py-3">
                <span className={cn("rounded-md px-2 py-0.5 text-[10px] font-semibold", STATUS_STYLE[row.status])}>
                  {STATUS_LABEL[row.status]}
                </span>
              </td>
              <td className={cn("px-4 py-3 text-right font-semibold tabular-nums",
                row.pnl > 0 && "text-emerald-600 dark:text-emerald-400",
                row.pnl < 0 && "text-red-600 dark:text-red-400",
              )}>
                {fmtPctOrCash(row.pnl, mode, row.accountSize ?? 0, row.currency)}
              </td>
              <td className={cn("px-4 py-3 text-right tabular-nums",
                row.drawdownPct > 3 ? "text-amber-500" : "text-muted-foreground",
              )}>
                {row.drawdownPct > 0 ? `-${row.drawdownPct.toFixed(1)}%` : "—"}
              </td>
              <td className="px-4 py-3">
                {row.status === "funded" ? (
                  <span className="text-muted-foreground">—</span>
                ) : (
                  <div className="h-[5px] w-16 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-emerald-500"
                      style={{ width: `${Math.max(0, Math.min(100, row.profitProgressPct))}%` }}
                    />
                  </div>
                )}
              </td>
              <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                {row.maxTradingDays ? `${row.tradingDays}/${row.maxTradingDays}` : String(row.tradingDays)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
