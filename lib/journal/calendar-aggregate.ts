import type { Deal } from "@/lib/types";

export interface CalendarDay {
  date: string;       // YYYY-MM-DD UTC
  netPnl: number;
  tradeCount: number;
  wins: number;
  losses: number;
}

function utcDateKey(iso: string): string {
  return iso.slice(0, 10);  // ISO 8601 with Z timezone — first 10 chars are YYYY-MM-DD UTC.
}

export function aggregateCalendar(deals: Deal[]): Map<string, CalendarDay> {
  const out = new Map<string, CalendarDay>();
  for (const d of deals) {
    const key = utcDateKey(d.close_time);
    const cur = out.get(key) ?? { date: key, netPnl: 0, tradeCount: 0, wins: 0, losses: 0 };
    cur.netPnl += d.profit;
    cur.tradeCount += 1;
    if (d.profit > 0) cur.wins += 1;
    else if (d.profit < 0) cur.losses += 1;
    out.set(key, cur);
  }
  return out;
}
