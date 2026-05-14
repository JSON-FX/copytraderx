"use client";

import { useMemo, useState, useEffect } from "react";
import Link from "next/link";
import { FileX2 } from "lucide-react";
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
import { DashboardPagination } from "@/components/user/dashboard-pagination";
import { deriveTrialDisplayStatus } from "@/lib/trial-state";
import { PRODUCTS, type Product } from "@/lib/products";
import type { TrialLead, TrialLicense, TrialDisplayStatus } from "@/lib/types";

export type TrialRowDisplay = {
  trial_lead: TrialLead;
  trial_license: TrialLicense;
};

type StatusFilter = "all" | TrialDisplayStatus;
type ProductFilter = "all" | Product;

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100] as const;
const DEFAULT_PAGE_SIZE = 10;

export function TrialTable({ rows }: { rows: TrialRowDisplay[] }) {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [product, setProduct] = useState<ProductFilter>("all");
  const [pageSize, setPageSize] = useState<number>(DEFAULT_PAGE_SIZE);
  const [page, setPage] = useState(1);

  // Reset page when filters change so the user isn't stranded on an empty page.
  useEffect(() => {
    setPage(1);
  }, [search, status, product, pageSize]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter(({ trial_lead: l, trial_license: lic }) => {
      const display = deriveTrialDisplayStatus({
        status: lic.status,
        expires_at: lic.expires_at,
      });
      if (status !== "all" && display !== status) return false;
      if (product !== "all" && lic.product !== product) return false;
      if (q.length === 0) return true;
      return (
        lic.license_key.toLowerCase().includes(q) ||
        l.email.toLowerCase().includes(q) ||
        String(lic.mt5_account).includes(q) ||
        (l.telegram_handle ?? "").toLowerCase().includes(q) ||
        (l.discord_handle ?? "").toLowerCase().includes(q)
      );
    });
  }, [rows, search, status, product]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const paged = useMemo(() => {
    const start = (safePage - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, safePage, pageSize]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Input
          placeholder="Search by key, email, MT5, TG, Discord…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-xs"
        />
        <Select value={status} onValueChange={(v) => setStatus(v as StatusFilter)}>
          <SelectTrigger className="w-[160px]" aria-label="Status filter">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="expired">Expired</SelectItem>
            <SelectItem value="revoked">Revoked</SelectItem>
          </SelectContent>
        </Select>
        <Select value={product} onValueChange={(v) => setProduct(v as ProductFilter)}>
          <SelectTrigger className="w-[200px]" aria-label="Product filter">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All products</SelectItem>
            {PRODUCTS.map((p) => (
              <SelectItem key={p.code} value={p.code}>
                {p.displayName}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="ml-auto text-sm text-muted-foreground">
          {filtered.length} {filtered.length === 1 ? "trial" : "trials"}
          {filtered.length !== rows.length ? ` of ${rows.length}` : ""}
        </div>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>License key</TableHead>
              <TableHead>Product</TableHead>
              <TableHead className="text-right">MT5</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>TG</TableHead>
              <TableHead>Discord</TableHead>
              <TableHead>Expires</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {paged.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={8}
                  className="py-16 text-center text-muted-foreground"
                >
                  <div className="flex flex-col items-center gap-3">
                    <FileX2 className="h-8 w-8 opacity-30" />
                    <span className="text-sm">
                      {rows.length === 0
                        ? "No trial licenses yet. Click + New trial to issue one."
                        : "No trials match your filters."}
                    </span>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              paged.map(({ trial_lead: l, trial_license: lic }) => {
                const display = deriveTrialDisplayStatus({
                  status: lic.status,
                  expires_at: lic.expires_at,
                });
                return (
                  <TableRow key={lic.id}>
                    <TableCell className="font-mono">
                      <Link
                        href={`/admin/trials/${l.id}`}
                        className="hover:underline"
                      >
                        {lic.license_key}
                      </Link>
                    </TableCell>
                    <TableCell>{lic.product}</TableCell>
                    <TableCell className="text-right font-mono">
                      {lic.mt5_account}
                    </TableCell>
                    <TableCell>{l.email}</TableCell>
                    <TableCell>{l.telegram_handle ?? "—"}</TableCell>
                    <TableCell>{l.discord_handle ?? "—"}</TableCell>
                    <TableCell>{lic.expires_at.slice(0, 10)}</TableCell>
                    <TableCell>
                      <span
                        className={
                          display === "active"
                            ? "text-emerald-600"
                            : display === "expired"
                              ? "text-amber-600"
                              : "text-red-600"
                        }
                      >
                        {display}
                      </span>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      <DashboardPagination
        page={safePage}
        totalPages={totalPages}
        onChange={setPage}
        pageSize={pageSize}
        pageSizeOptions={PAGE_SIZE_OPTIONS}
        onPageSizeChange={setPageSize}
      />
    </div>
  );
}
