"use client";

import { useJournalPoll } from "@/lib/hooks/use-journal-poll";
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
  const days = range === 0 ? 0 : range;

  const snapshot = useJournalPoll<AccountSnapshotCurrent | null>({
    fetcher: () => fetchJson<AccountSnapshotCurrent | null>(`/api/journal/${acct}/snapshot`),
    initialData: props.initialSnapshot, pushIntervalMs,
  });
  const positions = useJournalPoll<Position[]>({
    fetcher: () => fetchJson<Position[]>(`/api/journal/${acct}/positions`),
    initialData: props.initialPositions, pushIntervalMs,
  });
  const deals = useJournalPoll<Deal[]>({
    fetcher: () => fetchJson<Deal[]>(`/api/journal/${acct}/deals?days=${days}`),
    initialData: props.initialDeals, pushIntervalMs, fixedIntervalMs: 30_000,
    deps: [days],
  });
  const orders = useJournalPoll<OrderRow[]>({
    fetcher: () => fetchJson<OrderRow[]>(`/api/journal/${acct}/orders?days=${days}`),
    initialData: props.initialOrders, pushIntervalMs, fixedIntervalMs: 30_000,
    deps: [days],
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

  return (
    <div className="mx-auto max-w-6xl space-y-4 px-6 py-6">
      <JournalHeader license={license} pushedAt={snapshot.data?.pushed_at ?? null} pushIntervalSeconds={props.pushIntervalSeconds} />
      <LiveAccountPanel snapshot={snapshot.data} deals={deals.data} baseline={baseline} baselineSource={props.baseline.source} />
      <JournalToolbar pushedAt={snapshot.data?.pushed_at ?? null} />
      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="trades">Trades {deals.data.length ? <CountPill n={deals.data.length} /> : null}</TabsTrigger>
          <TabsTrigger value="calendar">Calendar</TabsTrigger>
          <TabsTrigger value="performance">Performance</TabsTrigger>
          <TabsTrigger value="orders">Orders {orders.data.length ? <CountPill n={orders.data.length} /> : null}</TabsTrigger>
          <TabsTrigger value="objectives">Objectives</TabsTrigger>
        </TabsList>
        <TabsContent value="overview">
          <OverviewTab license={license} rule={props.rule} snapshot={snapshot.data} daily={daily.data} positions={positions.data} deals={deals.data} currency={currency} baseline={baseline} />
        </TabsContent>
        <TabsContent value="trades"><TradesTab deals={deals.data} currency={currency} baseline={baseline} /></TabsContent>
        <TabsContent value="calendar"><CalendarTab deals={deals.data} currency={currency} baseline={baseline} /></TabsContent>
        <TabsContent value="performance"><PerformanceTab deals={deals.data} daily={daily.data} currency={currency} baseline={baseline} /></TabsContent>
        <TabsContent value="orders"><OrdersTab orders={orders.data} /></TabsContent>
        <TabsContent value="objectives">
          <ObjectivesTab license={license} rule={props.rule} snapshot={snapshot.data} daily={daily.data} currency={currency} baseline={baseline} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function CountPill({ n }: { n: number }) {
  return <span className="ml-1 rounded bg-muted px-1.5 py-0.5 text-[10px] font-bold tabular-nums text-muted-foreground">{n}</span>;
}
