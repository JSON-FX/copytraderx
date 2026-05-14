import { test, expect } from "@playwright/test";
import { loginAs } from "./helpers/auth";

test("admin issues a trial license and sees the key", async ({ page, context }) => {
  await loginAs(context, page, "admin");

  await page.goto("/admin/trials");
  await expect(page.getByRole("heading", { name: "Trials" })).toBeVisible();

  await page.getByRole("link", { name: "+ New trial" }).click();
  await expect(page.getByRole("heading", { name: "New trial" })).toBeVisible();

  const stamp = Date.now();
  const mt5 = 90000000 + (stamp % 9000000);
  const email = `trial-${stamp}@example.com`;

  // The form labels are plain <label> elements without htmlFor/id, so we
  // select the controls by their element type within the form.
  await page.locator("form select").selectOption({ index: 0 });
  await page.locator('form input[type="number"]').fill(String(mt5));
  await page.locator('form input[type="email"]').fill(email);
  await page.locator('form input[type="text"]').first().fill(`@t${stamp}`);

  await page.getByRole("button", { name: "Create trial" }).click();

  // Success state renders the "Trial issued." paragraph and a <pre> with the key.
  await expect(page.getByText(/Trial issued/)).toBeVisible();

  const keyText = (await page.locator("pre").innerText()).trim();
  expect(keyText).toMatch(
    /^[A-Z]+-[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/,
  );

  await page.getByRole("button", { name: "Back to trials" }).click();

  // The table renders the license key as a link in the first column.
  await expect(page.getByText(keyText)).toBeVisible();
});
