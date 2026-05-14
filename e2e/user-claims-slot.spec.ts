import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { loginAs } from "./helpers/auth";

test("user claims a live slot and sees it on the dashboard", async ({ page, context }) => {
  const sb = createClient(
    (process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL)!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
  const { data: u } = await sb
    .from("users").select("id").eq("email", process.env.TEST_USER_EMAIL!).single();
  await sb.from("subscriptions").insert({
    user_id: u!.id,
    product: "impulse",
    tier: "monthly",
    status: "active",
    requested_at: new Date().toISOString(),
    approved_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString(),
    push_interval_seconds: 10,
  });

  await loginAs(context, page, "user");
  await page.goto("/dashboard");
  await page.getByRole("button", { name: /add mt5 account/i }).first().click();
  await page.getByLabel(/mt5/i).fill("12345678");
  await page.getByRole("button", { name: /claim/i }).click();
  await expect(page.getByText("12345678")).toBeVisible();
});
