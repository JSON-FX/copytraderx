"use client";

import { TradeCalendar } from "../trade-calendar";
import type { Deal } from "@/lib/types";

export function CalendarTab({ deals, currency, baseline }: { deals: Deal[]; currency: string; baseline: number }) {
  // Hook into URL on click — defer real filter wiring to writing-plans follow-up.
  const onDayClick = (yyyy_mm_dd: string) => {
    const url = new URL(window.location.href);
    url.hash = `#trades?date=${yyyy_mm_dd}`;
    window.location.replace(url.toString());
  };
  return <TradeCalendar deals={deals} currency={currency} baseline={baseline} onDayClick={onDayClick} />;
}
