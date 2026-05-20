"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { propfirmRuleSchema, type PropfirmRuleInput } from "@/lib/schemas";
import type { PropfirmRule } from "@/lib/types";
import { fmtCash } from "@/lib/journal/format-pnl";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

type PercentMoney = "money" | "percent";
type BalanceEquity = "balance" | "equity";

export function RuleForm({
  initial,
  basePath,
  returnTo,
}: {
  initial?: PropfirmRule;
  basePath: string;
  returnTo?: string;
}) {
  const router = useRouter();
  const form = useForm<PropfirmRuleInput>({
    resolver: zodResolver(propfirmRuleSchema),
    defaultValues: initial ?? {
      name: "",
      account_size: 100_000,
      max_daily_loss: 5,
      daily_loss_type: "percent",
      daily_loss_calc: "balance",
      max_total_loss: 10,
      total_loss_type: "percent",
      profit_target: 8,
      target_type: "percent",
      min_trading_days: 0,
      max_trading_days: null,
    },
  });

  const accountSize = form.watch("account_size") || 0;
  const dailyLoss = form.watch("max_daily_loss") || 0;
  const dailyLossType = form.watch("daily_loss_type");
  const dailyLossCalc = form.watch("daily_loss_calc");
  const totalLoss = form.watch("max_total_loss") || 0;
  const totalLossType = form.watch("total_loss_type");
  const profitTarget = form.watch("profit_target") || 0;
  const targetType = form.watch("target_type");

  const dailyLossCash = dailyLossType === "percent" ? (dailyLoss / 100) * accountSize : dailyLoss;
  const totalLossCash = totalLossType === "percent" ? (totalLoss / 100) * accountSize : totalLoss;
  const profitTargetCash = targetType === "percent" ? (profitTarget / 100) * accountSize : profitTarget;

  async function onSubmit(values: PropfirmRuleInput) {
    const url = initial ? `/api/propfirm-rules/${initial.id}` : "/api/propfirm-rules";
    const res = await fetch(url, {
      method: initial ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(values),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      const msg = body.error === "duplicate"
        ? "A rule with that name already exists."
        : `Failed to save rule${body.error ? ` — ${body.error}` : ""}.`;
      toast.error(msg);
      return;
    }
    toast.success(initial ? "Rule updated" : "Rule created");
    router.push(returnTo ?? basePath);
    router.refresh();
  }

  async function onDelete() {
    if (!initial) return;
    if (!confirm(`Delete rule "${initial.name}"?`)) return;
    const res = await fetch(`/api/propfirm-rules/${initial.id}`, { method: "DELETE" });
    if (!res.ok) {
      toast.error("Delete failed");
      return;
    }
    toast.success("Rule deleted");
    router.push(basePath);
    router.refresh();
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="mx-auto max-w-2xl space-y-4">
      <header className="border-b pb-5">
        <div className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
          Propfirm Rules · {initial ? "Edit" : "New"}
        </div>
        <h1 className="mt-1 font-serif text-[26px] font-medium leading-tight tracking-tight">
          {initial ? initial.name : "New propfirm rule"}
        </h1>
        <p className="mt-1 text-[13px] text-muted-foreground">
          A reusable challenge setup you can assign to one or more of your subscriptions.
        </p>
      </header>

      {/* IDENTITY */}
      <FormSection title="Identity">
        <Field label="Rule name" help="Shows up in the rule picker on your license journal. Make it specific.">
          <TextInput
            placeholder="e.g. FTMO 100k · Phase 1"
            big
            {...form.register("name")}
          />
        </Field>
        <Field
          label="Account size"
          help={<>The funded balance the propfirm gave you. All <b>%</b> values below resolve against this.</>}
        >
          <ValueUnit
            value={
              <NumberInput
                step="any"
                {...form.register("account_size", { valueAsNumber: true })}
              />
            }
            unit={<span className="px-3 text-sm text-muted-foreground">USD</span>}
          />
        </Field>
      </FormSection>

      {/* RISK LIMITS */}
      <FormSection title="Risk limits" hint="What ends the challenge if you cross them">
        <Field label="Daily loss limit">
          <div className="grid grid-cols-[2fr_1fr] gap-3">
            <ValueUnit
              value={
                <NumberInput
                  step="any"
                  {...form.register("max_daily_loss", { valueAsNumber: true })}
                />
              }
              unit={
                <Segmented
                  value={dailyLossType}
                  options={[{ value: "percent", label: "%" }, { value: "money", label: "$" }]}
                  onChange={(v) => form.setValue("daily_loss_type", v as PercentMoney, { shouldDirty: true })}
                />
              }
            />
            <CalcSelect
              value={dailyLossCalc}
              onChange={(v) => form.setValue("daily_loss_calc", v as BalanceEquity, { shouldDirty: true })}
            />
          </div>
          <Equiv>
            {dailyLossType === "percent" && accountSize > 0 ? (
              <>
                {dailyLoss}% of {fmtCash(accountSize, "USD")} = <b>{fmtCash(dailyLossCash, "USD")}</b>
              </>
            ) : (
              <>maximum {fmtCash(dailyLoss, "USD")} loss in a single day</>
            )}
            <> · resets at 00:00 UTC, measured against <b>{dailyLossCalc}</b></>
          </Equiv>
        </Field>

        <Field label="Total drawdown limit">
          <ValueUnit
            value={
              <NumberInput
                step="any"
                {...form.register("max_total_loss", { valueAsNumber: true })}
              />
            }
            unit={
              <Segmented
                value={totalLossType}
                options={[{ value: "percent", label: "%" }, { value: "money", label: "$" }]}
                onChange={(v) => form.setValue("total_loss_type", v as PercentMoney, { shouldDirty: true })}
              />
            }
          />
          <Equiv>
            {totalLossType === "percent" && accountSize > 0 ? (
              <>
                {totalLoss}% of {fmtCash(accountSize, "USD")} = <b>{fmtCash(totalLossCash, "USD")}</b>
              </>
            ) : (
              <>maximum cumulative loss of {fmtCash(totalLoss, "USD")} from start</>
            )}
            <> · breached if equity drops this far below the starting balance</>
          </Equiv>
        </Field>
      </FormSection>

      {/* PASS CONDITIONS */}
      <FormSection title="Pass conditions" hint="What ends the challenge in your favor">
        <Field label="Profit target">
          <ValueUnit
            value={
              <NumberInput
                step="any"
                {...form.register("profit_target", { valueAsNumber: true })}
              />
            }
            unit={
              <Segmented
                value={targetType}
                options={[{ value: "percent", label: "%" }, { value: "money", label: "$" }]}
                onChange={(v) => form.setValue("target_type", v as PercentMoney, { shouldDirty: true })}
              />
            }
          />
          <Equiv>
            {targetType === "percent" && accountSize > 0 ? (
              <>
                {profitTarget}% of {fmtCash(accountSize, "USD")} = <b>{fmtCash(profitTargetCash, "USD")}</b> profit needed to pass
              </>
            ) : (
              <>{fmtCash(profitTarget, "USD")} profit needed to pass</>
            )}
          </Equiv>
        </Field>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field
            label="Minimum trading days"
            help={<>Days with at least one closed trade. Default <b>0</b> = no minimum.</>}
          >
            <NumberInput
              align="right"
              {...form.register("min_trading_days", { valueAsNumber: true })}
            />
          </Field>
          <Field
            label={<>Maximum trading days <span className="font-normal text-muted-foreground">— optional</span></>}
            help="Hard window after which the challenge ends."
          >
            <NumberInput
              align="right"
              placeholder="no limit"
              {...form.register("max_trading_days", {
                valueAsNumber: true,
                setValueAs: (v) => (v === "" || v === null ? null : Number(v)),
              })}
            />
          </Field>
        </div>
      </FormSection>

      {/* ACTIONS */}
      <footer className="flex items-center gap-2 border-t pt-5">
        <Button type="submit" disabled={form.formState.isSubmitting}>
          {form.formState.isSubmitting
            ? "Saving…"
            : initial ? "Save changes" : "Create rule"}
        </Button>
        <Button type="button" variant="ghost" asChild>
          <Link href={returnTo ?? basePath}>Cancel</Link>
        </Button>
        {initial && (
          <Button type="button" variant="ghost" className="ml-auto text-red-600 hover:bg-red-50 hover:text-red-700" onClick={onDelete}>
            Delete rule
          </Button>
        )}
      </footer>
    </form>
  );
}

// ── building blocks ─────────────────────────────────────────────────

function FormSection({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-xl border bg-card">
      <header className="flex items-center justify-between border-b px-5 py-3">
        <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground">
          {title}
        </span>
        {hint && <span className="text-[11.5px] text-muted-foreground">{hint}</span>}
      </header>
      <div className="space-y-4 px-5 py-5">{children}</div>
    </section>
  );
}

function Field({
  label,
  help,
  children,
}: {
  label: React.ReactNode;
  help?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="mb-1.5 block text-[12px] font-semibold">{label}</label>
      {children}
      {help && <p className="mt-1.5 text-[11.5px] text-muted-foreground">{help}</p>}
    </div>
  );
}

function ValueUnit({ value, unit }: { value: React.ReactNode; unit: React.ReactNode }) {
  return (
    <div className="flex items-stretch overflow-hidden rounded-md border border-input bg-background transition-shadow focus-within:border-foreground focus-within:ring-2 focus-within:ring-foreground/10">
      <div className="min-w-0 flex-1">{value}</div>
      <div className="flex items-center border-l border-input bg-muted/40">{unit}</div>
    </div>
  );
}

const numberInputClass =
  "h-9 w-full bg-transparent px-3 text-right text-sm tabular-nums outline-none placeholder:text-muted-foreground/60 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none";

const NumberInput = function NumberInput({
  align = "right",
  className,
  ...rest
}: React.InputHTMLAttributes<HTMLInputElement> & { align?: "left" | "right" } & { ref?: React.Ref<HTMLInputElement> }) {
  return (
    <input
      type="number"
      className={cn(
        numberInputClass,
        align === "right" ? "text-right" : "text-left",
        // standalone variant: round borders when not inside ValueUnit
        "rounded-md border border-input focus:border-foreground focus:ring-2 focus:ring-foreground/10",
        // when wrapped in ValueUnit, kill the outer border so it collapses with the unit
        "[&:where(.value-unit_*)]:rounded-none [&:where(.value-unit_*)]:border-0 [&:where(.value-unit_*)]:focus:ring-0",
        className,
      )}
      {...rest}
    />
  );
};

function TextInput({
  big,
  className,
  ...rest
}: React.InputHTMLAttributes<HTMLInputElement> & { big?: boolean }) {
  return (
    <input
      type="text"
      className={cn(
        "w-full rounded-md border border-input bg-background px-3 text-sm outline-none transition-shadow placeholder:text-muted-foreground/60",
        "focus:border-foreground focus:ring-2 focus:ring-foreground/10",
        big ? "h-11 px-3.5 font-serif text-base tracking-tight" : "h-9",
        className,
      )}
      {...rest}
    />
  );
}

function Segmented({
  value,
  options,
  onChange,
}: {
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex gap-0.5 px-1.5 py-1">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            className={cn(
              "min-w-7 rounded px-2.5 py-1 text-[13px] font-medium tabular-nums transition-colors",
              active
                ? "bg-background text-foreground shadow-[0_1px_0_rgba(0,0,0,0.04),0_1px_2px_rgba(0,0,0,0.04)]"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function CalcSelect({
  value,
  onChange,
}: {
  value: BalanceEquity;
  onChange: (v: string) => void;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="h-9 w-full appearance-none rounded-md border border-input bg-background bg-[length:12px] bg-[right_10px_center] bg-no-repeat pr-8 pl-3 text-sm outline-none focus:border-foreground focus:ring-2 focus:ring-foreground/10"
      style={{
        backgroundImage:
          "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16' fill='%2371717a'><path d='M4.5 6.5L8 10l3.5-3.5z'/></svg>\")",
      }}
    >
      <option value="balance">balance</option>
      <option value="equity">equity</option>
    </select>
  );
}

function Equiv({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-1.5 text-[11.5px] tabular-nums text-muted-foreground">
      <span className="mr-1 inline-block opacity-50">↳</span>
      {children}
    </p>
  );
}
