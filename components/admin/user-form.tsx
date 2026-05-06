"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { z } from "zod";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { PRODUCTS, type Product } from "@/lib/products";
import type { AppUser, AppUserRole } from "@/lib/types";

// Form schema is a superset of createUserSchema/updateUserSchema — we use a
// single shape and submit the appropriate subset based on mode.
const formSchema = z.object({
  email: z.string().email("Invalid email").max(254),
  full_name: z.string().optional(),
  role: z.enum(["admin", "user"]),
  issue_initial: z.boolean().default(false),
  initial_product: z.enum(PRODUCTS.map((p) => p.code) as [Product, ...Product[]]).optional(),
  initial_tier: z.enum(["monthly", "quarterly", "yearly"]).optional(),
});

type FormValues = z.infer<typeof formSchema>;

interface Props {
  mode: "create" | "edit";
  initial?: AppUser;
}

export function UserForm({ mode, initial }: Props) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [resending, setResending] = useState(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      email: initial?.email ?? "",
      full_name: initial?.full_name ?? "",
      role: initial?.role ?? "user",
      issue_initial: false,
      initial_product: "impulse",
      initial_tier: "monthly",
    },
  });

  const issueInitial = form.watch("issue_initial");

  async function onSubmit(values: FormValues) {
    setSubmitting(true);
    try {
      if (mode === "create") {
        const body = {
          email: values.email.trim(),
          full_name: values.full_name?.trim() || undefined,
          role: values.role,
          ...(values.issue_initial && values.initial_product && values.initial_tier
            ? { initial_subscription: { product: values.initial_product, tier: values.initial_tier } }
            : {}),
        };
        const res = await fetch("/api/users", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const data = await res.json();
        if (!res.ok) {
          if (data?.error === "email_in_use") {
            toast.error("An account with that email already exists.");
            return;
          }
          toast.error(data?.error ?? "Failed to create user");
          return;
        }
        toast.success(
          data.email_sent
            ? "User created. Welcome email sent."
            : "User created. Welcome email failed — resend from the user page.",
        );
        router.push("/admin/users");
        router.refresh();
      } else {
        if (!initial) return;
        const body = {
          full_name: values.full_name?.trim() ? values.full_name.trim() : null,
          role: values.role,
        };
        const res = await fetch(`/api/users/${initial.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const data = await res.json();
        if (!res.ok) {
          if (data?.error === "cannot_self_demote") {
            toast.error("You cannot demote yourself.");
            return;
          }
          toast.error(data?.error ?? "Failed to update user");
          return;
        }
        toast.success("User updated.");
        router.refresh();
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function onResendWelcome() {
    if (!initial) return;
    setResending(true);
    try {
      const res = await fetch(`/api/users/${initial.id}/resend-welcome`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data?.error ?? "Failed to resend welcome");
        return;
      }
      toast.success(
        data.email_sent
          ? "New temp password emailed."
          : "Temp password reset; email send failed.",
      );
    } finally {
      setResending(false);
    }
  }

  async function onDelete() {
    if (!initial) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/users/${initial.id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data?.error ?? "Failed to delete user");
        return;
      }
      toast.success("User deleted.");
      router.push("/admin/users");
      router.refresh();
    } finally {
      setSubmitting(false);
      setShowDelete(false);
    }
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          type="email"
          {...form.register("email")}
          disabled={mode === "edit"}
        />
        {form.formState.errors.email && (
          <p className="text-xs text-destructive">{form.formState.errors.email.message}</p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="full_name">Name (optional)</Label>
        <Input id="full_name" {...form.register("full_name")} />
      </div>

      <div className="space-y-2">
        <Label htmlFor="role">Role</Label>
        <Select
          value={form.watch("role")}
          onValueChange={(v) => form.setValue("role", v as AppUserRole)}
        >
          <SelectTrigger id="role">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="user">User</SelectItem>
            <SelectItem value="admin">Admin</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {mode === "create" && (
        <div className="space-y-3 rounded-md border p-4">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" {...form.register("issue_initial")} />
            Issue an initial subscription on create
          </label>
          {issueInitial && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="initial_product">Product</Label>
                <Select
                  value={form.watch("initial_product") ?? "impulse"}
                  onValueChange={(v) => form.setValue("initial_product", v as Product)}
                >
                  <SelectTrigger id="initial_product">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PRODUCTS.map((p) => (
                      <SelectItem key={p.code} value={p.code}>
                        {p.displayName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="initial_tier">Tier</Label>
                <Select
                  value={form.watch("initial_tier") ?? "monthly"}
                  onValueChange={(v) =>
                    form.setValue("initial_tier", v as "monthly" | "quarterly" | "yearly")
                  }
                >
                  <SelectTrigger id="initial_tier">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="monthly">Monthly</SelectItem>
                    <SelectItem value="quarterly">Quarterly</SelectItem>
                    <SelectItem value="yearly">Yearly</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={submitting}>
          {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {mode === "create" ? "Create user" : "Save changes"}
        </Button>
        {mode === "edit" && (
          <>
            <Button
              type="button"
              variant="outline"
              onClick={onResendWelcome}
              disabled={resending}
            >
              {resending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Resend welcome email
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => setShowDelete(true)}
              disabled={submitting}
              className="ml-auto"
            >
              Delete user
            </Button>
          </>
        )}
      </div>

      <ConfirmDialog
        open={showDelete}
        onOpenChange={setShowDelete}
        title="Delete user?"
        description="This permanently removes the user, their subscriptions, and their licenses. This cannot be undone."
        confirmLabel="Delete"
        destructive
        onConfirm={onDelete}
      />
    </form>
  );
}
