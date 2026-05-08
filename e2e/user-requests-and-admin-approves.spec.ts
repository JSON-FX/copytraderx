import { test, expect } from "@playwright/test";
import { loginAs } from "./helpers/auth";

test("user requests, admin approves, user sees active subscription", async ({ browser }) => {
  const userCtx = await browser.newContext();
  const userPage = await userCtx.newPage();
  await loginAs(userCtx, userPage, "user");
  await userPage.goto("/dashboard");
  await userPage.getByRole("button", { name: /request new license/i }).click();
  await userPage.getByLabel(/product/i).selectOption("ctx-live");
  await userPage.getByLabel(/tier/i).selectOption("monthly");
  await userPage.getByRole("button", { name: /submit/i }).click();
  await expect(userPage.getByText(/pending approval/i)).toBeVisible();

  const adminCtx = await browser.newContext();
  const adminPage = await adminCtx.newPage();
  await loginAs(adminCtx, adminPage, "admin");
  await adminPage.goto("/admin/requests");
  await adminPage.getByRole("button", { name: /approve/i }).first().click();
  await expect(adminPage.getByText(/no pending requests/i)).toBeVisible();

  await userPage.reload();
  await expect(userPage.getByText(/CTX Live/i)).toBeVisible();
});
