/**
 * End-to-end schedule proposal flow (browser):
 * professor (slot + submit) → director (pick up + approve) → dean (finalize + publish).
 *
 * Professor, director, dean accounts and three section offerings are created by
 * `npx tsx e2e/setup-full-workflow.ts` (see that file for default emails/passwords).
 *
 * Run (app + DB with DATABASE_URL; browser visible):
 *   npx tsx e2e/setup-full-workflow.ts && npx playwright test e2e/full-workflow.spec.ts --headed
 * Or: npm run e2e:full-workflow -- --headed
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test, expect, type Page } from "@playwright/test";

function readWorkflowFile(): { termId: string; termName?: string } | null {
  try {
    return JSON.parse(
      readFileSync(join(process.cwd(), "e2e", ".workflow.json"), "utf8")
    ) as { termId: string; termName?: string };
  } catch {
    return null;
  }
}

/** Empty string in env (e.g. E2E_WF_PROF_EMAIL=) is not nullish, so ?? would not apply — treat as unset. */
function e2eEnv(value: string | undefined, fallback: string): string {
  const t = value?.trim();
  return t ? t : fallback;
}

const profEmail = e2eEnv(process.env.E2E_WF_PROF_EMAIL, "e2e-wf-prof@local.test");
const profPassword = e2eEnv(process.env.E2E_WF_PROF_PASSWORD, "E2E_WF_Password_prof_1!");
const dirEmail = e2eEnv(process.env.E2E_WF_DIR_EMAIL, "e2e-wf-dir@local.test");
const dirPassword = e2eEnv(process.env.E2E_WF_DIR_PASSWORD, "E2E_WF_Password_dir_1!");
const deanEmail = e2eEnv(process.env.E2E_WF_DEAN_EMAIL, "e2e-wf-dean@local.test");
const deanPassword = e2eEnv(process.env.E2E_WF_DEAN_PASSWORD, "E2E_WF_Password_dean_1!");

const profDisplayName = "E2E Workflow Professor";

/** After sign-in, Next.js client navigates to /professor, /director, /dean, or /dashboard. */
const AFTER_LOGIN_PATH = /\/(professor|director|dean|dashboard)(\/|$)/;

test.describe.configure({ mode: "serial" });
test.setTimeout(240_000);

async function login(page: Page, email: string, password: string) {
  if (!email || !password) {
    throw new Error(
      "E2E login: missing email or password. Unset or remove empty E2E_WF_* env vars in .env to use script defaults."
    );
  }
  await page.goto("/login", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: /Log in/i })).toBeVisible({ timeout: 15_000 });
  const form = page.locator("main form");
  const emailBox = form.locator("#email");
  const passwordBox = form.locator("#password");
  await emailBox.fill(email);
  await passwordBox.fill(password);
  await expect(emailBox).toHaveValue(email);
  await expect(passwordBox).toHaveValue(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(AFTER_LOGIN_PATH, { timeout: 30_000, waitUntil: "domcontentloaded" });
}

/** Dismiss the dashboard welcome dialog if shown (z-index overlay blocks all clicks until gone). */
async function dismissWelcomeIfPresent(page: Page) {
  const dialog = page.getByRole("dialog", { name: /Welcome to Soka Scheduling/i });
  if (await dialog.isVisible().catch(() => false)) {
    await page.getByRole("button", { name: "Skip for now" }).click();
    await dialog.waitFor({ state: "hidden", timeout: 15_000 });
    return;
  }
  // Modal can mount just after the first isVisible() check (async /api/accounts/me)
  try {
    await dialog.waitFor({ state: "visible", timeout: 3000 });
  } catch {
    return;
  }
  await page.getByRole("button", { name: "Skip for now" }).click();
  await dialog.waitFor({ state: "hidden", timeout: 15_000 });
}

async function signOut(page: Page) {
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/login/, { timeout: 15_000 });
}

