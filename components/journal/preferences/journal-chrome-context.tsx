"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { PnlDisplay } from "@/lib/preferences/server";

export type PnlDisplaySource = "global" | "override";
export type RangeDays = 7 | 30 | 90 | 0;

interface ChromeState {
  mode: PnlDisplay;
  source: PnlDisplaySource;
  setMode: (v: PnlDisplay) => void;
  range: RangeDays;
  setRange: (v: RangeDays) => void;
  licenseId: number;
}

const Ctx = createContext<ChromeState | null>(null);

function storageKey(licenseId: number) {
  return `journal:pnl-display:${licenseId}`;
}

export function JournalChromeProvider({
  licenseId, initialPnlDisplay, initialRangeDays, children,
}: {
  licenseId: number;
  initialPnlDisplay: PnlDisplay;
  initialRangeDays: RangeDays;
  children: React.ReactNode;
}) {
  const [mode, setModeState] = useState<PnlDisplay>(initialPnlDisplay);
  const [source, setSource] = useState<PnlDisplaySource>("global");
  const [range, setRange] = useState<RangeDays>(initialRangeDays);

  // Hydrate from localStorage on mount.
  useEffect(() => {
    const raw = window.localStorage.getItem(storageKey(licenseId));
    if (raw === "percent" || raw === "dollar") {
      setModeState(raw);
      setSource("override");
    }
  }, [licenseId]);

  const setMode = useCallback((v: PnlDisplay) => {
    setModeState(v);
    setSource("override");
    window.localStorage.setItem(storageKey(licenseId), v);
  }, [licenseId]);

  const value = useMemo<ChromeState>(() => ({
    mode, source, setMode, range, setRange, licenseId,
  }), [mode, source, setMode, range, licenseId]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function usePnlDisplay() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("usePnlDisplay must be used inside <JournalChromeProvider>");
  return { mode: ctx.mode, setMode: ctx.setMode, source: ctx.source };
}

export function useRangeScope() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useRangeScope must be used inside <JournalChromeProvider>");
  return { range: ctx.range, setRange: ctx.setRange };
}
