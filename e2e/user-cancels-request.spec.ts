import { test, expect } from "@playwright/test";
import { loginAs } from "./helpers/auth";

test("user can cancel a pending request", async ({ context, page }) => {
  await loginAs(context, page, "user");
  await page.goto("/dashboard");
  await page.getByRole("button", { name: /request new license/i }).click();
  await page.getByLabel(/product/i).selectOption("impulse");
  await page.getByLabel(/tier/i).selectOption("monthly");
  await page.getByRole("button", { name: /submit/i }).click();
  await expect(page.getByText(/pending approval/i)).toBeVisible();

  await page.getByRole("button", { name: /cancel request/i }).click();
  await expect(page.getByText(/pending approval/i)).toHaveCount(0);
});
