import type { AccountSnapshotCurrent } from "@/lib/types";
import type { ObjectivesResult } from "./objectives";
import { fmtCash } from "./format-pnl";

export type CardTone = "positive" | "negative" | "neutral" | "warn";
export type SubTone = "positive" | "negative" | "neutral";
export type BarTone = "ok" | "warn" | "bad" | "neutral";

export interface CardPayload {
  label: string;
  value: string;
  sub: string;
  tone: CardTone;
  subTone?: SubTone;
  progressBar?: { fill: number; tone: BarTone };
  empty?: boolean;
}

export interface PasserCards {
  progress: CardPayload;
  equity: CardPayload;
  buffer: CardPayload;
}

const EN_DASH = "−";

function signedPct(n: number): string {
  if (!Number.isFinite(n)) return `${EN_DASH}—%`;
  const rounded = Math.round(n * 10) / 10;
  if (rounded === 0) return "0.0%";
  const sign = rounded > 0 ? "+" : EN_DASH;
  return `${sign}${Math.abs(rounded).toFixed(1)}%`;
}

function bufferTone(pct: number): { tone: CardTone; bar: BarTone } {
  if (pct >= 40) return { tone: "positive", bar: "ok" };
  if (pct >= 20) return { tone: "warn",     bar: "warn" };
  return                 { tone: "negative", bar: "bad" };
}

/**
 * Build the three Prop Passer headline cards. Returns dashed-empty payloads
 * when objectives can't be computed (no rule, no snapshot, or thresholds = 0).
 */
export function buildPasserCards(
  objectives: ObjectivesResult | null,
  snapshot: AccountSnapshotCurrent | null,
  baseline: number,
  currency: string,
  mode: "percent" | "cash",
  profitTargetPct: number,
): PasserCards {
  const equity = buildEquityCard(snapshot, baseline, currency);

  if (!objectives || !snapshot) {
    return {
      progress: emptyCard("Challenge Progress", "Assign challenge rule → to see target progress"),
      equity,
      buffer:   emptyCard("Loss Buffer",        "No limits configured"),
    };
  }

  const progress = buildProgressCard(objectives, currency, mode, profitTargetPct);
  const buffer   = buildBufferCard(objectives, currency, mode);
  return { progress, equity, buffer };
}

function emptyCard(label: string, sub: string): CardPayload {
  return { label, value: "—", sub, tone: "neutral", empty: true };
}

function buildEquityCard(
  snapshot: AccountSnapshotCurrent | null,
  baseline: number,
  currency: string,
): CardPayload {
  if (!snapshot) {
    // Equity always renders (never "no-config" empty), just show a dash when no data yet.
    return { label: "Equity", value: "—", sub: "Waiting for first EA push…", tone: "neutral", empty: false };
  }
  const equity = snapshot.equity;
  const floating = snapshot.floating_pnl;
  const delta = equity - baseline;
  const deltaPct = baseline > 0 ? (delta / baseline) * 100 : 0;
  let subTone: SubTone = "neutral";
  let leading = "Breakeven";
  if (delta > 0.5)       { subTone = "positive"; leading = `Up ${fmtCash(delta, currency)} (${signedPct(deltaPct)})`; }
  else if (delta < -0.5) { subTone = "negative"; leading = `Down ${fmtCash(Math.abs(delta), currency)} (${signedPct(deltaPct)})`; }

  return {
    label: "Equity",
    value: fmtCash(equity, currency),
    sub:   `${leading} · floating ${fmtCash(floating, currency)}`,
    tone:  "neutral",
    subTone,
  };
}

