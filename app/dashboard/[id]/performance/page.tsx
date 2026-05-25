"use client";

import { useAccountContext } from "@/lib/hooks/use-account-context";
import { PerformanceTab } from "@/components/journal/tabs/performance-tab";

export default function PerformancePage() {
  const { deals, daily, currency, baseline } = useAccountContext();
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Performance</h1>
      <PerformanceTab deals={deals} daily={daily} currency={currency} baseline={baseline.baseline} />
    </div>
  );
}
