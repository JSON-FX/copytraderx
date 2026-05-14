"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { getSupabaseSSR } from "@/lib/supabase/ssr";
import { getSupabaseAdmin } from "@/lib/supabase/server";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export type LoginResult = { ok: true } | { ok: false; error: string };

export async function loginAction(_prev: unknown, formData: FormData): Promise<LoginResult> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { ok: false, error: "Enter a valid email and password." };
  }

  const sb = await getSupabaseSSR();
  const { data, error } = await sb.auth.signInWithPassword(parsed.data);
  if (error || !data.session || !data.user) {
    return { ok: false, error: "Invalid email or password." };
  }

  // Look up must_change_password and role using the service-role client
  // (the just-issued session may not have RLS-readable access yet).
  const admin = getSupabaseAdmin();
  const { data: row, error: rowError } = await admin
    .from("users")
    .select("role, must_change_password")
    .eq("id", data.user.id)
    .single();
  if (rowError || !row) {
    return { ok: false, error: "Account not provisioned. Contact administrator." };
  }

  if (row.must_change_password) {
    redirect("/auth/change-password");
  }

  redirect(row.role === "admin" ? "/admin/licenses" : "/dashboard");
}
