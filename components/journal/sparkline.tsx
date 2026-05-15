"use client";

import { useId } from "react";
import { cn } from "@/lib/utils";

export type SparklineTone = "positive" | "negative" | "neutral";

interface Props {
  values: number[];
  tone?: SparklineTone;
  className?: string;
  height?: number;
}

const TONE = {
  positive: "#059669",
  negative: "#dc2626",
  neutral:  "#64748b",
} as const;

export function Sparkline({ values, tone = "neutral", className, height = 44 }: Props) {
  const gradId = useId();
  if (values.length < 2) {
    return <div className={cn("w-full", className)} style={{ height }} />;
  }
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const w = 200;
  const padTop = 6;
  const padBot = 6;
  const innerH = height - padTop - padBot;
  const points = values.map((v, i) => {
    const x = (i / (values.length - 1)) * w;
    const y = padTop + (1 - (v - min) / span) * innerH;
    return [x, y] as const;
  });
  const pathLine = points.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`).join(" ");
  const pathArea = `${pathLine} L${w},${height} L0,${height} Z`;
  const stroke = TONE[tone];

  return (
    <svg className={cn("block w-full", className)} viewBox={`0 0 ${w} ${height}`} preserveAspectRatio="none" height={height}>
      <defs>
        <linearGradient id={gradId} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={stroke} stopOpacity={0.18} />
          <stop offset="100%" stopColor={stroke} stopOpacity={0} />
        </linearGradient>
      </defs>
      <path d={pathArea} fill={`url(#${gradId})`} />
      <path d={pathLine} fill="none" stroke={stroke} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}
