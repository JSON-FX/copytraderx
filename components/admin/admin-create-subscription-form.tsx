"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { UserTypeahead, type UserOption } from "./user-typeahead";

export type PropfirmRuleOption = { id: number; name: string };

const PRODUCTS = [
  { code: "impulse", label: "Impulse" },
  { code: "ctx-core", label: "CTX Core" },
  { code: "ctx-live", label: "CTX Live" },
  { code: "ctx-prop-passer", label: "CTX Prop Passer" },
  { code: "ctx-prop-funded", label: "CTX Prop Funded" },
] as const;

const TIERS = [
  { code: "monthly", label: "Monthly" },
  { code: "quarterly", label: "Quarterly" },
  { code: "yearly", label: "Yearly" },
] as const;

export function AdminCreateSubscriptionForm({ rules }: { rules: PropfirmRuleOption[] }) {
  const router = useRouter();
  const [user, setUser] = useState<UserOption | null>(null);
  const [product, setProduct] = useState<string>("impulse");
  const [tier, setTier] = useState<string>("monthly");
  const [pushInterval, setPushInterval] = useState<number>(10);
  const [ruleId, setRuleId] = useState<string>("none");
  const [notes, setNotes] = useState<string>("");
  const [sendEmail, setSendEmail] = useState<boolean>(true);
  const [isPending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!user) {
      toast.error("Please pick a user");
      return;
    }
    startTransition(async () => {
      const res = await fetch("/api/subscriptions/admin-create", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          user_id: user.id,
          product,
          tier,
          push_interval_seconds: pushInterval,
          propfirm_rule_id: ruleId === "none" ? null : Number(ruleId),
          notes: notes.trim() === "" ? null : notes,
          send_grant_email: sendEmail,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        toast.error(`Create failed: ${body.error ?? res.statusText}`);
        return;
      }
      toast.success("Subscription created");
      router.push(`/admin/users/${user.id}`);
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-6 max-w-xl">
      <div className="space-y-2">
        <Label>User</Label>
        <UserTypeahead value={user} onChange={setUser} />
        <p className="text-xs text-muted-foreground">
          <a href="/admin/users/new" target="_blank" rel="noreferrer" className="underline">
            Create new user in another tab
          </a>
        </p>
      </div>

      <div className="space-y-2">
        <Label>Product</Label>
        <Select value={product} onValueChange={setProduct}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {PRODUCTS.map((p) => (
              <SelectItem key={p.code} value={p.code}>{p.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label>Tier</Label>
        <Select value={tier} onValueChange={setTier}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {TIERS.map((t) => (
              <SelectItem key={t.code} value={t.code}>{t.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="push-interval">Push interval (seconds)</Label>
        <Input
          id="push-interval"
          type="number"
          min={3}
          max={60}
          value={pushInterval}
          onChange={(e) => setPushInterval(Number(e.target.value))}
        />
      </div>

      <div className="space-y-2">
        <Label>Propfirm rule</Label>
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

      <div className="space-y-2">
        <Label htmlFor="notes">Notes (optional)</Label>
        <Textarea id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={sendEmail}
          onChange={(e) => setSendEmail(e.target.checked)}
          className="h-4 w-4 rounded border-input accent-primary"
        />
        Send &ldquo;subscription granted&rdquo; email to user
      </label>

      <div className="flex gap-3">
        <Button type="submit" disabled={isPending}>
          {isPending ? "Creating…" : "Create subscription"}
        </Button>
      </div>
    </form>
  );
}
