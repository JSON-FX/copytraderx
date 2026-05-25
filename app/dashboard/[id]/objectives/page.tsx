"use client";

import { useAccountContext } from "@/lib/hooks/use-account-context";
import { ObjectivesTab } from "@/components/journal/tabs/objectives-tab";

export default function ObjectivesPage() {
  const { license, rule, snapshot, daily, currency, baseline } = useAccountContext();
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Objectives</h1>
      <ObjectivesTab license={license} rule={rule} snapshot={snapshot} daily={daily} currency={currency} baseline={baseline.baseline} />
    </div>
  );
}