function buildProgressCard(
  o: ObjectivesResult,
  currency: string,
  mode: "percent" | "cash",
  profitTargetPct: number,
): CardPayload {
  if (o.profitTargetThreshold <= 0) {
    return emptyCard("Challenge Progress", "Rule has no profit target");
  }

  // progressPct: how far toward the target (threshold-relative), used for fill bar and positive display.
  const progressPct = (o.netProfit / o.profitTargetThreshold) * 100;

  // accountPct: netProfit as % of account size (account-relative), used for breakeven band and
  // negative value display. Derived via the profitTargetPct parameter so we avoid needing
  // accountSize in ObjectivesResult. Safe: profitTargetThreshold > 0 guarded above.
  const accountSize = profitTargetPct > 0
    ? o.profitTargetThreshold / (profitTargetPct / 100)
    : o.profitTargetThreshold;
  const accountPct = (o.netProfit / accountSize) * 100;

  const inBreakevenBand = Math.abs(accountPct) <= 0.5;
  const tone: CardTone =
    inBreakevenBand ? "neutral"
      : progressPct > 0 ? "positive"
      : "negative";

  let value: string;
  if (mode === "cash") {
    value = `${fmtCash(o.netProfit, currency)} / ${fmtCash(o.profitTargetThreshold, currency)}`;
  } else if (inBreakevenBand) {
    const abs = Math.round(Math.abs(accountPct) * 10) / 10;
    value = `${abs.toFixed(1)}% · breakeven`;
  } else if (progressPct > 0) {
    value = signedPct(progressPct);
  } else {
    // Negative progress: show as % of account size (how much has been lost relative to account)
    value = signedPct(accountPct);
  }

  const gap = Math.max(0, o.profitTargetThreshold - o.netProfit);
  const goal = progressPct >= 0 ? "to pass" : "to target";
  const sub  = `${fmtCash(o.netProfit, currency)} · ${fmtCash(gap, currency)} ${goal}`;

  const fill = Math.max(0, Math.min(100, progressPct));
  return {
    label: "Challenge Progress",
    value,
    sub,
    tone,
    progressBar: { fill, tone: tone === "positive" ? "ok" : tone === "negative" ? "bad" : "neutral" },
  };
}

function buildBufferCard(
  o: ObjectivesResult,
  currency: string,
  mode: "percent" | "cash",
): CardPayload {
  const hasDaily = o.dailyLossThreshold > 0;
  const hasTotal = o.totalLossThreshold > 0;
  if (!hasDaily && !hasTotal) {
    return emptyCard("Loss Buffer", "Rule has no loss limits");
  }

  const dailyLossAbs = o.todaysPnl < 0 ? -o.todaysPnl : 0;
  const totalDrawdownAbs = o.totalDrawdown;

  const dailyBufferPct = hasDaily
    ? Math.max(0, Math.min(100, ((o.dailyLossThreshold - dailyLossAbs) / o.dailyLossThreshold) * 100))
    : 100;
  const totalBufferPct = hasTotal
    ? Math.max(0, Math.min(100, ((o.totalLossThreshold - totalDrawdownAbs) / o.totalLossThreshold) * 100))
    : 100;

  const tighter: "daily" | "total" = dailyBufferPct <= totalBufferPct ? "daily" : "total";
  const headlinePct = Math.min(dailyBufferPct, totalBufferPct);
  const { tone, bar } = bufferTone(headlinePct);

  const dailyRemaining = Math.max(0, o.dailyLossThreshold - dailyLossAbs);
  const totalRemaining = Math.max(0, o.totalLossThreshold - totalDrawdownAbs);

  const dailySub = hasDaily
    ? `daily ${fmtCash(dailyRemaining, currency)} of ${fmtCash(o.dailyLossThreshold, currency)}`
    : null;
  const totalSub = hasTotal
    ? `total ${fmtCash(totalRemaining, currency)} of ${fmtCash(o.totalLossThreshold, currency)}`
    : null;
  const sub = [dailySub, totalSub].filter(Boolean).join(" · ");

  let value: string;
  if (mode === "cash") {
    const remaining = tighter === "daily" ? dailyRemaining : totalRemaining;
    const limit     = tighter === "daily" ? o.dailyLossThreshold : o.totalLossThreshold;
    value = `${fmtCash(remaining, currency)} of ${fmtCash(limit, currency)}`;
  } else {
    value = `${Math.round(headlinePct)}% left`;
  }

  return {
    label: `Loss Buffer · ${tighter}`,
    value,
    sub,
    tone,
    progressBar: { fill: headlinePct, tone: bar },
  };
}
