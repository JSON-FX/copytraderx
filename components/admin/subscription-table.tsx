"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { format, parseISO } from "date-fns";
import { ChevronDown, ChevronRight, EyeOff } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DashboardPagination } from "@/components/user/dashboard-pagination";
import {
  ADMIN_SUBS_PAGE_SIZE_DEFAULT,
  ADMIN_SUBS_PAGE_SIZE_OPTIONS,
  type AdminSubsPageSize,
} from "@/lib/dashboard-filters";
import {
  getAdminSubsPageSize,
  setAdminSubsPageSize,
} from "@/lib/admin-settings";
import {
  filterRows,
  groupByUser,
  paginateGroups,
  summarizeStatuses,
  type AdminLicenseSlot,
  type AdminSubscriptionRow,
  type AdminSubsFilterState,
  type AdminUserGroup,
  type StatusCounts,
} from "@/lib/admin-subscriptions";
import { PRODUCT_CODES } from "@/lib/products";
import { productLabel, tierLabel } from "@/lib/users";
import type { SubscriptionStatus } from "@/lib/types";

const STATUS_OPTIONS: SubscriptionStatus[] = [
  "active",
  "pending",
  "expired",
  "rejected",
  "revoked",
];

const STATUS_BADGE: Record<SubscriptionStatus, string> = {
  active: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  pending: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  expired: "bg-muted text-muted-foreground",
  rejected: "bg-rose-500/15 text-rose-700 dark:text-rose-300",
  revoked: "bg-rose-500/15 text-rose-700 dark:text-rose-300",
};