test("full schedule workflow: professor → director → dean (publish)", async ({ page }) => {
  // --- Professor: slot + submit ---
  await login(page, profEmail, profPassword);
  await dismissWelcomeIfPresent(page);
  await expect(page.getByRole("heading", { name: "Professor Dashboard" })).toBeVisible({
    timeout: 15_000,
  });
  await page.goto("/professor/calendar");
  await expect(page.getByRole("heading", { name: "My Calendar" })).toBeVisible();

  const wf = readWorkflowFile();
  if (wf?.termId) {
    await page.goto(`/professor/calendar?term_id=${encodeURIComponent(wf.termId)}`);
  } else {
    const termSelect = page.getByLabel("Term", { exact: true });
    await termSelect.selectOption({ index: 1 });
  }
  await dismissWelcomeIfPresent(page);

  // Wait for assigned offerings (modal only lists courses after this loads; otherwise the Course select stays empty)
  await expect(page.getByText("E2E-WF-1", { exact: false }).first()).toBeVisible({ timeout: 30_000 });

  await page.getByRole("button", { name: "Add slot" }).click();
  const modal = page.getByRole("heading", { name: "Add preferred slot" });
  await expect(modal).toBeVisible();
  // Native <select>: options are in the DOM but Playwright treats non-selected options as *hidden* while the list is closed — do not use toBeVisible() on <option>.
  const courseSelect = page.getByLabel("Course", { exact: true });
  await expect(courseSelect.locator("option", { hasText: "E2E-WF-1" })).toHaveCount(1, { timeout: 15_000 });
  const e2e1OfferingId = await courseSelect
    .locator("option")
    .filter({ hasText: "E2E-WF-1" })
    .first()
    .getAttribute("value");
  expect(e2e1OfferingId, "E2E-WF-1 offering in Course dropdown").toBeTruthy();
  await courseSelect.selectOption(e2e1OfferingId!);
  await page.getByLabel("Day", { exact: true }).selectOption("1");
  await page.getByRole("button", { name: "Create" }).click();
  await expect(modal).toBeHidden();

  await expect(page.getByText(/1 slot\(s\) for your courses/)).toBeVisible();
  await page.getByRole("button", { name: "Submit my schedule for review" }).click();
  // After submit, two lines mention "submitted" (My offerings + Submit section). Target the unique "Submit your proposal" line only.
  await expect(
    page.getByText(/This term's proposal status:\s*submitted/i)
  ).toBeVisible({ timeout: 25_000 });

  await signOut(page);

  // --- Director: pick up + approve ---
  await login(page, dirEmail, dirPassword);
  await dismissWelcomeIfPresent(page);
  await page.goto("/director/approvals");
  await dismissWelcomeIfPresent(page);
  await expect(page.getByRole("heading", { name: "Pending Approvals" })).toBeVisible();
  const reviewLink = page.getByRole("link", { name: "Review" }).first();
  await expect(reviewLink).toBeVisible({ timeout: 15_000 });
  await reviewLink.click();
  await expect(page.getByText(new RegExp(profDisplayName, "i"))).toBeVisible();
  await page.getByRole("button", { name: "Pick up for review" }).click();
  await expect(page.getByText(/Status:\s*under review/i)).toBeVisible({ timeout: 15_000 });
  await page.getByRole("button", { name: "Approve" }).click();
  await expect(page.getByText(/Status:\s*approved/i)).toBeVisible({ timeout: 15_000 });
  await signOut(page);

  // --- Dean: finalize + publish ---
  await login(page, deanEmail, deanPassword);
  await dismissWelcomeIfPresent(page);
  await page.goto("/dean/proposals", { waitUntil: "domcontentloaded" });
  await dismissWelcomeIfPresent(page);
  await expect(page.getByRole("heading", { name: "Proposals" })).toBeVisible();
  const deanStatusFilter = page.getByRole("combobox", { name: "Status" });
  await expect(deanStatusFilter).toBeVisible({ timeout: 30_000 });
  await deanStatusFilter.selectOption("approved");
  await expect(page.getByText(profDisplayName).first()).toBeVisible({ timeout: 20_000 });
  await page.getByRole("link", { name: "Review" }).first().click();
  await page.getByRole("button", { name: "Finalize" }).click();
  await expect(page.getByText(/Status:\s*finalized/i)).toBeVisible({ timeout: 20_000 });
  await page.goto("/dean/proposals", { waitUntil: "domcontentloaded" });
  const deanStatusFilter2 = page.getByRole("combobox", { name: "Status" });
  await expect(deanStatusFilter2).toBeVisible({ timeout: 30_000 });
  await deanStatusFilter2.selectOption("finalized");
  await expect(page.getByText(profDisplayName).first()).toBeVisible({ timeout: 15_000 });
  await page.getByRole("button", { name: "Publish term" }).click();
  await expect(page.getByRole("heading", { name: "Proposals" })).toBeVisible();
});
