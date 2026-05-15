import { expect, test } from "@playwright/test";
import { loginAs } from "./helpers/auth";

test.describe("User journal redesign — preferences smoke", () => {
  test("user can toggle global P/L display preference", async ({ context, page }) => {
    await loginAs(context, page, "user");

    await page.goto("/dashboard/settings");
    await expect(page.getByRole("heading", { name: /^Settings$/ })).toBeVisible();
    await expect(page.getByText(/Show P\/L as/)).toBeVisible();

    // Initial state: % is active by default
    const pctButton = page.getByRole("button", { name: "%" });
    const dollarButton = page.getByRole("button", { name: "$" });
    await expect(pctButton).toBeVisible();
    await expect(dollarButton).toBeVisible();

    // Toggle to $; wait for the action to settle
    await dollarButton.click();
    await page.waitForLoadState("networkidle");

    // Reload — value persisted via server action upsert into user_preferences
    await page.reload();
    await expect(page.getByRole("heading", { name: /^Settings$/ })).toBeVisible();

    // The $ button should now visually appear as the active selection.
    // The active button has the "bg-foreground" class applied via cn();
    // Playwright can probe the class list of the dollar button to confirm
    // the persisted state. (Class-based assertion is brittle but adequate
    // for a smoke test — full visual verification belongs in a regression suite.)
    const dollarBtnHandle = await dollarButton.elementHandle();
    expect(dollarBtnHandle).not.toBeNull();
    const dollarClasses = await dollarBtnHandle!.getAttribute("class");
    expect(dollarClasses).toContain("bg-foreground");

    // Toggle back to % to leave the test env in a known state for other tests
    await pctButton.click();
    await page.waitForLoadState("networkidle");
  });

  test("Settings link is reachable from the dashboard nav", async ({ context, page }) => {
    await loginAs(context, page, "user");
    await page.goto("/dashboard");
    await page.getByRole("link", { name: /Settings/ }).click();
    await page.waitForURL(/\/dashboard\/settings$/);
    await expect(page.getByRole("heading", { name: /^Settings$/ })).toBeVisible();
  });
});
