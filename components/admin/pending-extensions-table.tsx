"use client";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { RejectExtensionDialog } from "./reject-extension-dialog";

export type PendingExtensionRow = {
  id: number;
  user_email: string;
  user_full_name: string | null;
  product_label: string;
  source_tier: string;
  source_expires_at: string | null;
  requested_tier: string;
  notes: string | null;
  requested_at: string;
};

export function PendingExtensionsTable({ rows }: { rows: PendingExtensionRow[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function approve(id: number) {
    startTransition(async () => {
      const res = await fetch(`/api/extensions/${id}/approve`, { method: "POST" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        toast.error(`Approve failed: ${body.error ?? res.statusText}`);
        return;
      }
      toast.success("Extension approved");
      router.refresh();
    });
  }

  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground">No pending extensions.</p>;
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>User</TableHead>
          <TableHead>Product</TableHead>
          <TableHead>Current</TableHead>
          <TableHead>Requested</TableHead>
          <TableHead>Submitted</TableHead>
          <TableHead>Notes</TableHead>
          <TableHead className="text-right">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r) => (
          <TableRow key={r.id}>
            <TableCell>
              <div>{r.user_full_name ?? "—"}</div>
              <div className="text-xs text-muted-foreground">{r.user_email}</div>
            </TableCell>
            <TableCell>{r.product_label}</TableCell>
            <TableCell>
              <div>{r.source_tier}</div>
              <div className="text-xs text-muted-foreground">
                {r.source_expires_at ? `expires ${new Date(r.source_expires_at).toLocaleDateString()}` : "—"}
              </div>
            </TableCell>
            <TableCell className="font-medium">{r.requested_tier}</TableCell>
            <TableCell>{new Date(r.requested_at).toLocaleString()}</TableCell>
            <TableCell className="max-w-[24ch] truncate">{r.notes ?? "—"}</TableCell>
            <TableCell className="text-right space-x-2">
              <Button size="sm" onClick={() => approve(r.id)} disabled={isPending}>Approve</Button>
              <RejectExtensionDialog extensionId={r.id} />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
