"use client";

import { useAccountContext } from "@/lib/hooks/use-account-context";
import { DashboardKpiGrid } from "@/components/dashboard/dashboard-kpi-grid";
import { DashboardObjective } from "@/components/dashboard/dashboard-objective";

export default function AccountDashboardPage() {
  const { rule } = useAccountContext();
  return rule !== null ? <DashboardObjective /> : <DashboardKpiGrid />;
}
