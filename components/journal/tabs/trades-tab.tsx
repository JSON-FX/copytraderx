import { TradesTable } from "../tables/trades-table";
import type { Deal } from "@/lib/types";

export function TradesTab({ deals, currency, baseline, mt5Account }: {
  deals: Deal[]; currency: string; baseline: number; mt5Account: number;
}) {
  return <TradesTable deals={deals} currency={currency} baseline={baseline} mt5Account={mt5Account} />;
}
