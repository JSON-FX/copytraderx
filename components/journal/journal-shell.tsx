"use client";

import { useMemo } from "react";
import { useJournalPoll } from "@/lib/hooks/use-journal-poll";
import { filterByRangeDays } from "@/lib/journal/trade-filters";
import { fetchJson } from "@/lib/utils";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { JournalHeader } from "./journal-header";
import { LiveAccountPanel } from "./live-account-panel";
import { JournalToolbar } from "./journal-toolbar";
import { JournalChromeProvider, useRangeScope } from "./preferences/journal-chrome-context";
import { OverviewTab } from "./tabs/overview-tab";
import { TradesTab } from "./tabs/trades-tab";
import { CalendarTab } from "./tabs/calendar-tab";
import { PerformanceTab } from "./tabs/performance-tab";
import { OrdersTab } from "./tabs/orders-tab";
import { ObjectivesTab } from "./tabs/objectives-tab";
import type {
  AccountSnapshotCurrent, AccountSnapshotDaily, Deal, License, OrderRow,
  Position, PropfirmRule,
} from "@/lib/types";
import type { BaselineResult } from "@/lib/journal/baseline";
import type { PnlDisplay } from "@/lib/preferences/server";

interface Props {
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
  licenseId: number;
  ownerUserId: string;
}

export function JournalShell(props: Props) {
  return (
    <JournalChromeProvider
      licenseId={props.license.id}
      initialPnlDisplay={props.baseline.source === null ? "dollar" : props.initialPnlDisplay}
      initialRangeDays={30}
    >
      <Inner {...props} />
    </JournalChromeProvider>
  );
}

function Inner(props: Props) {
  const { license } = props;
  const pushIntervalMs = props.pushIntervalSeconds * 1000;
  const acct = license.mt5_account;
  const { range } = useRangeScope();

  const snapshot = useJournalPoll<AccountSnapshotCurrent | null>({
    fetcher: () => fetchJson<AccountSnapshotCurrent | null>(`/api/journal/${acct}/snapshot`),
    initialData: props.initialSnapshot, pushIntervalMs,
  });
  const positions = useJournalPoll<Position[]>({
    fetcher: () => fetchJson<Position[]>(`/api/journal/${acct}/positions`),
    initialData: props.initialPositions, pushIntervalMs,
  });
  // Polled all-time to match the server-rendered payload — a narrower fetch
  // would wipe out rows the page already showed on the first tick. The Range
  // control narrows the tables client-side instead (see rangedDeals below).
  const deals = useJournalPoll<Deal[]>({
    fetcher: () => fetchJson<Deal[]>(`/api/journal/${acct}/deals?days=0`),
    initialData: props.initialDeals, pushIntervalMs, fixedIntervalMs: 30_000,
  });
  const orders = useJournalPoll<OrderRow[]>({
    fetcher: () => fetchJson<OrderRow[]>(`/api/journal/${acct}/orders?days=0`),
    initialData: props.initialOrders, pushIntervalMs, fixedIntervalMs: 30_000,
  });
  // Daily snapshots are always fetched all-time so the headline KPI cards
  // (Net Return, Max Drawdown, equity sparkline) stay stable across Range
  // changes. Range only scopes the high-volume tables (deals, orders).
  // The volume here is small — ~365 rows per year per account.
  const daily = useJournalPoll<AccountSnapshotDaily[]>({
    fetcher: () => fetchJson<AccountSnapshotDaily[]>(`/api/journal/${acct}/snapshots-daily?days=0`),
    initialData: props.initialDaily, pushIntervalMs, fixedIntervalMs: 5 * 60_000,
  });

  const currency = snapshot.data?.currency ?? "USD";
  const baseline = props.baseline.baseline;

  const rangedDeals = useMemo(
    () => filterByRangeDays(deals.data, range, (d) => d.close_time),
    [deals.data, range],
  );
  const rangedOrders = useMemo(
    () => filterByRangeDays(orders.data, range, (o) => o.time_setup),
    [orders.data, range],
  );

  return (
    <div className="mx-auto max-w-6xl space-y-4 px-6 py-6">
      <JournalHeader license={license} pushedAt={snapshot.data?.pushed_at ?? null} pushIntervalSeconds={props.pushIntervalSeconds} />
      <LiveAccountPanel
          snapshot={snapshot.data}
          deals={rangedDeals}
          daily={daily.data}
          baseline={baseline}
          baselineSource={props.baseline.source}
          product={license.product}
          rule={props.rule}
          ownerRules={props.ownerRules}
          subscriptionId={props.subscriptionId}
          licenseId={props.licenseId}
          ownerUserId={props.ownerUserId}
        />
      <JournalToolbar pushedAt={snapshot.data?.pushed_at ?? null} />
      <Tabs defaultValue="overview">
        <TabsList className="h-11 w-fit gap-1 rounded-lg p-1">
          <TabsTrigger value="overview" className={TAB_CLS}>Overview</TabsTrigger>
          <TabsTrigger value="trades" className={TAB_CLS}>Trades {rangedDeals.length ? <CountPill n={rangedDeals.length} /> : null}</TabsTrigger>
          <TabsTrigger value="calendar" className={TAB_CLS}>Calendar</TabsTrigger>
          <TabsTrigger value="performance" className={TAB_CLS}>Performance</TabsTrigger>
          <TabsTrigger value="orders" className={TAB_CLS}>Orders {rangedOrders.length ? <CountPill n={rangedOrders.length} /> : null}</TabsTrigger>
          <TabsTrigger value="objectives" className={TAB_CLS}>Objectives</TabsTrigger>
        </TabsList>
        <TabsContent value="overview">
          <OverviewTab license={license} rule={props.rule} snapshot={snapshot.data} daily={daily.data} positions={positions.data} deals={rangedDeals} currency={currency} baseline={baseline} />
        </TabsContent>
        <TabsContent value="trades"><TradesTab deals={rangedDeals} currency={currency} baseline={baseline} mt5Account={acct} /></TabsContent>
        <TabsContent value="calendar"><CalendarTab deals={rangedDeals} currency={currency} baseline={baseline} licenseId={license.id} /></TabsContent>
        <TabsContent value="performance"><PerformanceTab deals={rangedDeals} daily={daily.data} currency={currency} baseline={baseline} /></TabsContent>
        <TabsContent value="orders"><OrdersTab orders={rangedOrders} mt5Account={acct} /></TabsContent>
        <TabsContent value="objectives">
          <ObjectivesTab license={license} rule={props.rule} snapshot={snapshot.data} daily={daily.data} currency={currency} baseline={baseline} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

const TAB_CLS = "h-9 flex-none gap-1.5 rounded-md px-4 text-sm font-medium data-[state=active]:font-semibold data-[state=active]:shadow-sm";

function CountPill({ n }: { n: number }) {
  return <span className="rounded-full bg-foreground/10 px-2 py-0.5 text-[11px] font-bold tabular-nums text-muted-foreground">{n}</span>;
}
