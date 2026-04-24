import { test, expect, type Page } from "@playwright/test";

const professorEmail = process.env.E2E_PROFESSOR_EMAIL ?? "";
const professorPassword = process.env.E2E_PROFESSOR_PASSWORD ?? "";
const canLoginAsProfessor = Boolean(professorEmail && professorPassword);

async function dismissWelcomeTourIfPresent(page: Page) {
  const welcome = page.getByRole("dialog", { name: /Welcome to Soka Scheduling/i });
  try {
    await welcome.waitFor({ state: "visible", timeout: 3000 });
  } catch {
    return;
  }
  await page.getByRole("button", { name: "Skip for now" }).click();
  await welcome.waitFor({ state: "hidden" });
}

async function loginAsProfessor(page: Page) {
  await page.goto("/login?redirect=/professor");
  await page.getByLabel("Email").fill(professorEmail);
  await page.getByLabel("Password").fill(professorPassword);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(/\/(professor|dashboard)(\/|$)/, { timeout: 20_000 });
  await dismissWelcomeTourIfPresent(page);
  await expect(page.getByRole("heading", { name: "Professor Dashboard" })).toBeVisible({
    timeout: 15_000,
  });
}

test.describe("Professor flow", () => {
  test("sends unauthenticated users to login with redirect", async ({ page }) => {
    await page.goto("/professor");
    await expect(page).toHaveURL(/\/login/);
    expect(new URL(page.url()).searchParams.get("redirect")).toBe("/professor");
    await expect(page.getByRole("heading", { name: /Log in/i })).toBeVisible();
  });

  test("professor: login, dashboard, and calendar navigation", async ({ page }) => {
    test.skip(
      !canLoginAsProfessor,
      "Set E2E_PROFESSOR_EMAIL and E2E_PROFESSOR_PASSWORD in the environment to run this test."
    );

    await loginAsProfessor(page);
    await expect(page).toHaveURL(/\/professor/);

    await page.getByRole("link", { name: "Calendar" }).first().click();
    await expect(page).toHaveURL(/\/professor\/calendar/);
    await expect(page.getByRole("heading", { name: "My Calendar" })).toBeVisible();
  });
});
