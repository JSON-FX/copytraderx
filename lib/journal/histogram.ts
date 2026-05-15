export type BinSign = "win" | "loss" | "zero";

export interface HistogramBin {
  start: number;
  end: number;
  count: number;
  sign: BinSign;
}

export interface HistogramResult {
  bins: HistogramBin[];
  min: number;
  max: number;
}

export function binPnlDistribution(
  values: number[],
  binCount: number
): HistogramResult {
  if (values.length === 0 || binCount <= 0) {
    return { bins: [], min: 0, max: 0 };
  }

  const min = Math.min(...values);
  const max = Math.max(...values);

  if (min === max) {
    const sign: BinSign =
      min > 0 ? "win" : min < 0 ? "loss" : "zero";
    return {
      bins: [{ start: min, end: max, count: values.length, sign }],
      min,
      max,
    };
  }

  const step = (max - min) / binCount;
  const bins: HistogramBin[] = Array.from({ length: binCount }, (_, i) => {
    const start = min + step * i;
    const end = i === binCount - 1 ? max : start + step;
    const mid = (start + end) / 2;
    const sign: BinSign =
      mid > 0.0001 ? "win" : mid < -0.0001 ? "loss" : "zero";
    return { start, end, count: 0, sign };
  });

  for (const v of values) {
    const idx = Math.min(
      binCount - 1,
      Math.max(0, Math.floor((v - min) / step))
    );
    bins[idx].count += 1;
  }

  return { bins, min, max };
}
