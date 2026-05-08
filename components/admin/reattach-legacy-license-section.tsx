"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { UserTypeahead, type UserOption } from "./user-typeahead";

export function ReattachLegacyLicenseSection({ licenseId }: { licenseId: number }) {
  const [target, setTarget] = useState<UserOption | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function onSubmit() {
    if (!target) {
      toast.error("Pick a user to reattach to");
      return;
    }
    startTransition(async () => {
      const res = await fetch(`/api/licenses/${licenseId}/reattach`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ target_user_id: target.id }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        toast.error(`Reattach failed: ${body.error ?? res.statusText}`);
        return;
      }
      toast.success("License reattached");
      router.refresh();
    });
  }

  return (
    <section className="border rounded-md p-4 mt-6 bg-amber-50 dark:bg-amber-950/30">
      <h2 className="font-semibold mb-2">Reattach legacy license</h2>
      <p className="text-sm text-muted-foreground mb-3">
        This license currently belongs to the synthetic legacy admin (created during the
        Plan 2 backfill). Pick the real user it should belong to. A new active subscription
        will be created on that user, inheriting the license&rsquo;s expires_at.
      </p>
      <div className="space-y-2">
        <Label>Target user</Label>
        <UserTypeahead value={target} onChange={setTarget} />
      </div>
      <Button onClick={onSubmit} disabled={isPending} className="mt-3">
        {isPending ? "Reattaching…" : "Reattach"}
      </Button>
    </section>
  );
}
