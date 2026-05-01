"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getJournalPollingInterval, JOURNAL_POLLING_KEY } from "@/lib/settings";

interface Options<T> {
  fetcher: () => Promise<T>;
  initialData: T;
  pushIntervalMs: number;       // EA push interval (cap)
  fixedIntervalMs?: number;     // override config; e.g. deals poll fixed at 30s
}

export function useJournalPoll<T>({ fetcher, initialData, pushIntervalMs, fixedIntervalMs }: Options<T>) {
  const [data, setData] = useState<T>(initialData);
  const [error, setError] = useState<unknown>(null);
  const [consecutiveFailures, setConsecutiveFailures] = useState(0);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;
  const cancelRef = useRef(false);

  const computeInterval = useCallback((): number => {
    if (fixedIntervalMs !== undefined) return fixedIntervalMs;
    const userMs = getJournalPollingInterval();
    return Math.max(userMs, pushIntervalMs);
  }, [fixedIntervalMs, pushIntervalMs]);

  const tick = useCallback(async () => {
    try {
      const next = await fetcherRef.current();
      if (cancelRef.current) return;
      setData(next);
      setError(null);
      setConsecutiveFailures(0);
    } catch (err) {
      if (cancelRef.current) return;
      setError(err);
      setConsecutiveFailures((n) => n + 1);
    }
  }, []);

  useEffect(() => {
    cancelRef.current = false;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    let stopped = false;

    const schedule = () => {
      if (stopped) return;
      let interval = computeInterval();
      // Backoff: after 3+ consecutive failures, slow to 4×.
      if (consecutiveFailures >= 3) interval *= 4;
      timeoutId = setTimeout(async () => {
        if (document.visibilityState !== "hidden") await tick();
        schedule();
      }, interval);
    };

    schedule();

    const onVisibility = () => {
      if (document.visibilityState === "visible") tick();
    };
    document.addEventListener("visibilitychange", onVisibility);

    const onStorage = (e: StorageEvent) => {
      if (e.key === JOURNAL_POLLING_KEY) {
        // Reschedule with new interval on next tick.
        if (timeoutId) clearTimeout(timeoutId);
        schedule();
      }
    };
    window.addEventListener("storage", onStorage);

    return () => {
      stopped = true;
      cancelRef.current = true;
      if (timeoutId) clearTimeout(timeoutId);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("storage", onStorage);
    };
  }, [tick, computeInterval, consecutiveFailures]);

  return { data, error, consecutiveFailures, refetch: tick };
}
