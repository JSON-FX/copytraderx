"use client";

import { useMemo, useState } from "react";
import { TradeCalendar } from "../trade-calendar";
import { DayTradesModal } from "../day-trades-modal";
import { utcDateKey } from "@/lib/journal/calendar-aggregate";
import type { Deal } from "@/lib/types";

export function CalendarTab({ deals, currency, baseline, licenseId }: {
  deals: Deal[]; currency: string; baseline: number; licenseId: number;
}) {
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  // Same keying as aggregateCalendar — the modal always matches the cell count.
  const dayDeals = useMemo(
    () => (selectedDate ? deals.filter((d) => utcDateKey(d.close_time) === selectedDate) : []),
    [deals, selectedDate],
  );

  return (
    <>
      <TradeCalendar deals={deals} currency={currency} baseline={baseline} onDayClick={setSelectedDate} />
      {selectedDate && (
        <DayTradesModal
          key={selectedDate}            // fresh table state (search/sort/page) per day
          date={selectedDate}
          deals={dayDeals}
          currency={currency}
          baseline={baseline}
          journalHref={`/dashboard/${licenseId}/journal#trades?date=${selectedDate}`}
          onClose={() => setSelectedDate(null)}
        />
      )}
    </>
  );
}
