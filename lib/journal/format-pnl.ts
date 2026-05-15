const EN_DASH = "−";

export function fmtPct(n: number): string {
  if (!Number.isFinite(n)) return `${EN_DASH}—%`;
  const rounded = Math.round(n * 100) / 100;
  if (rounded === 0) return "0.00%";
  const sign = rounded > 0 ? "+" : EN_DASH;
  return `${sign}${Math.abs(rounded).toFixed(2)}%`;
}

export function fmtCash(n: number, currency: string): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
  }).format(n);
}

export type PnlDisplay = "percent" | "dollar";

export function fmtPctOrCash(
  cashValue: number,
  mode: PnlDisplay,
  baseline: number,
  currency: string,
): string {
  if (mode === "percent" && baseline > 0) {
    return fmtPct((cashValue / baseline) * 100);
  }
  return fmtCash(cashValue, currency);
}
