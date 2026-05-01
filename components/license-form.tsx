"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { z } from "zod";
import { RefreshCw, Copy, AlertTriangle, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ConfirmDialog } from "./confirm-dialog";
import { generateLicenseKey } from "@/lib/license-key";
import { calculateExpiresAt, formatExpiry } from "@/lib/expiry";
import { copyToClipboard } from "@/lib/clipboard";
import { LICENSE_KEY_PATTERN } from "@/lib/schemas";
import type { License, LicenseTier, LicenseStatus, PropfirmRule } from "@/lib/types";

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

const formSchema = z.object({
  license_key: z
    .string()
    .regex(LICENSE_KEY_PATTERN, "Must match IMPX-XXXX-XXXX-XXXX-XXXX"),
  mt5_account: z.coerce
    .number()
    .int("Must be a whole number")
    .positive("Must be a positive integer"),
  tier: z.enum(["monthly", "quarterly", "yearly"]),
  intended_account_type: z.enum(["demo", "live"]),
  status: z.enum(["active", "revoked", "expired"]),
  customer_email: z.string().email("Invalid email address").or(z.literal("")).optional(),
  notes: z.string().optional(),
  push_interval_seconds: z.number().int().min(3).max(60).default(10),
  propfirm_rule_id: z.number().int().positive().nullable().default(null),
});

