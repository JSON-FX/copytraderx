import { TradeCalendar } from "../trade-calendar";
import type { Deal } from "@/lib/types";

export function CalendarTab({ deals, currency }: { deals: Deal[]; currency: string }) {
  return <TradeCalendar deals={deals} currency={currency} />;
}
