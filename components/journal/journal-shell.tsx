"use client";

import { useJournalPoll } from "@/lib/hooks/use-journal-poll";
import { fetchJson } from "@/lib/utils";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { JournalHeader } from "./journal-header";
import { LiveAccountPanel } from "./live-account-panel";
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

interface Props {
  license: License;
  initialSnapshot: AccountSnapshotCurrent | null;
  initialDaily: AccountSnapshotDaily[];
  initialPositions: Position[];
  initialDeals: Deal[];
  initialOrders: OrderRow[];
  rule: PropfirmRule | null;
}

export function JournalShell(props: Props) {
  const { license } = props;
  const pushIntervalMs = license.push_interval_seconds * 1000;
  const acct = license.mt5_account;

  const snapshot = useJournalPoll<AccountSnapshotCurrent | null>({
    fetcher: () => fetchJson<AccountSnapshotCurrent | null>(`/api/journal/${acct}/snapshot`),
    initialData: props.initialSnapshot,
    pushIntervalMs,
  });
  const positions = useJournalPoll<Position[]>({
    fetcher: () => fetchJson<Position[]>(`/api/journal/${acct}/positions`),
    initialData: props.initialPositions,
    pushIntervalMs,
  });
  const deals = useJournalPoll<Deal[]>({
    fetcher: () => fetchJson<Deal[]>(`/api/journal/${acct}/deals?days=0`),
    initialData: props.initialDeals,
    pushIntervalMs,
    fixedIntervalMs: 30_000,
  });
  const orders = useJournalPoll<OrderRow[]>({
    fetcher: () => fetchJson<OrderRow[]>(`/api/journal/${acct}/orders?days=0`),
    initialData: props.initialOrders,
    pushIntervalMs,
    fixedIntervalMs: 30_000,
  });
  const daily = useJournalPoll<AccountSnapshotDaily[]>({
    fetcher: () => fetchJson<AccountSnapshotDaily[]>(`/api/journal/${acct}/snapshots-daily?days=0`),
    initialData: props.initialDaily,
    pushIntervalMs,
    fixedIntervalMs: 5 * 60_000,
  });

  const currency = snapshot.data?.currency ?? "USD";

  return (
    <div className="mx-auto max-w-6xl space-y-4 px-6 py-6">
      <JournalHeader license={license} pushedAt={snapshot.data?.pushed_at ?? null} />
      <LiveAccountPanel snapshot={snapshot.data} />
      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="trades">Trades</TabsTrigger>
          <TabsTrigger value="calendar">Calendar</TabsTrigger>
          <TabsTrigger value="performance">Performance</TabsTrigger>
          <TabsTrigger value="orders">Orders</TabsTrigger>
          <TabsTrigger value="objectives">Objectives</TabsTrigger>
        </TabsList>
        <TabsContent value="overview"><OverviewTab positions={positions.data} currency={currency} /></TabsContent>
        <TabsContent value="trades"><TradesTab deals={deals.data} currency={currency} /></TabsContent>
        <TabsContent value="calendar"><CalendarTab deals={deals.data} currency={currency} /></TabsContent>
        <TabsContent value="performance"><PerformanceTab deals={deals.data} daily={daily.data} currency={currency} /></TabsContent>
        <TabsContent value="orders"><OrdersTab orders={orders.data} /></TabsContent>
        <TabsContent value="objectives">
          <ObjectivesTab license={license} rule={props.rule} snapshot={snapshot.data} daily={daily.data} currency={currency} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
