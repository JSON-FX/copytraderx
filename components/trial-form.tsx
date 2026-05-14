"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { createTrialSchema, type CreateTrialInput } from "@/lib/schemas";
import { PRODUCTS } from "@/lib/products";

type DedupeMatch = { trial_id: number; created_at: string; status: string };
type DedupeError = {
  error: "duplicate_trial";
  fields: {
    email?: DedupeMatch;
    telegram?: DedupeMatch;
    discord?: DedupeMatch;
    mt5_account?: DedupeMatch;
  };
};

export function TrialForm() {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [dedupe, setDedupe] = useState<DedupeError["fields"] | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const [createdKey, setCreatedKey] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<CreateTrialInput>({
    resolver: zodResolver(createTrialSchema),
    defaultValues: {
      product: PRODUCTS[0].code,
    },
  });

  async function onSubmit(values: CreateTrialInput) {
    setSubmitting(true);
    setDedupe(null);
    setServerError(null);
    try {
      const res = await fetch("/api/trials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      if (res.status === 409) {
        const body = (await res.json()) as DedupeError;
        setDedupe(body.fields);
        return;
      }
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setServerError((body as { error?: string }).error ?? `HTTP ${res.status}`);
        return;
      }
      const body = (await res.json()) as { trial_license: { license_key: string } };
      setCreatedKey(body.trial_license.license_key);
    } finally {
      setSubmitting(false);
    }
  }

  if (createdKey) {
    return (
      <div className="space-y-4">
        <p className="text-sm">
          Trial issued. Copy the key below and paste it into the lead&apos;s
          Telegram or Discord DM:
        </p>
        <pre className="rounded-md border bg-muted/30 px-3 py-2 font-mono text-base">
          {createdKey}
        </pre>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => navigator.clipboard.writeText(createdKey)}
            className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted/50"
          >
            Copy key
          </button>
          <button
            type="button"
            onClick={() => router.push("/admin/trials")}
            className="rounded-md bg-foreground px-3 py-1.5 text-sm text-background hover:opacity-90"
          >
            Back to trials
          </button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div className="grid gap-1">
        <label className="text-sm font-medium">Product</label>
        <select
          {...register("product")}
          className="rounded-md border bg-background px-2 py-1.5 text-sm"
        >
          {PRODUCTS.map((p) => (
            <option key={p.code} value={p.code}>
              {p.displayName}
            </option>
          ))}
        </select>
        {errors.product && (
          <p className="text-xs text-red-600">{errors.product.message}</p>
        )}
      </div>

      <div className="grid gap-1">
        <label className="text-sm font-medium">MT5 account</label>
        <input
          type="number"
          {...register("mt5_account", { valueAsNumber: true })}
          className="rounded-md border bg-background px-2 py-1.5 text-sm"
        />
        {errors.mt5_account && (
          <p className="text-xs text-red-600">{errors.mt5_account.message}</p>
        )}
        {dedupe?.mt5_account && (
          <p className="text-xs text-red-600">
            MT5 account already had a trial on {dedupe.mt5_account.created_at.slice(0, 10)} ({dedupe.mt5_account.status}).
          </p>
        )}
      </div>

      <div className="grid gap-1">
        <label className="text-sm font-medium">Email</label>
        <input
          type="email"
          {...register("email")}
          className="rounded-md border bg-background px-2 py-1.5 text-sm"
        />
        {errors.email && (
          <p className="text-xs text-red-600">{errors.email.message}</p>
        )}
        {dedupe?.email && (
          <p className="text-xs text-red-600">
            Email already had a trial on {dedupe.email.created_at.slice(0, 10)} ({dedupe.email.status}).
          </p>
        )}
      </div>

      <div className="grid gap-1">
        <label className="text-sm font-medium">Telegram handle (optional)</label>
        <input
          type="text"
          {...register("telegram_handle")}
          placeholder="@username"
          className="rounded-md border bg-background px-2 py-1.5 text-sm"
        />
        {dedupe?.telegram && (
          <p className="text-xs text-red-600">
            Telegram handle already used on {dedupe.telegram.created_at.slice(0, 10)}.
          </p>
        )}
      </div>

      <div className="grid gap-1">
        <label className="text-sm font-medium">Discord handle (optional)</label>
        <input
          type="text"
          {...register("discord_handle")}
          placeholder="user#1234 or @user"
          className="rounded-md border bg-background px-2 py-1.5 text-sm"
        />
        {dedupe?.discord && (
          <p className="text-xs text-red-600">
            Discord handle already used on {dedupe.discord.created_at.slice(0, 10)}.
          </p>
        )}
      </div>

      <div className="grid gap-1">
        <label className="text-sm font-medium">Notes (optional)</label>
        <textarea
          {...register("notes")}
          rows={3}
          className="rounded-md border bg-background px-2 py-1.5 text-sm"
        />
      </div>

      {serverError && <p className="text-sm text-red-600">{serverError}</p>}

      <div className="flex justify-end gap-3">
        <button
          type="button"
          onClick={() => router.push("/admin/trials")}
          className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted/50"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={submitting}
          className="rounded-md bg-foreground px-3 py-1.5 text-sm text-background hover:opacity-90 disabled:opacity-50"
        >
          {submitting ? "Creating…" : "Create trial"}
        </button>
      </div>
    </form>
  );
}
