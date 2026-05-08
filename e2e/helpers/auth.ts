import type { Page, BrowserContext } from "@playwright/test";

export async function loginAs(
  _ctx: BrowserContext,
  page: Page,
  who: "admin" | "user",
): Promise<void> {
  const email = who === "admin"
    ? process.env.INITIAL_ADMIN_EMAIL!
    : process.env.TEST_USER_EMAIL!;
  const password = who === "admin"
    ? process.env.INITIAL_ADMIN_PASSWORD!
    : process.env.TEST_USER_PASSWORD!;

  await page.goto("/login");
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/password/i).fill(password);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForLoadState("networkidle");
}
