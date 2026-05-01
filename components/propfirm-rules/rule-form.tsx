"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { propfirmRuleSchema, type PropfirmRuleInput } from "@/lib/schemas";
import type { PropfirmRule } from "@/lib/types";
import { toast } from "sonner";

export function RuleForm({ initial }: { initial?: PropfirmRule }) {
  const router = useRouter();
  const form = useForm<PropfirmRuleInput>({
    resolver: zodResolver(propfirmRuleSchema),
    defaultValues: initial ?? {
      name: "", account_size: 100000,
      max_daily_loss: 5, daily_loss_type: "percent", daily_loss_calc: "balance",
      max_total_loss: 10, total_loss_type: "percent",
      profit_target: 8, target_type: "percent",
      min_trading_days: 0, max_trading_days: null,
    },
  });

  async function onSubmit(values: PropfirmRuleInput) {
    const url = initial ? `/api/propfirm-rules/${initial.id}` : "/api/propfirm-rules";
    const res = await fetch(url, {
      method: initial ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(values),
    });
    if (!res.ok) { toast.error("Failed to save rule"); return; }
    toast.success(initial ? "Rule updated" : "Rule created");
    router.push("/propfirm-rules"); router.refresh();
  }

  async function onDelete() {
    if (!initial) return;
    if (!confirm(`Delete rule "${initial.name}"?`)) return;
    const res = await fetch(`/api/propfirm-rules/${initial.id}`, { method: "DELETE" });
    if (!res.ok) { toast.error("Delete failed"); return; }
    toast.success("Rule deleted");
    router.push("/propfirm-rules"); router.refresh();
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 max-w-xl">
      <div><Label>Name</Label><Input {...form.register("name")} /></div>
      <div><Label>Account size</Label>
        <Input type="number" step="any" {...form.register("account_size", { valueAsNumber: true })} /></div>

      <div className="grid grid-cols-3 gap-3">
        <div><Label>Daily loss</Label>
          <Input type="number" step="any" {...form.register("max_daily_loss", { valueAsNumber: true })} /></div>
        <div><Label>Type</Label>
          <Select value={form.watch("daily_loss_type")} onValueChange={(v) => form.setValue("daily_loss_type", v as "money"|"percent")}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="money">$</SelectItem><SelectItem value="percent">%</SelectItem></SelectContent>
          </Select></div>
        <div><Label>Calc</Label>
          <Select value={form.watch("daily_loss_calc")} onValueChange={(v) => form.setValue("daily_loss_calc", v as "balance"|"equity")}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="balance">balance</SelectItem><SelectItem value="equity">equity</SelectItem></SelectContent>
          </Select></div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div><Label>Total loss</Label>
          <Input type="number" step="any" {...form.register("max_total_loss", { valueAsNumber: true })} /></div>
        <div><Label>Type</Label>
          <Select value={form.watch("total_loss_type")} onValueChange={(v) => form.setValue("total_loss_type", v as "money"|"percent")}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="money">$</SelectItem><SelectItem value="percent">%</SelectItem></SelectContent>
          </Select></div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div><Label>Profit target</Label>
          <Input type="number" step="any" {...form.register("profit_target", { valueAsNumber: true })} /></div>
        <div><Label>Type</Label>
          <Select value={form.watch("target_type")} onValueChange={(v) => form.setValue("target_type", v as "money"|"percent")}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="money">$</SelectItem><SelectItem value="percent">%</SelectItem></SelectContent>
          </Select></div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div><Label>Min trading days</Label>
          <Input type="number" {...form.register("min_trading_days", { valueAsNumber: true })} /></div>
        <div><Label>Max trading days (optional)</Label>
          <Input type="number" {...form.register("max_trading_days", { valueAsNumber: true, setValueAs: (v) => v === "" || v === null ? null : Number(v) })} /></div>
      </div>

      <div className="flex gap-2">
        <Button type="submit">{initial ? "Save" : "Create"}</Button>
        {initial && <Button type="button" variant="destructive" onClick={onDelete}>Delete</Button>}
      </div>
    </form>
  );
}
