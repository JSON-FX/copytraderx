"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

export function CancelRequestButton({ subscriptionId }: { subscriptionId: number }) {
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  async function cancel() {
    if (!confirm("Cancel this pending request?")) return;
    setBusy(true);
    try {
      const r = await fetch(`/api/subscriptions/${subscriptionId}`, { method: "DELETE" });
      if (!r.ok) {
        const body = await r.json().catch(() => ({}));
        alert(body.error ?? "Could not cancel.");
        return;
      }
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button size="sm" variant="ghost" onClick={cancel} disabled={busy}>
      {busy ? "Cancelling…" : "Cancel request"}
    </Button>
  );
}
