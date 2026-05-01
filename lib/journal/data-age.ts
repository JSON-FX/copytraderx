import type { DataAgeState } from "@/lib/types";

export function dataAgeMs(pushedAt: string, now: Date): number {
  const pushedMs = new Date(pushedAt).getTime();
  const nowMs = now.getTime();
  if (Number.isNaN(pushedMs)) return Number.POSITIVE_INFINITY;
  return Math.max(0, nowMs - pushedMs);
}

export function deriveDataAge(
  pushedAt: string | null,
  pushIntervalSec: number,
  now: Date,
): DataAgeState {
  if (pushedAt === null) return "offline";
  const ageMs = dataAgeMs(pushedAt, now);
  const interval = pushIntervalSec * 1000;
  if (ageMs < 2 * interval) return "fresh";
  if (ageMs < 4 * interval) return "stale";
  return "offline";
}
