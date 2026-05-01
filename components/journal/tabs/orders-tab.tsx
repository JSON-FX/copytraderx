import { OrdersTable } from "../orders-table";
import type { OrderRow } from "@/lib/types";

export function OrdersTab({ orders }: { orders: OrderRow[] }) {
  return <OrdersTable orders={orders} />;
}
