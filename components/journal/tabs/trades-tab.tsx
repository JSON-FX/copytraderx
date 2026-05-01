import { DealsTable } from "../deals-table";
import type { Deal } from "@/lib/types";

export function TradesTab({ deals, currency }: { deals: Deal[]; currency: string }) {
  return <DealsTable deals={deals} currency={currency} />;
}