type FormValues = z.infer<typeof formSchema>;

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface Props {
  mode: "create" | "edit";
  initial?: License;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function LicenseForm({ mode, initial }: Props) {
  const router = useRouter();
  const [showDelete, setShowDelete] = useState(false);
  const [rules, setRules] = useState<PropfirmRule[]>([]);

  useEffect(() => {
    fetch("/api/propfirm-rules").then((r) => r.json()).then(setRules).catch(() => {});
  }, []);

  const defaultValues: FormValues = {
    license_key: initial?.license_key ?? generateLicenseKey(),
    mt5_account: initial?.mt5_account ?? (0 as unknown as number),
    tier: (initial?.tier as LicenseTier | undefined) ?? "monthly",
    intended_account_type: (initial?.intended_account_type as "demo" | "live" | undefined) ?? "demo",
    status: (initial?.status as LicenseStatus | undefined) ?? "active",
    customer_email: initial?.customer_email ?? "",
    notes: initial?.notes ?? "",
    push_interval_seconds: initial?.push_interval_seconds ?? 10,
    propfirm_rule_id: initial?.propfirm_rule_id ?? null,
  };

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues,
  });

  const tier = form.watch("tier");
  const mt5Value = form.watch("mt5_account");
  const accountChanged =
    mode === "edit" &&
    initial?.mt5_account !== undefined &&
    Number(mt5Value) !== initial.mt5_account &&
    Number(mt5Value) > 0;

  // -------------------------------------------------------------------------
  // Submit handler
  // -------------------------------------------------------------------------

  async function onSubmit(values: FormValues) {
    const path =
      mode === "create" ? "/api/licenses" : `/api/licenses/${initial!.id}`;
    const method = mode === "create" ? "POST" : "PATCH";

    const body =
      mode === "create"
        ? {
            license_key: values.license_key,
            mt5_account: values.mt5_account,
            tier: values.tier,
            intended_account_type: values.intended_account_type,
            customer_email: values.customer_email || null,
            notes: values.notes || null,
            push_interval_seconds: values.push_interval_seconds,
            propfirm_rule_id: values.propfirm_rule_id,
          }
        : {
            mt5_account: values.mt5_account,
            tier: values.tier,
            intended_account_type: values.intended_account_type,
            status: values.status,
            customer_email: values.customer_email || null,
            notes: values.notes || null,
            push_interval_seconds: values.push_interval_seconds,
            propfirm_rule_id: values.propfirm_rule_id,
          };

    const res = await fetch(path, {
      method,
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text();
      if (res.status === 409) {
        toast.error("License key already exists — regenerate to try again.");
      } else {
        toast.error(`Save failed: ${text}`);
      }
      return;
    }

    toast.success(mode === "create" ? "License created" : "License updated");
    router.push("/licenses");
    router.refresh();
  }

  // -------------------------------------------------------------------------
  // Delete handler
  // -------------------------------------------------------------------------

  async function handleDelete() {
    if (!initial) return;
    const res = await fetch(`/api/licenses/${initial.id}`, { method: "DELETE" });
    if (!res.ok) {
      toast.error(`Delete failed: ${await res.text()}`);
      return;
    }
    toast.success("License deleted");
    router.push("/licenses");
    router.refresh();
  }

  // -------------------------------------------------------------------------
  // Key helpers
  // -------------------------------------------------------------------------

  function regenerateKey() {
    form.setValue("license_key", generateLicenseKey(), { shouldDirty: true });
  }

  async function copyKey() {
    const ok = await copyToClipboard(form.getValues("license_key"));
    if (ok) toast.success("License key copied to clipboard");
    else toast.error("Could not copy. Select and copy manually.");
  }

  // -------------------------------------------------------------------------
  // Expiry preview
  // -------------------------------------------------------------------------

  const previewExpiry = (() => {
    if (mode === "create") {
      return "Expiry will be set when the customer first activates the EA";
    }
    const date = calculateExpiresAt(tier as LicenseTier, new Date());
    return `If renewed today, expires ${formatExpiry(date.toISOString())}`;
  })();

  const isSubmitting = form.formState.isSubmitting;

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5 max-w-xl">

      {/* License Key */}
      <div className="space-y-1.5">
        <Label htmlFor="license_key" className="text-sm font-semibold">
          License Key
        </Label>
        <div className="flex gap-2 items-center">
          <Input
            id="license_key"
            {...form.register("license_key")}
            readOnly={mode === "edit"}
            className="font-mono text-sm tracking-wide"
            aria-describedby={form.formState.errors.license_key ? "license_key-error" : undefined}
          />
          {mode === "create" ? (
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={regenerateKey}
              title="Regenerate key"
              className="shrink-0"
            >
              <RefreshCw className="h-4 w-4" />
            </Button>
          ) : (
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={copyKey}
              title="Copy key"
              className="shrink-0"
            >
              <Copy className="h-4 w-4" />
            </Button>
          )}
        </div>
        {form.formState.errors.license_key && (
          <p id="license_key-error" className="text-xs text-destructive">
            {form.formState.errors.license_key.message}
          </p>
        )}
      </div>

      {/* MT5 Account */}
      <div className="space-y-1.5">
        <Label htmlFor="mt5_account" className="text-sm font-semibold">
          MT5 Account Number
        </Label>
        <Input
          id="mt5_account"
          type="number"
          min={1}
          step={1}
          {...form.register("mt5_account")}
          aria-describedby={form.formState.errors.mt5_account ? "mt5_account-error" : undefined}
        />
        {form.formState.errors.mt5_account && (
          <p id="mt5_account-error" className="text-xs text-destructive">
            {form.formState.errors.mt5_account.message}
          </p>
        )}
        {accountChanged && (
          <Alert className="border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200 mt-2">
            <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0" />
            <AlertDescription className="text-amber-900 dark:text-amber-200 text-sm">
              Changing the MT5 account invalidates the license on the
              customer&apos;s existing account until they reconfigure the EA.
            </AlertDescription>
          </Alert>
        )}
      </div>

      {/* Tier */}
      <div className="space-y-1.5">
        <Label htmlFor="tier" className="text-sm font-semibold">
          Tier
        </Label>
        <Select
          value={form.watch("tier")}
          onValueChange={(v) =>
            form.setValue("tier", v as LicenseTier, { shouldDirty: true })
          }
        >
          <SelectTrigger id="tier">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="monthly">Monthly</SelectItem>
            <SelectItem value="quarterly">Quarterly</SelectItem>
            <SelectItem value="yearly">Yearly</SelectItem>
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">{previewExpiry}</p>
      </div>

      {/* Account Type */}
      <div className="space-y-1.5">
        <Label htmlFor="intended_account_type" className="text-sm font-semibold">
          Account Type
        </Label>
        <Select
          value={form.watch("intended_account_type")}
          onValueChange={(v) =>
            form.setValue("intended_account_type", v as "demo" | "live", { shouldDirty: true })
          }
        >
          <SelectTrigger id="intended_account_type">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="demo">Demo</SelectItem>
            <SelectItem value="live">Live</SelectItem>
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          The EA will only trade if the MT5 account type matches this setting.
        </p>
      </div>

      {/* Status (edit only) */}
      {mode === "edit" && (
        <div className="space-y-1.5">
          <Label htmlFor="status" className="text-sm font-semibold">
            Status
          </Label>
          <Select
            value={form.watch("status")}
            onValueChange={(v) =>
              form.setValue("status", v as LicenseStatus, { shouldDirty: true })
            }
          >
            <SelectTrigger id="status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="revoked">Revoked</SelectItem>
              <SelectItem value="expired">Expired</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Customer Email */}
      <div className="space-y-1.5">
        <Label htmlFor="customer_email" className="text-sm font-semibold">
          Customer Email
          <span className="ml-1.5 text-xs font-normal text-muted-foreground">optional</span>
        </Label>
        <Input
          id="customer_email"
          type="email"
          placeholder="customer@example.com"
          {...form.register("customer_email")}
          aria-describedby={form.formState.errors.customer_email ? "email-error" : undefined}
        />
        {form.formState.errors.customer_email && (
          <p id="email-error" className="text-xs text-destructive">
            {form.formState.errors.customer_email.message}
          </p>
        )}
      </div>

      {/* Notes */}
      <div className="space-y-1.5">
        <Label htmlFor="notes" className="text-sm font-semibold">
          Notes
          <span className="ml-1.5 text-xs font-normal text-muted-foreground">optional</span>
        </Label>
        <Textarea
          id="notes"
          rows={3}
          placeholder="Internal notes about this license…"
          {...form.register("notes")}
        />
      </div>

      {/* EA Push Interval */}
      <div className="space-y-1.5">
        <Label htmlFor="push_interval_seconds" className="text-sm font-semibold">
          EA push interval (seconds)
        </Label>
        <Select
          value={String(form.watch("push_interval_seconds") ?? 10)}
          onValueChange={(v) =>
            form.setValue("push_interval_seconds", Number(v), { shouldDirty: true })
          }
        >
          <SelectTrigger id="push_interval_seconds">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {[3, 5, 10, 30, 60].map((n) => (
              <SelectItem key={n} value={String(n)}>{n}s</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">How often this account&apos;s EA publishes to Supabase.</p>
      </div>

      {/* Propfirm Rule */}
      <div className="space-y-1.5">
        <Label htmlFor="propfirm_rule_id" className="text-sm font-semibold">
          Propfirm rule
          <span className="ml-1.5 text-xs font-normal text-muted-foreground">optional</span>
        </Label>
        <Select
          value={form.watch("propfirm_rule_id") === null ? "none" : String(form.watch("propfirm_rule_id"))}
          onValueChange={(v) =>
            form.setValue("propfirm_rule_id", v === "none" ? null : Number(v), { shouldDirty: true })
          }
        >
          <SelectTrigger id="propfirm_rule_id">
            <SelectValue placeholder="No challenge" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">No challenge</SelectItem>
            {rules.map((r) => (
              <SelectItem key={r.id} value={String(r.id)}>{r.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Action buttons */}
      <div className="flex items-center gap-2 pt-1">
        <Button
          type="button"
          variant="outline"
          onClick={() => router.push("/licenses")}
          disabled={isSubmitting}
        >
          Cancel
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
              Saving…
            </>
          ) : mode === "create" ? (
            "Create License"
          ) : (
            "Save Changes"
          )}
        </Button>

        {mode === "edit" && (
          <>
            <div className="flex-1" />
            <Button
              type="button"
              variant="destructive"
              onClick={() => setShowDelete(true)}
              disabled={isSubmitting}
            >
              Delete
            </Button>
          </>
        )}
      </div>

      {/* Delete confirmation dialog (edit only) */}
      {mode === "edit" && (
        <ConfirmDialog
          open={showDelete}
          onOpenChange={setShowDelete}
          title="Permanently delete this license?"
          description="This cannot be undone. Use Revoke (Status → Revoked) if you might want to restore it later."
          typeToConfirm="DELETE"
          confirmLabel="Delete forever"
          destructive
          onConfirm={handleDelete}
        />
      )}
    </form>
  );
}
