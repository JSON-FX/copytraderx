import { test, expect } from "@playwright/test";
import { loginAs } from "./helpers/auth";

test("admin creates a user and sees them in the users list", async ({ page, context }) => {
  await loginAs(context, page, "admin");
  await page.goto("/admin/users/new");
  const stamp = Date.now();
  const email = `created-${stamp}@example.com`;
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/full name/i).fill("E2E Created");
  await page.getByRole("button", { name: /create/i }).click();
  await page.waitForURL(/\/admin\/users(\/.+)?$/);
  await page.goto("/admin/users");
  await expect(page.getByText(email)).toBeVisible();
});
