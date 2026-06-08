import type { AccountSnapshotCurrent, PropfirmRule } from "@/lib/types";
import type { ObjectivesResult } from "@/lib/journal/objectives";
import type { Product } from "@/lib/products";

/** Subset of KpiCard's CardTone — drawdown is never "positive". */
export type DrawdownTone = "neutral" | "warn" | "negative";

export interface DrawdownCard {
  /** >= 0 — cash currently drawn down from account size. */
  drawdownCash: number;
  /** >= 0 — percent of account size; matches the Prop Firms page figure. */
  drawdownPct: number;
  /** Total-loss limit in cash; null for funded accounts (no challenge thresholds). */
  limitCash: number | null;
  /** Total-loss limit as percent of account size; null for funded accounts. */
  limitPct: number | null;
  tone: DrawdownTone;
}

/**
 * Drawdown card data for the prop-firm dashboard, mirroring the per-product
 * logic in getPropFirmOverview (lib/prop-firm-data.ts) so both pages show the
 * same number:
 * - challenge: rule-based totalDrawdown vs account_size, toned by the hero's
 *   WATCH (>= 70% of limit) / breach thresholds
 * - funded: MT5-native snapshot.drawdown_pct, plain negative when > 0
 * Callers are expected to pass prop products only ("ctx-prop-passer" /
 * "ctx-prop-funded"); any other product falls through to challenge logic.
 */
export function computeDrawdownCard(input: {
  product: Product;
  rule: PropfirmRule;
  snapshot: AccountSnapshotCurrent;
  evaluation: ObjectivesResult;
}): DrawdownCard {
  const { product, rule, snapshot, evaluation } = input;
  const size = rule.account_size;

  // snapshot is only read in the funded branch; the challenge branch uses
  // evaluation.totalDrawdown, which already incorporates min(balance, equity).
  if (product === "ctx-prop-funded") {
    const pct = Math.max(0, snapshot.drawdown_pct);
    return {
      drawdownCash: size > 0 ? (pct / 100) * size : 0,
      drawdownPct: pct,
      limitCash: null,
      limitPct: null,
      tone: pct > 0 ? "negative" : "neutral",
    };
  }

  const cash = evaluation.totalDrawdown;
  const limit = evaluation.totalLossThreshold;
  const tone: DrawdownTone =
    limit > 0 && cash >= limit ? "negative"
    : limit > 0 && cash >= limit * 0.7 ? "warn"
    : "neutral";

  return {
    drawdownCash: cash,
    drawdownPct: size > 0 ? (cash / size) * 100 : 0,
    limitCash: limit,
    limitPct: size > 0 ? (limit / size) * 100 : null,
    tone,
  };
}
