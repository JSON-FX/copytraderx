"use client";

import { useNowTick } from "@/lib/hooks/use-data-age";
import { dataAgeMs, deriveDataAge } from "@/lib/journal/data-age";
import { cn } from "@/lib/utils";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";

interface Props {
  pushedAt: string | null;
  pushIntervalSeconds: number;
}

function formatAge(ms: number): string {
  if (!Number.isFinite(ms)) return "no data";
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  return `${h}h ago`;
}

export function DataAgeIndicator({ pushedAt, pushIntervalSeconds }: Props) {
  const now = useNowTick(1000);
  const state = deriveDataAge(pushedAt, pushIntervalSeconds, now);
  const ageMs = pushedAt ? dataAgeMs(pushedAt, now) : Number.POSITIVE_INFINITY;

  const stateClass =
    state === "fresh" ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
    : state === "stale" ? "bg-amber-500/15 text-amber-700 dark:text-amber-300"
    : "bg-red-500/15 text-red-700 dark:text-red-300";

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            className={cn(
              "inline-flex items-center gap-1.5 rounded px-2 py-0.5 text-xs font-medium",
              stateClass,
            )}
            aria-label={`data age: ${formatAge(ageMs)}, ${state}`}
          >
            <span className={cn(
              "h-1.5 w-1.5 rounded-full",
              state === "fresh" ? "bg-emerald-500" : state === "stale" ? "bg-amber-500" : "bg-red-500",
            )} />
            {pushedAt ? formatAge(ageMs) : "no data yet"}
          </span>
        </TooltipTrigger>
        <TooltipContent>
          EA pushes every {pushIntervalSeconds}s. Browser polling faster than this won't help.
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
