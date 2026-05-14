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
import { CredentialsCard } from "@/components/admin/credentials-card";
import { PRODUCTS, type Product } from "@/lib/products";
import type { AppUser, AppUserRole } from "@/lib/types";

// Form schema is a superset of createUserSchema/updateUserSchema — we use a
// single shape and submit the appropriate subset based on mode.
const formSchema = z.object({
  email: z.string().email("Invalid email").max(254),
  full_name: z.string().optional(),
  role: z.enum(["admin", "user"]),
  invite_method: z.enum(["invite", "manual"]).default("invite"),
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
  const [resettingPassword, setResettingPassword] = useState(false);
  const [credentials, setCredentials] = useState<{
    email: string;
    password: string;
  } | null>(null);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      email: initial?.email ?? "",
      full_name: initial?.full_name ?? "",
      role: initial?.role ?? "user",
      invite_method: "invite",
      issue_initial: false,
      initial_product: "impulse",
      initial_tier: "monthly",
    },
  });

  const issueInitial = form.watch("issue_initial");
  const inviteMethod = form.watch("invite_method");

  // Server may return an HTML error page on uncaught throws — JSON parse fails.
  // Fall back to status-code messaging instead of a silent throw.
  async function readJson(res: Response): Promise<Record<string, unknown> | null> {
    try {
      return (await res.json()) as Record<string, unknown>;
    } catch {
      return null;
    }
  }

  async function onSubmit(values: FormValues) {
    setSubmitting(true);
    try {
      if (mode === "create") {
        const body = {
          email: values.email.trim(),
          full_name: values.full_name?.trim() || undefined,
          role: values.role,
          invite_method: values.invite_method,
          ...(values.issue_initial && values.initial_product && values.initial_tier
            ? { initial_subscription: { product: values.initial_product, tier: values.initial_tier } }
            : {}),
        };
        const res = await fetch("/api/users", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const data = await readJson(res);
        if (!res.ok) {
          if (data?.error === "email_in_use") {
            toast.error("An account with that email already exists.");
            return;
          }
          toast.error(
            (data?.error as string | undefined) ??
              `Failed to create user (HTTP ${res.status})`,
          );
          return;
        }

        // Manual provisioning: server returned the password once. Show it
        // in-place; admin clicks "Done" to navigate away.
        if (
          values.invite_method === "manual" &&
          typeof data?.generated_password === "string" &&
          typeof data?.email === "string"
        ) {
          toast.success("User created. Copy the credentials before leaving.");
          setCredentials({
            email: data.email,
            password: data.generated_password,
          });
          return;
        }

        toast.success("User invited. They will receive an email to set their password.");
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
        const data = await readJson(res);
        if (!res.ok) {
          if (data?.error === "cannot_self_demote") {
            toast.error("You cannot demote yourself.");
            return;
          }
          toast.error(
            (data?.error as string | undefined) ??
              `Failed to update user (HTTP ${res.status})`,
          );
          return;
        }
        toast.success("User updated.");
        router.refresh();
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Network error";
      toast.error(msg);
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
      const data = await readJson(res);
      if (!res.ok) {
        toast.error(
          (data?.error as string | undefined) ??
            `Failed to resend welcome (HTTP ${res.status})`,
        );
        return;
      }
      toast.success("Recovery email sent.");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Network error";
      toast.error(msg);
    } finally {
      setResending(false);
    }
  }

  async function onResetPassword() {
    if (!initial) return;
    setResettingPassword(true);
    try {
      const res = await fetch(`/api/users/${initial.id}/reset-password`, {
        method: "POST",
      });
      const data = await readJson(res);
      if (!res.ok) {
        toast.error(
          (data?.error as string | undefined) ??
            `Failed to reset password (HTTP ${res.status})`,
        );
        return;
      }
      if (
        typeof data?.email === "string" &&
        typeof data?.new_password === "string"
      ) {
        toast.success("Password reset. Copy the new credentials.");
        setCredentials({ email: data.email, password: data.new_password });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Network error";
      toast.error(msg);
    } finally {
      setResettingPassword(false);
    }
  }

  async function onDelete() {
    if (!initial) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/users/${initial.id}`, { method: "DELETE" });
      const data = await readJson(res);
      if (!res.ok) {
        toast.error(
          (data?.error as string | undefined) ??
            `Failed to delete user (HTTP ${res.status})`,
        );
        return;
      }
      toast.success("User deleted.");
      router.push("/admin/users");
      router.refresh();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Network error";
      toast.error(msg);
    } finally {
      setSubmitting(false);
      setShowDelete(false);
    }
  }

  if (credentials) {
    return (
      <div className="space-y-4">
        <CredentialsCard
          email={credentials.email}
          password={credentials.password}
          onDone={() => {
            setCredentials(null);
            if (mode === "create") {
              router.push("/admin/users");
              router.refresh();
            } else {
              router.refresh();
            }
          }}
        />
      </div>
    );
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
          <div className="text-sm font-medium">Provisioning</div>
          <div className="space-y-2">
            <label className="flex items-start gap-2 text-sm">
              <input
                type="radio"
                value="invite"
                checked={inviteMethod === "invite"}
                onChange={() => form.setValue("invite_method", "invite")}
                className="mt-1"
              />
              <div>
                <div>Send invite via email</div>
                <div className="text-xs text-muted-foreground">
                  Supabase emails a sign-in link. Requires SMTP configured in
                  the Supabase project.
                </div>
              </div>
            </label>
            <label className="flex items-start gap-2 text-sm">
              <input
                type="radio"
                value="manual"
                checked={inviteMethod === "manual"}
                onChange={() => form.setValue("invite_method", "manual")}
                className="mt-1"
              />
              <div>
                <div>Generate password for manual delivery</div>
                <div className="text-xs text-muted-foreground">
                  No email is sent. The password is shown once after creation
                  so you can copy and hand-deliver it.
                </div>
              </div>
            </label>
          </div>
        </div>
      )}

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
              variant="outline"
              onClick={onResetPassword}
              disabled={resettingPassword}
            >
              {resettingPassword && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Reset password
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
