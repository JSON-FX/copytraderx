"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

export type PropfirmRuleOption = { id: number; name: string };

export function SubscriptionPolicyForm({
  subscriptionId,
  initialPushInterval,
  initialRuleId,
  rules,
}: {
  subscriptionId: number;
  initialPushInterval: number;
  initialRuleId: number | null;
  rules: PropfirmRuleOption[];
}) {
  const [push, setPush] = useState(initialPushInterval);
  const [ruleId, setRuleId] = useState<string>(
    initialRuleId == null ? "none" : String(initialRuleId),
  );
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function onSave(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const res = await fetch(`/api/subscriptions/${subscriptionId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          push_interval_seconds: push,
          propfirm_rule_id: ruleId === "none" ? null : Number(ruleId),
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        toast.error(`Save failed: ${body.error ?? res.statusText}`);
        return;
      }
      toast.success("Policy updated");
      router.refresh();
    });
  }

  return (
    <form onSubmit={onSave} className="grid grid-cols-2 gap-3 mt-3">
      <div className="space-y-1">
        <Label htmlFor={`push-${subscriptionId}`} className="text-xs">
          Push interval (seconds)
        </Label>
        <Input
          id={`push-${subscriptionId}`}
          type="number"
          min={3}
          max={60}
          value={push}
          onChange={(e) => setPush(Number(e.target.value))}
        />
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Propfirm rule</Label>
        <Select value={ruleId} onValueChange={setRuleId}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="none">(none)</SelectItem>
            {rules.map((r) => (
              <SelectItem key={r.id} value={String(r.id)}>{r.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="col-span-2">
        <Button type="submit" size="sm" disabled={isPending}>
          {isPending ? "Saving…" : "Save policy"}
        </Button>
      </div>
    </form>
  );
}
