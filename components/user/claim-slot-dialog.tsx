"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

const ERROR_COPY: Record<string, string> = {
  slot_already_claimed: "This slot is already claimed.",
  mt5_already_in_use_for_product: "This MT5 account already holds a license for this product.",
  subscription_not_active: "This subscription is not active.",
  not_found: "Subscription not found.",
};

export function ClaimSlotDialog({
  subscriptionId,
  intendedType,
  productDisplay,
}: {
  subscriptionId: number;
  intendedType: "live" | "demo";
  productDisplay: string;
}) {
  const [open, setOpen] = useState(false);
  const [mt5, setMt5] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const n = Number(mt5);
    if (!Number.isInteger(n) || n <= 0) {
      setError("MT5 account must be a positive integer.");
      return;
    }
    setBusy(true);
    try {
      const r = await fetch("/api/licenses/claim", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          subscription_id: subscriptionId,
          mt5_account: n,
          intended_account_type: intendedType,
        }),
      });
      if (!r.ok) {
        const body = await r.json().catch(() => ({}));
        setError(ERROR_COPY[body.error] ?? body.error ?? "Could not claim slot.");
        return;
      }
      setOpen(false);
      setMt5("");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">Add MT5 account</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Claim {intendedType} slot</DialogTitle>
          <DialogDescription>
            <span className="font-semibold">{productDisplay}</span> — {intendedType} account.
            Enter the MT5 account number you want this license bound to.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="mt5">MT5 account</Label>
            <Input
              id="mt5"
              inputMode="numeric"
              value={mt5}
              onChange={(e) => setMt5(e.target.value)}
              autoFocus
              required
            />
          </div>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? "Claiming…" : "Claim slot"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
