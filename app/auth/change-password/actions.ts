"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { getSupabaseSSR } from "@/lib/supabase/ssr";
import { getSupabaseAdmin } from "@/lib/supabase/server";

const schema = z
  .object({
    password: z.string().min(8, "Password must be at least 8 characters."),
    confirm: z.string().min(1, "Confirm your new password."),
  })
  .refine((v) => v.password === v.confirm, {
    message: "Passwords do not match.",
    path: ["confirm"],
  });

export type ChangePasswordResult = { ok: true } | { ok: false; error: string };

export async function changePasswordAction(
  _prev: unknown,
  formData: FormData,
): Promise<ChangePasswordResult> {
  const parsed = schema.safeParse({
    password: formData.get("password"),
    confirm: formData.get("confirm"),
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  const sb = await getSupabaseSSR();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) {
    return { ok: false, error: "Not signed in." };
  }

  const { error: updateErr } = await sb.auth.updateUser({ password: parsed.data.password });
  if (updateErr) {
    return { ok: false, error: updateErr.message };
  }

  const admin = getSupabaseAdmin();
  const { data: row, error: flagErr } = await admin
    .from("users")
    .update({ must_change_password: false })
    .eq("id", user.id)
    .select("role")
    .single();
  if (flagErr || !row) {
    return { ok: false, error: "Could not update account flag." };
  }

  redirect(row.role === "admin" ? "/admin/licenses" : "/dashboard");
}
