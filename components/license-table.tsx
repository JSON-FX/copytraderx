"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MoreHorizontal, Plus, Copy, FileX2 } from "lucide-react";
import { LivenessBadge } from "./liveness-badge";
import { TierBadge } from "./tier-badge";
import { ConfirmDialog } from "./confirm-dialog";
import { formatExpiry, isExpired } from "@/lib/expiry";
import { deriveLiveness } from "@/lib/liveness";
import type { License, LivenessState } from "@/lib/types";

type Filter = "all" | LivenessState;

export function LicenseTable({ licenses }: { licenses: License[] }) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");

  const [revokeTarget, setRevokeTarget] = useState<License | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<License | null>(null);

  const now = useMemo(() => new Date(), [licenses]);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return licenses
      .map((l) => ({ license: l, state: deriveLiveness(l, now) }))
      .filter(({ license, state }) => {
        if (filter !== "all" && state !== filter) return false;
        if (q.length === 0) return true;
        return (
          license.license_key.toLowerCase().includes(q) ||
          (license.customer_email ?? "").toLowerCase().includes(q)
        );
      });
  }, [licenses, search, filter, now]);

  async function patchLicense(id: number, body: object, msg: string) {
    const res = await fetch(`/api/licenses/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      toast.error("Failed: " + (await res.text()));
      return;
    }
    toast.success(msg);
    router.refresh();
  }

  async function deleteLicense(id: number) {
    const res = await fetch(`/api/licenses/${id}`, { method: "DELETE" });
    if (!res.ok) {
      toast.error("Delete failed: " + (await res.text()));
      return;
    }
    toast.success("License deleted");
    router.refresh();
  }

  function copyKey(key: string) {
    navigator.clipboard.writeText(key);
    toast.success("Key copied");
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center gap-3">
        <Input
          placeholder="Search by key or email…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-xs"
        />
        <Select value={filter} onValueChange={(v) => setFilter(v as Filter)}>
          <SelectTrigger className="w-[160px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="online">Online</SelectItem>
            <SelectItem value="stale">Stale</SelectItem>
            <SelectItem value="offline">Offline</SelectItem>
            <SelectItem value="not_activated">Not activated</SelectItem>
            <SelectItem value="expired">Expired</SelectItem>
            <SelectItem value="revoked">Revoked</SelectItem>
          </SelectContent>
        </Select>
        <div className="flex-1" />
        <Button asChild>
          <Link href="/licenses/new">
            <Plus className="mr-2 h-4 w-4" />
            New License
          </Link>
        </Button>
      </div>

      {/* Table */}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[180px]">Status</TableHead>
              <TableHead>License Key</TableHead>
              <TableHead className="text-right">MT5 Account</TableHead>
              <TableHead>Tier</TableHead>
              <TableHead>Customer Email</TableHead>
              <TableHead>Expires</TableHead>
              {/* Actions column — narrow, no label */}
              <TableHead className="w-[52px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={7}
                  className="py-16 text-center text-muted-foreground"
                >
                  <div className="flex flex-col items-center gap-3">
                    <FileX2 className="h-8 w-8 opacity-30" />
                    <span className="text-sm">
                      {licenses.length === 0
                        ? "No licenses yet. Create your first one."
                        : "No licenses match your filters."}
                    </span>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              rows.map(({ license: l, state }) => {
                const isPastExpiry = isExpired(l.expires_at);
                const isRevoked = l.status === "revoked";
                const lastValidated = l.last_validated_at
                  ? formatDistanceToNow(new Date(l.last_validated_at), {
                      addSuffix: true,
                    })
                  : null;
                return (
                  <TableRow key={l.id} className="group">
                    {/* Status — liveness badge + relative-time hint */}
                    <TableCell className="py-3">
                      <div className="flex flex-col gap-0.5">
                        <LivenessBadge state={state} />
                        {lastValidated && (
                          <span className="text-xs text-muted-foreground">
                            {lastValidated}
                          </span>
                        )}
                      </div>
                    </TableCell>

                    {/* License key — click-to-copy chip */}
                    <TableCell className="py-3">
                      <button
                        type="button"
                        onClick={() => copyKey(l.license_key)}
                        className="inline-flex items-center gap-1.5 rounded px-1.5 py-0.5 font-mono text-xs transition-colors hover:bg-muted"
                        title="Click to copy"
                      >
                        {l.license_key}
                        <Copy className="h-3 w-3 text-muted-foreground" />
                      </button>
                    </TableCell>

                    {/* MT5 account */}
                    <TableCell className="py-3 text-right tabular-nums text-sm">
                      {l.mt5_account}
                    </TableCell>

                    {/* Tier */}
                    <TableCell className="py-3">
                      <TierBadge tier={l.tier} />
                    </TableCell>

                    {/* Customer email */}
                    <TableCell className="py-3 text-sm">
                      {l.customer_email ?? (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>

                    {/* Expires — tinted cell when past expiry */}
                    <TableCell
                      className={`py-3 text-sm tabular-nums${
                        isPastExpiry
                          ? " bg-red-50 font-medium text-red-600 dark:bg-red-950/20 dark:text-red-400"
                          : ""
                      }`}
                    >
                      {formatExpiry(l.expires_at)}
                    </TableCell>

                    {/* Row actions — appear on hover */}
                    <TableCell className="py-3">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100"
                          >
                            <MoreHorizontal className="h-4 w-4" />
                            <span className="sr-only">Open actions</span>
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem asChild>
                            <Link href={`/licenses/${l.id}`}>Edit</Link>
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            disabled={isRevoked}
                            onClick={() =>
                              patchLicense(
                                l.id,
                                { action: "renew", tier: "monthly" },
                                "Renewed monthly",
                              )
                            }
                          >
                            Renew Monthly
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            disabled={isRevoked}
                            onClick={() =>
                              patchLicense(
                                l.id,
                                { action: "renew", tier: "quarterly" },
                                "Renewed quarterly",
                              )
                            }
                          >
                            Renew Quarterly
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            disabled={isRevoked}
                            onClick={() =>
                              patchLicense(
                                l.id,
                                { action: "renew", tier: "yearly" },
                                "Renewed yearly",
                              )
                            }
                          >
                            Renew Yearly
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            disabled={isRevoked}
                            onClick={() => setRevokeTarget(l)}
                          >
                            Revoke
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="text-red-600 focus:text-red-600 dark:text-red-400 dark:focus:text-red-400"
                            onClick={() => setDeleteTarget(l)}
                          >
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {/* Revoke confirm — single-click */}
      <ConfirmDialog
        open={revokeTarget !== null}
        onOpenChange={(o) => !o && setRevokeTarget(null)}
        title="Revoke license?"
        description="This will block the EA from trading on the customer's account. They can be re-activated later."
        confirmLabel="Revoke"
        destructive
        onConfirm={() => {
          if (revokeTarget) {
            return patchLicense(
              revokeTarget.id,
              { status: "revoked" },
              "License revoked",
            );
          }
        }}
      />

      {/* Delete confirm — type to confirm */}
      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
        title="Permanently delete this license?"
        description="This cannot be undone. Use Revoke instead unless you really mean to remove all trace of this license."
        typeToConfirm="DELETE"
        confirmLabel="Delete forever"
        destructive
        onConfirm={() => {
          if (deleteTarget) {
            return deleteLicense(deleteTarget.id);
          }
        }}
      />
    </div>
  );
}
