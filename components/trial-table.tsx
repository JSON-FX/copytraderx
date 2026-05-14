"use client";

import Link from "next/link";
import { deriveTrialDisplayStatus } from "@/lib/trial-state";
import type { TrialLead, TrialLicense } from "@/lib/types";

export type TrialRowDisplay = {
  trial_lead: TrialLead;
  trial_license: TrialLicense;
};

export function TrialTable({ rows }: { rows: TrialRowDisplay[] }) {
  if (rows.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No trial licenses yet. Click <strong>New trial</strong> to issue one.
      </p>
    );
  }

  return (
    <table className="w-full text-sm">
      <thead className="text-left text-xs uppercase text-muted-foreground">
        <tr>
          <th className="py-2 pr-3">License key</th>
          <th className="py-2 pr-3">Product</th>
          <th className="py-2 pr-3">MT5</th>
          <th className="py-2 pr-3">Email</th>
          <th className="py-2 pr-3">TG</th>
          <th className="py-2 pr-3">Discord</th>
          <th className="py-2 pr-3">Expires</th>
          <th className="py-2 pr-3">Status</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => {
          const display = deriveTrialDisplayStatus({
            status: r.trial_license.status,
            expires_at: r.trial_license.expires_at,
          });
          return (
            <tr key={r.trial_license.id} className="border-t hover:bg-muted/30">
              <td className="py-2 pr-3 font-mono">
                <Link href={`/admin/trials/${r.trial_lead.id}`} className="hover:underline">
                  {r.trial_license.license_key}
                </Link>
              </td>
              <td className="py-2 pr-3">{r.trial_license.product}</td>
              <td className="py-2 pr-3 font-mono">{r.trial_license.mt5_account}</td>
              <td className="py-2 pr-3">{r.trial_lead.email}</td>
              <td className="py-2 pr-3">{r.trial_lead.telegram_handle ?? "—"}</td>
              <td className="py-2 pr-3">{r.trial_lead.discord_handle ?? "—"}</td>
              <td className="py-2 pr-3">{r.trial_license.expires_at.slice(0, 10)}</td>
              <td className="py-2 pr-3">
                <span
                  className={
                    display === "active"
                      ? "text-emerald-600"
                      : display === "expired"
                        ? "text-amber-600"
                        : "text-red-600"
                  }
                >
                  {display}
                </span>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
