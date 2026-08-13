// lib/hooks/use-account-context.tsx
"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import { useJournalPoll } from "@/lib/hooks/use-journal-poll";
import { filterByRangeDays } from "@/lib/journal/trade-filters";
import { fetchJson } from "@/lib/utils";
import type {
  AccountSnapshotCurrent, AccountSnapshotDaily,
  Deal, License, OrderRow, Position, PropfirmRule,
} from "@/lib/types";
import type { BaselineResult } from "@/lib/journal/baseline";
import type { PnlDisplay } from "@/lib/preferences/server";
import { JournalChromeProvider, useRangeScope } from "@/components/journal/preferences/journal-chrome-context";

interface AccountContextValue {
  license: License;
  snapshot: AccountSnapshotCurrent | null;
  positions: Position[];
  /** Full closed-trade history — what the journal, calendar and performance views read. */
  deals: Deal[];
  /** `deals` narrowed to the dashboard's Range selector. Dashboard KPIs only. */
  dealsInRange: Deal[];
  orders: OrderRow[];
  daily: AccountSnapshotDaily[];
  rule: PropfirmRule | null;
  ownerRules: PropfirmRule[];
  baseline: BaselineResult;
  currency: string;
  subscriptionId: number;
  ownerUserId: string;
}

const AccountContext = createContext<AccountContextValue | null>(null);

export function useAccountContext(): AccountContextValue {
  const ctx = useContext(AccountContext);
  if (!ctx) throw new Error("useAccountContext must be used inside AccountProvider");
  return ctx;
}

interface ProviderProps {
  license: License;
  initialSnapshot: AccountSnapshotCurrent | null;
  initialDaily: AccountSnapshotDaily[];
  initialPositions: Position[];
  initialDeals: Deal[];
  initialOrders: OrderRow[];
  rule: PropfirmRule | null;
  pushIntervalSeconds: number;
  baseline: BaselineResult;
  initialPnlDisplay: PnlDisplay;
  ownerRules: PropfirmRule[];
  subscriptionId: number;
  ownerUserId: string;
  children: ReactNode;
}

export function AccountProvider(props: ProviderProps) {
  return (
    <JournalChromeProvider
      licenseId={props.license.id}
      initialPnlDisplay={props.baseline.source === null ? "dollar" : props.initialPnlDisplay}
      initialRangeDays={30}
    >
      <InnerProvider {...props} />
    </JournalChromeProvider>
  );
}

function InnerProvider({ children, ...props }: ProviderProps) {
  const pushIntervalMs = props.pushIntervalSeconds * 1000;
  const acct = props.license.mt5_account;
  const { range } = useRangeScope();

  const snapshot = useJournalPoll<AccountSnapshotCurrent | null>({
    fetcher: () => fetchJson(`/api/journal/${acct}/snapshot`),
    initialData: props.initialSnapshot, pushIntervalMs,
  });
  const positions = useJournalPoll<Position[]>({
    fetcher: () => fetchJson(`/api/journal/${acct}/positions`),
    initialData: props.initialPositions, pushIntervalMs,
  });
  // Deals and orders are polled all-time to match what the account layout
  // server-renders. Anything narrower and the first poll would delete rows the
  // page had already painted — the Range selector scopes them client-side below.
  const deals = useJournalPoll<Deal[]>({
    fetcher: () => fetchJson(`/api/journal/${acct}/deals?days=0`),
    initialData: props.initialDeals, pushIntervalMs, fixedIntervalMs: 30_000,
  });
  const orders = useJournalPoll<OrderRow[]>({
    fetcher: () => fetchJson(`/api/journal/${acct}/orders?days=0`),
    initialData: props.initialOrders, pushIntervalMs, fixedIntervalMs: 30_000,
  });
  const daily = useJournalPoll<AccountSnapshotDaily[]>({
    fetcher: () => fetchJson(`/api/journal/${acct}/snapshots-daily?days=0`),
    initialData: props.initialDaily, pushIntervalMs, fixedIntervalMs: 5 * 60_000,
  });

  const dealsInRange = useMemo(
    () => filterByRangeDays(deals.data, range, (d) => d.close_time),
    [deals.data, range],
  );

  const value: AccountContextValue = {
    license: props.license,
    snapshot: snapshot.data,
    positions: positions.data,
    deals: deals.data,
    dealsInRange,
    orders: orders.data,
    daily: daily.data,
    rule: props.rule,
    ownerRules: props.ownerRules,
    baseline: props.baseline,
    currency: snapshot.data?.currency ?? "USD",
    subscriptionId: props.subscriptionId,
    ownerUserId: props.ownerUserId,
  };

  return <AccountContext value={value}>{children}</AccountContext>;
}
