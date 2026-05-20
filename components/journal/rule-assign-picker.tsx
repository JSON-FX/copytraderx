"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { PropfirmRule } from "@/lib/types";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

interface Props {
  subscriptionId: number;
  userRules: PropfirmRule[];
  ownerUserId: string;
  returnTo: string;
  currentRuleId?: number;
}

export function RuleAssignPicker({
  subscriptionId, userRules, ownerUserId, returnTo, currentRuleId,
}: Props) {
  const router = useRouter();
  const [selected, setSelected] = useState<string>(
    currentRuleId != null ? String(currentRuleId) : "",
  );
  const [isPending, startTransition] = useTransition();

  if (userRules.length === 0) {
    const createHref = `/dashboard/propfirm-rules/new?return_to=${encodeURIComponent(returnTo)}`;
    return (
      <div className="space-y-2">
        <p className="text-xs text-muted-foreground">No challenge rule assigned.</p>
        <Link
          href={createHref}
          className="text-xs font-medium text-foreground underline-offset-2 hover:underline"
        >
          Create your first rule →
        </Link>
      </div>
    );
  }

  function onAssign() {
    if (!selected) return;
    startTransition(async () => {
      const res = await fetch(`/api/subscriptions/${subscriptionId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ propfirm_rule_id: Number(selected) }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        toast.error(body.error === "rule_owner_mismatch"
          ? "That rule belongs to a different user."
          : `Assign failed: ${body.error ?? res.statusText}`);
        return;
      }
      toast.success("Rule assigned");
      router.refresh();
    });
  }

  const createHref = `/dashboard/propfirm-rules/new?return_to=${encodeURIComponent(returnTo)}&owner=${encodeURIComponent(ownerUserId)}`;

  return (
    <div className="space-y-2">
      <Select value={selected} onValueChange={setSelected}>
        <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Pick a rule…" /></SelectTrigger>
        <SelectContent>
          {userRules.map((r) => (
            <SelectItem key={r.id} value={String(r.id)}>{r.name}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      <div className="flex items-center justify-between gap-2">
        <Button size="sm" onClick={onAssign} disabled={!selected || isPending}>
          {isPending ? "Assigning…" : "Assign rule"}
        </Button>
        <Link href={createHref} className="text-xs text-muted-foreground underline-offset-2 hover:underline">
          + new rule
        </Link>
      </div>
    </div>
  );
}
