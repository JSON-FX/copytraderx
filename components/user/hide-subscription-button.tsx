"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

export function HideSubscriptionButton({
  subscriptionId,
}: {
  subscriptionId: number;
}) {
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  async function hide() {
    if (busy) return;
    setBusy(true);
    try {
      const r = await fetch(`/api/subscriptions/${subscriptionId}/hide`, {
        method: "POST",
      });
      if (!r.ok) {
        const body = await r.json().catch(() => ({}));
        toast.error(body.error ?? "Could not hide subscription.");
        return;
      }
      toast.success("Hidden. Click 'Show hidden' in the Past section to bring it back.");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button size="sm" variant="ghost" onClick={hide} disabled={busy}>
      {busy ? "Hiding…" : "Hide"}
    </Button>
  );
}
