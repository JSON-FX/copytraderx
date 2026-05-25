"use client";

import { useAccountContext } from "@/lib/hooks/use-account-context";
import { CalendarTab } from "@/components/journal/tabs/calendar-tab";

export default function CalendarPage() {
  const { deals, currency, baseline } = useAccountContext();
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Calendar</h1>
      <CalendarTab deals={deals} currency={currency} baseline={baseline.baseline} />
    </div>
  );
}
