import { TradesTable } from "../tables/trades-table";
import type { Deal } from "@/lib/types";

export function TradesTab({ deals, currency, baseline }: { deals: Deal[]; currency: string; baseline: number }) {
  return <TradesTable deals={deals} currency={currency} baseline={baseline} />;
}
