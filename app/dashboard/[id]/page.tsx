"use client";

import { useAccountContext } from "@/lib/hooks/use-account-context";

export default function AccountDashboardPage() {
  const { rule, license } = useAccountContext();
  const hasPropfirmRule = rule !== null;

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Dashboard</h1>
      <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
        {hasPropfirmRule
          ? `Objective-First dashboard for ${license.mt5_account} — coming in Task 13`
          : `KPI + Chart dashboard for ${license.mt5_account} — coming in Task 13`
        }
      </div>
    </div>
  );
}
