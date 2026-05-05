/* eslint-disable no-console */
import "dotenv/config";
import { createAuthUser, findAuthUserByEmail } from "@/lib/supabase/admin";
import { getSupabaseAdmin } from "@/lib/supabase/server";

async function main() {
  const email = process.env.INITIAL_ADMIN_EMAIL;
  const password = process.env.INITIAL_ADMIN_PASSWORD;

  if (!email || !password) {
    console.error(
      "INITIAL_ADMIN_EMAIL and INITIAL_ADMIN_PASSWORD must be set in the environment.",
    );
    process.exit(1);
  }

  const existing = await findAuthUserByEmail(email);
  if (existing) {
    console.log(`Admin ${email} already exists (id=${existing.id}). No-op.`);
    return;
  }

  const created = await createAuthUser({
    email,
    password,
    role: "admin",
    email_confirm: true,
  });
  console.log(`Created auth user ${email} (id=${created.id})`);

  // The mirror trigger from migration 20260506000001 has already created
  // public.users. Verify and ensure must_change_password=true.
  const sb = getSupabaseAdmin();
  const { data: row, error } = await sb
    .from("users")
    .select("id, role, must_change_password")
    .eq("id", created.id)
    .single();
  if (error || !row) {
    console.error("public.users row was not created by trigger:", error);
    process.exit(1);
  }
  if (row.role !== "admin" || row.must_change_password !== true) {
    const { error: updErr } = await sb
      .from("users")
      .update({ role: "admin", must_change_password: true })
      .eq("id", created.id);
    if (updErr) {
      console.error("Failed to enforce admin role / must_change_password:", updErr);
      process.exit(1);
    }
  }
  console.log("Seed admin ready. Force password change on first login.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
