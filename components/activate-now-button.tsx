"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "./confirm-dialog";
import type { LicenseTier } from "@/lib/types";
import { calculateExpiresAt, formatExpiry } from "@/lib/expiry";

export function ActivateNowButton({
  licenseId,
  tier,
}: {
  licenseId: number;
  tier: LicenseTier;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const previewExpiry = formatExpiry(
    calculateExpiresAt(tier, new Date()).toISOString(),
  );

  async function activate() {
    setSubmitting(true);
    const res = await fetch(`/api/licenses/${licenseId}/activate`, {
      method: "POST",
    });
    setSubmitting(false);

    if (!res.ok) {
      const text = await res.text();
      toast.error(`Activation failed: ${text}`);
      return;
    }
    toast.success("License activated");
    router.refresh();
  }

  return (
    <>
      <Button
        type="button"
        size="sm"
        onClick={() => setOpen(true)}
        disabled={submitting}
      >
        Activate now
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title="Start the subscription clock?"
        description={`This will set activated_at to now and expires_at to ${previewExpiry}. Use this only if the customer has activated the EA elsewhere or you want to start the clock manually.`}
        confirmLabel="Activate"
        onConfirm={activate}
      />
    </>
  );
}
