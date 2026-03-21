import { test, expect } from "@playwright/test";

/**
 * E2E smoke test: main workflow - home page loads, login flow reachable.
 */
test("home page loads and login is reachable", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /Soka Academic Scheduling/i })).toBeVisible();
  await expect(page.getByRole("link", { name: /Log in/i })).toBeVisible();

  await page.getByRole("link", { name: /Log in/i }).click();
  await expect(page).toHaveURL(/\/login/);
  await expect(page.getByRole("heading", { name: /Log in/i })).toBeVisible();
});
