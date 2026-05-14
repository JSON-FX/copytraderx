import { test, expect } from "@playwright/test";
import { loginAs } from "./helpers/auth";

test("admin can open the Subscriptions page and see at least one group", async ({ browser }) => {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await loginAs(ctx, page, "admin");
  await page.goto("/admin/subscriptions");

  await expect(page.getByRole("heading", { name: "Subscriptions" })).toBeVisible();
  // At least one user-group header row exists (links to /admin/users/<id>).
  const groupLink = page.locator('a[href^="/admin/users/"]').first();
  await expect(groupLink).toBeVisible();
});

test("page-size selector persists across reloads", async ({ browser }) => {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await loginAs(ctx, page, "admin");
  await page.goto("/admin/subscriptions");

  // Pick 25 from the page-size selector.
  await page.getByRole("combobox", { name: /rows per page/i }).click();
  await page.getByRole("option", { name: "25" }).click();

  // Reload — the selection should persist via localStorage.
  await page.reload();
  await expect(page.getByRole("combobox", { name: /rows per page/i })).toContainText("25");
});

test("nav lists Subscriptions before Licenses", async ({ browser }) => {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await loginAs(ctx, page, "admin");
  await page.goto("/admin/users");
  const navLinks = await page.locator("header nav a").allTextContents();
  const subsIdx = navLinks.findIndex((t) => t.trim() === "Subscriptions");
  const licIdx = navLinks.findIndex((t) => t.trim() === "Licenses");
  expect(subsIdx).toBeGreaterThanOrEqual(0);
  expect(licIdx).toBeGreaterThan(subsIdx);
});
