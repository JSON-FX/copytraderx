import { test, expect } from "@playwright/test";
import { loginAs } from "./helpers/auth";

test("anonymous → /login on /admin/* and /dashboard/*", async ({ page }) => {
  await page.goto("/admin/licenses");
  await expect(page).toHaveURL(/\/login/);
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login/);
});

test("user role cannot reach /admin/*", async ({ page, context }) => {
  await loginAs(context, page, "user");
  await page.goto("/admin/licenses");
  await expect(page).toHaveURL(/\/dashboard/);
});

test("admin role redirected from /dashboard to /admin/licenses", async ({ page, context }) => {
  await loginAs(context, page, "admin");
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/admin\//);
});
