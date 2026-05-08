import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { loginAs } from "./helpers/auth";

test("admin revokes an active subscription; user sees expired/revoked banner", async ({ browser }) => {
  const sb = createClient(
    (process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL)!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
  const { data: u } = await sb
    .from("users").select("id").eq("email", process.env.TEST_USER_EMAIL!).single();
  const { data: sub } = await sb
    .from("subscriptions")
    .insert({
      user_id: u!.id,
      product: "impulse",
      tier: "monthly",
      status: "active",
      requested_at: new Date().toISOString(),
      approved_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString(),
      push_interval_seconds: 10,
    })
    .select()
    .single();

  const adminCtx = await browser.newContext();
  const adminPage = await adminCtx.newPage();
  await loginAs(adminCtx, adminPage, "admin");
  await adminPage.goto(`/admin/users/${u!.id}`);
  await adminPage.getByRole("button", { name: /revoke/i }).first().click();
  await adminPage.getByRole("button", { name: /^revoke$/i }).click();
  await expect(adminPage.getByText(/revoked/i)).toBeVisible();

  const { data: after } = await sb.from("subscriptions").select("status").eq("id", sub!.id).single();
  expect(after?.status).toBe("revoked");
});
