import { OrdersTable } from "../tables/orders-table";
import type { OrderRow } from "@/lib/types";

export function OrdersTab({ orders, mt5Account }: { orders: OrderRow[]; mt5Account: number }) {
  return <OrdersTable orders={orders} mt5Account={mt5Account} />;
}