function SlotCell({ slot, kind }: { slot: AdminLicenseSlot | null; kind: "LIVE" | "DEMO" }) {
  if (!slot) {
    return <span className="text-xs text-muted-foreground">— no {kind.toLowerCase()} slot —</span>;
  }
  return (
    <Link
      href={`/admin/licenses/${slot.id}`}
      className="flex items-center gap-2 font-mono text-xs hover:underline"
    >
      <span
        className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
          kind === "LIVE"
            ? "bg-sky-500/15 text-sky-700 dark:text-sky-300"
            : "bg-muted text-muted-foreground"
        }`}
      >
        {kind}
      </span>
      <span>{slot.mt5_account}</span>
      {slot.broker_name && <span className="text-muted-foreground">· {slot.broker_name}</span>}
    </Link>
  );
}

export function SubscriptionTable({ rows }: { rows: AdminSubscriptionRow[] }) {
  const [filter, setFilter] = useState<AdminSubsFilterState>({
    search: "",
    statuses: [],
    products: [],
  });
  const [pageSize, setPageSize] = useState<number>(ADMIN_SUBS_PAGE_SIZE_DEFAULT);
  const [page, setPage] = useState(1);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  useEffect(() => {
    setPageSize(getAdminSubsPageSize());
  }, []);

  // Reset to page 1 whenever filters change.
  useEffect(() => {
    setPage(1);
  }, [filter.search, filter.statuses, filter.products, pageSize]);

  const filtered = useMemo(() => filterRows(rows, filter), [rows, filter]);
  const groups = useMemo(() => groupByUser(filtered), [filtered]);
  const paged = useMemo(
    () => paginateGroups(groups, { page, pageSize }),
    [groups, page, pageSize],
  );
  const subsOnPage = useMemo(
    () => paged.groups.reduce((sum, g) => sum + g.subscriptions.length, 0),
    [paged],
  );

  function toggleStatus(s: SubscriptionStatus) {
    setFilter((f) => ({
      ...f,
      statuses: f.statuses.includes(s) ? f.statuses.filter((x) => x !== s) : [...f.statuses, s],
    }));
  }

  function toggleCollapsed(userId: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  }

  function onPageSizeChange(size: number) {
    setPageSize(size);
    setAdminSubsPageSize(size as AdminSubsPageSize);
  }

  const rangeStart = paged.totalGroups === 0 ? 0 : (paged.page - 1) * pageSize + 1;
  const rangeEnd = Math.min(paged.page * pageSize, paged.totalGroups);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          placeholder="Search by email, name, product, or MT5…"
          className="flex-1 min-w-[240px]"
          value={filter.search}
          onChange={(e) => setFilter({ ...filter, search: e.target.value })}
        />
        <Select
          value={filter.statuses[0] ?? "all"}
          onValueChange={(v) =>
            setFilter({ ...filter, statuses: v === "all" ? [] : [v as SubscriptionStatus] })
          }
        >
          <SelectTrigger className="w-[140px]" aria-label="Status filter">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {STATUS_OPTIONS.map((s) => (
              <SelectItem key={s} value={s} onClick={() => toggleStatus(s)}>
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={filter.products[0] ?? "all"}
          onValueChange={(v) =>
            setFilter({
              ...filter,
              products: v === "all" ? [] : [v as (typeof PRODUCT_CODES)[number]],
            })
          }
        >
          <SelectTrigger className="w-[160px]" aria-label="Product filter">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All products</SelectItem>
            {PRODUCT_CODES.map((p) => (
              <SelectItem key={p} value={p}>
                {productLabel(p)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="rounded-md border">
        <table className="w-full text-sm">
          <thead className="border-b text-xs text-muted-foreground">
            <tr>
              <th className="w-8 px-2 py-2"></th>
              <th className="px-2 py-2 text-left">Status</th>
              <th className="px-2 py-2 text-left">Product · Tier</th>
              <th className="px-2 py-2 text-left">MT5 slots</th>
              <th className="px-2 py-2 text-left">Expires</th>
            </tr>
          </thead>
          <tbody>
            {paged.groups.length === 0 && (
              <tr>
                <td colSpan={5} className="px-2 py-6 text-center text-muted-foreground">
                  No subscriptions match the current filters.
                </td>
              </tr>
            )}
            {paged.groups.map((group) => {
              const isCollapsed = collapsed.has(group.user_id);
              const counts = summarizeStatuses(group.subscriptions);
              return (
                <GroupRows
                  key={group.user_id}
                  group={group}
                  isCollapsed={isCollapsed}
                  counts={counts}
                  onToggle={() => toggleCollapsed(group.user_id)}
                />
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between gap-3 pt-2 text-xs text-muted-foreground">
        <span>
          {paged.totalGroups === 0
            ? "No users to show"
            : `Showing users ${rangeStart}–${rangeEnd} of ${paged.totalGroups} · ${subsOnPage} subscription${
                subsOnPage === 1 ? "" : "s"
              } on this page`}
        </span>
        <DashboardPagination
          page={paged.page}
          totalPages={paged.totalPages}
          onChange={setPage}
          pageSize={pageSize}
          pageSizeOptions={ADMIN_SUBS_PAGE_SIZE_OPTIONS}
          onPageSizeChange={onPageSizeChange}
        />
      </div>
    </div>
  );
}

function GroupRows({
  group,
  isCollapsed,
  counts,
  onToggle,
}: {
  group: AdminUserGroup;
  isCollapsed: boolean;
  counts: StatusCounts;
  onToggle: () => void;
}) {
  const chips: { label: string; n: number; cls: string }[] = [
    { label: "active", n: counts.active, cls: STATUS_BADGE.active },
    { label: "pending", n: counts.pending, cls: STATUS_BADGE.pending },
    { label: "expired", n: counts.expired, cls: STATUS_BADGE.expired },
    { label: "rejected", n: counts.rejected, cls: STATUS_BADGE.rejected },
    { label: "revoked", n: counts.revoked, cls: STATUS_BADGE.revoked },
  ].filter((c) => c.n > 0);

  return (
    <>
      <tr className="border-t bg-muted/40">
        <td className="px-2 py-2">
          <button
            type="button"
            onClick={onToggle}
            aria-label={isCollapsed ? "Expand group" : "Collapse group"}
            className="text-muted-foreground hover:text-foreground"
          >
            {isCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
        </td>
        <td colSpan={4} className="px-2 py-2">
          <div className="flex items-center justify-between gap-2">
            <div>
              <Link href={`/admin/users/${group.user_id}`} className="font-medium hover:underline">
                {group.user_email}
              </Link>
              <span className="ml-2 text-xs text-muted-foreground">
                {group.user_full_name ? `${group.user_full_name} · ` : ""}
                {group.subscriptions.length}{" "}
                {group.subscriptions.length === 1 ? "subscription" : "subscriptions"}
              </span>
            </div>
            <div className="flex items-center gap-1">
              {chips.map((c) => (
                <span key={c.label} className={`rounded-full px-2 py-0.5 text-[11px] ${c.cls}`}>
                  {c.n} {c.label}
                </span>
              ))}
            </div>
          </div>
        </td>
      </tr>
      {!isCollapsed &&
        group.subscriptions.map((sub) => (
          <tr key={sub.id} className="border-t">
            <td className="px-2 py-2"></td>
            <td className="px-2 py-2">
              <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_BADGE[sub.status]}`}>
                {sub.status}
              </span>
              {sub.hidden_at && (
                <EyeOff className="ml-1 inline h-3 w-3 text-muted-foreground" aria-label="Hidden by user" />
              )}
            </td>
            <td className="px-2 py-2">
              <span className="font-medium">{productLabel(sub.product)}</span>{" "}
              <span className="text-xs text-muted-foreground">· {tierLabel(sub.tier)}</span>
            </td>
            <td className="px-2 py-2 space-y-1">
              <SlotCell slot={sub.live_license} kind="LIVE" />
              <SlotCell slot={sub.demo_license} kind="DEMO" />
            </td>
            <td className="px-2 py-2 text-xs">
              {sub.expires_at ? format(parseISO(sub.expires_at), "yyyy-MM-dd") : "—"}
            </td>
          </tr>
        ))}
    </>
  );
}
