import { createClient } from "@supabase/supabase-js";

export default async function globalSetup() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing test Supabase env vars");

  if (!/test|stag|local/i.test(url)) {
    throw new Error(`Refusing to seed against ${url} — URL must contain 'test', 'stag', or 'local'`);
  }

  const sb = createClient(url, key, { auth: { persistSession: false } });

  for (const table of ["licenses", "subscriptions", "users"]) {
    await sb.from(table).delete().neq("id", "00000000-0000-0000-0000-000000000000");
  }

  const adminEmail = process.env.INITIAL_ADMIN_EMAIL!;
  const adminPassword = process.env.INITIAL_ADMIN_PASSWORD!;
  const { data: existing } = await sb.auth.admin.listUsers();
  const adminAuth = existing.users.find((u) => u.email === adminEmail);
  if (!adminAuth) {
    const { data, error } = await sb.auth.admin.createUser({
      email: adminEmail,
      password: adminPassword,
      email_confirm: true,
      app_metadata: { role: "admin" },
    });
    if (error) throw error;
    await sb.from("users").insert({
      id: data.user!.id,
      email: adminEmail,
      role: "admin",
      must_change_password: false,
    });
  }

  const userEmail = process.env.TEST_USER_EMAIL!;
  const userPassword = process.env.TEST_USER_PASSWORD!;
  const userAuth = existing.users.find((u) => u.email === userEmail);
  if (!userAuth) {
    const { data, error } = await sb.auth.admin.createUser({
      email: userEmail,
      password: userPassword,
      email_confirm: true,
      app_metadata: { role: "user" },
    });
    if (error) throw error;
    await sb.from("users").insert({
      id: data.user!.id,
      email: userEmail,
      role: "user",
      must_change_password: false,
    });
  }
}
