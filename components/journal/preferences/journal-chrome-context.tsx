"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";
import type { PnlDisplay } from "@/lib/preferences/server";
import { updatePnlDisplay } from "@/app/dashboard/settings/actions";

export type RangeDays = 7 | 30 | 90 | 0;

interface ChromeState {
  mode: PnlDisplay;
  setMode: (v: PnlDisplay) => void;
  range: RangeDays;
  setRange: (v: RangeDays) => void;
  licenseId: number;
}

const Ctx = createContext<ChromeState | null>(null);

export function JournalChromeProvider({
  licenseId, initialPnlDisplay, initialRangeDays, children,
}: {
  licenseId: number;
  initialPnlDisplay: PnlDisplay;
  initialRangeDays: RangeDays;
  children: React.ReactNode;
}) {
  const [mode, setModeState] = useState<PnlDisplay>(initialPnlDisplay);
  const [range, setRange] = useState<RangeDays>(initialRangeDays);

  // The user_preferences row is the single source of truth, site-wide:
  // update optimistically, persist via the settings server action, revert on
  // failure. (The old per-license localStorage override is gone — stale
  // journal:pnl-display:* keys are simply ignored.)
  const setMode = useCallback((v: PnlDisplay) => {
    if (v === mode) return;
    const prev = mode;
    setModeState(v);
    void updatePnlDisplay(v)
      .then((res) => { if ("error" in res) setModeState(prev); })
      .catch(() => setModeState(prev));
  }, [mode]);

  const value = useMemo<ChromeState>(() => ({
    mode, setMode, range, setRange, licenseId,
  }), [mode, setMode, range, licenseId]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function usePnlDisplay() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("usePnlDisplay must be used inside <JournalChromeProvider>");
  return { mode: ctx.mode, setMode: ctx.setMode };
}

export function useRangeScope() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useRangeScope must be used inside <JournalChromeProvider>");
  return { range: ctx.range, setRange: ctx.setRange };
}
