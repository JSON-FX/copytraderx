"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { formatExpiry } from "@/lib/expiry";
import type { SubscriptionExtension } from "@/lib/types";

export function ExtensionStatusLine({
  extension,
}: {
  extension: SubscriptionExtension;
}) {
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  async function cancel() {
    if (busy) return;
    setBusy(true);
    try {
      const r = await fetch(`/api/extensions/${extension.id}`, { method: "DELETE" });
      if (!r.ok) {
        const body = await r.json().catch(() => ({}));
        alert(`Could not cancel: ${body.error ?? r.statusText}`);
        return;
      }
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-3 flex items-center justify-between rounded-md border border-dashed p-3 text-sm">
      <div className="text-muted-foreground">
        Extension pending — <span className="font-medium">{extension.requested_tier}</span> — submitted {formatExpiry(extension.requested_at)}
      </div>
      <Button size="sm" variant="ghost" onClick={cancel} disabled={busy}>
        {busy ? "Cancelling…" : "Cancel"}
      </Button>
    </div>
  );
}
