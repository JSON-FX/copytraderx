import { getSupabaseAdmin } from "@/lib/supabase/server";
import { getAccountSnapshotCurrent, getAccountSnapshotsDaily } from "@/lib/journal/queries";
import { evaluateObjectives } from "@/lib/journal/objectives";
import { productDisplayName, type Product } from "./products";
import type { License, PropfirmRule, Subscription } from "./types";

export type PropFirmStatus = "on_track" | "watch" | "funded" | "breached";

export interface PropFirmRow {
  licenseId: number;
  mt5Account: number;
  name: string;
  product: Product;
  productDisplay: string;
  status: PropFirmStatus;
  pnl: number;
  drawdownPct: number;
  profitProgressPct: number;
  tradingDays: number;
  maxTradingDays: number | null;
  minTradingDays: number;
  currency: string;
}

export interface PropFirmOverview {
  rows: PropFirmRow[];
  totalPnl: number;
  avgWinRate: number;
  activeCount: number;
  fundedCount: number;
}

export async function getPropFirmOverview(userId: string): Promise<PropFirmOverview> {
  const sb = getSupabaseAdmin();

  const { data: subs } = await sb
    .from("subscriptions")
    .select("*, propfirm_rules(*)")
    .eq("user_id", userId)
    .in("product", ["ctx-prop-passer", "ctx-prop-funded"]);

  if (!subs || subs.length === 0) {
    return { rows: [], totalPnl: 0, avgWinRate: 0, activeCount: 0, fundedCount: 0 };
  }

  const subIds = subs.map((s: { id: number }) => s.id);
  const { data: lics } = await sb
    .from("licenses")
    .select("*")
    .in("subscription_id", subIds)
    .eq("intended_account_type", "live");

  const rows: PropFirmRow[] = [];
  let totalPnl = 0;
  let activeCount = 0;
  let fundedCount = 0;

  for (const lic of (lics ?? []) as License[]) {
    const sub = subs.find((s: { id: number }) => s.id === lic.subscription_id) as
      (Subscription & { propfirm_rules: PropfirmRule | null }) | undefined;
    if (!sub) continue;

    const rule = sub.propfirm_rules;
    const [snapshot, daily] = await Promise.all([
      getAccountSnapshotCurrent(lic.mt5_account),
      getAccountSnapshotsDaily(lic.mt5_account),
    ]);

    let status: PropFirmStatus;
    let pnl = 0;
    let drawdownPct = 0;
    let profitProgressPct = 0;
    let tradingDays = 0;
    const currency = snapshot?.currency ?? "USD";

    if (sub.product === "ctx-prop-funded") {
      status = "funded";
      fundedCount++;
      if (snapshot && rule) {
        pnl = snapshot.balance - rule.account_size;
        drawdownPct = snapshot.drawdown_pct;
      }
    } else if (rule && snapshot) {
      const todayUtc = new Date().toISOString().slice(0, 10);
      const result = evaluateObjectives({ rule, currentSnapshot: snapshot, dailySnapshots: daily, todayUtc });
      pnl = result.netProfit;
      tradingDays = result.tradingDaysCount;
      drawdownPct = rule.account_size > 0 ? (result.totalDrawdown / rule.account_size) * 100 : 0;
      profitProgressPct = result.profitTargetThreshold > 0
        ? Math.min(100, (Math.max(0, result.netProfit) / result.profitTargetThreshold) * 100) : 0;

      if (result.dailyLossBreached || result.totalLossBreached || sub.status === "revoked" || sub.status === "expired") {
        status = "breached";
      } else if (
        (Math.abs(result.todaysPnl) >= result.dailyLossThreshold * 0.7) ||
        (result.totalDrawdown >= result.totalLossThreshold * 0.7)
      ) {
        status = "watch";
        activeCount++;
      } else {
        status = "on_track";
        activeCount++;
      }
    } else {
      status = sub.status === "active" ? "on_track" : "breached";
      if (status === "on_track") activeCount++;
    }

    if (status !== "breached") totalPnl += pnl;

    rows.push({
      licenseId: lic.id,
      mt5Account: lic.mt5_account,
      name: rule?.name ?? productDisplayName(lic.product),
      product: lic.product,
      productDisplay: productDisplayName(lic.product),
      status,
      pnl,
      drawdownPct,
      profitProgressPct,
      tradingDays,
      maxTradingDays: rule?.max_trading_days ?? null,
      minTradingDays: rule?.min_trading_days ?? 0,
      currency,
    });
  }

  const ORDER: Record<PropFirmStatus, number> = { watch: 0, on_track: 1, funded: 2, breached: 3 };
  rows.sort((a, b) => ORDER[a.status] - ORDER[b.status]);

  return { rows, totalPnl, avgWinRate: 0, activeCount, fundedCount };
}
