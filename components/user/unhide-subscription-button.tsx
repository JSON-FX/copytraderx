"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

export function UnhideSubscriptionButton({
  subscriptionId,
}: {
  subscriptionId: number;
}) {
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  async function unhide() {
    if (busy) return;
    setBusy(true);
    try {
      const r = await fetch(`/api/subscriptions/${subscriptionId}/hide`, {
        method: "DELETE",
      });
      if (!r.ok) {
        const body = await r.json().catch(() => ({}));
        toast.error(body.error ?? "Could not unhide subscription.");
        return;
      }
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button size="sm" variant="ghost" onClick={unhide} disabled={busy}>
      {busy ? "Unhiding…" : "Unhide"}
    </Button>
  );
}
