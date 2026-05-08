"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { tierRank } from "@/lib/subscription-state";
import type { LicenseTier } from "@/lib/types";

const TIER_OPTIONS: { value: LicenseTier; label: string }[] = [
  { value: "monthly", label: "Monthly" },
  { value: "quarterly", label: "Quarterly" },
  { value: "yearly", label: "Yearly" },
];

export function ExtendDialog({
  sourceSubscriptionId,
  productDisplay,
  sourceTier,
  disabled = false,
}: {
  sourceSubscriptionId: number;
  productDisplay: string;
  sourceTier: LicenseTier;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [tier, setTier] = useState<LicenseTier>(sourceTier);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const allowedTiers = useMemo(
    () => TIER_OPTIONS.filter((t) => tierRank[t.value] >= tierRank[sourceTier]),
    [sourceTier],
  );

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const r = await fetch("/api/extensions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          subscription_id: sourceSubscriptionId,
          requested_tier: tier,
          notes: notes.trim() ? notes.trim() : undefined,
        }),
      });
      if (!r.ok) {
        const body = await r.json().catch(() => ({}));
        if (body.error === "extension_already_pending") {
          setError("You already have a pending extension. Cancel it first from the card.");
        } else {
          setError(body.error ?? "Could not submit extension.");
        }
        return;
      }
      setOpen(false);
      setNotes("");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" disabled={disabled}>Extend</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Extend {productDisplay}</DialogTitle>
          <DialogDescription>
            Extend the existing subscription in place. Your slots and licenses are preserved.
            You can keep the same tier or upgrade — downgrades are not allowed.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div className="space-y-1.5">
            <Label>Product</Label>
            <p className="text-sm font-medium">{productDisplay}</p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="tier">Tier</Label>
            <Select value={tier} onValueChange={(v) => setTier(v as LicenseTier)}>
              <SelectTrigger id="tier"><SelectValue /></SelectTrigger>
              <SelectContent>
                {allowedTiers.map((t) => (
                  <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="notes">Notes (optional)</Label>
            <Textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
            />
          </div>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? "Submitting…" : "Submit extension"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
