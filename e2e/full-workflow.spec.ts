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

const profEmail = process.env.E2E_WF_PROF_EMAIL ?? "e2e-wf-prof@local.test";
const profPassword = process.env.E2E_WF_PROF_PASSWORD ?? "E2E_WF_Password_prof_1!";
const dirEmail = process.env.E2E_WF_DIR_EMAIL ?? "e2e-wf-dir@local.test";
const dirPassword = process.env.E2E_WF_DIR_PASSWORD ?? "E2E_WF_Password_dir_1!";
const deanEmail = process.env.E2E_WF_DEAN_EMAIL ?? "e2e-wf-dean@local.test";
const deanPassword = process.env.E2E_WF_DEAN_PASSWORD ?? "E2E_WF_Password_dean_1!";

const profDisplayName = "E2E Workflow Professor";

test.describe.configure({ mode: "serial" });
test.setTimeout(240_000);

async function login(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
}

async function dismissWelcomeIfPresent(page: Page) {
  const dialog = page.getByRole("dialog", { name: /Welcome to Soka Scheduling/i });
  if (await dialog.isVisible().catch(() => false)) {
    await page.getByRole("button", { name: "Skip for now" }).click();
    await dialog.waitFor({ state: "hidden" });
  }
}

async function signOut(page: Page) {
  await page.getByRole("link", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/login/, { timeout: 15_000 });
}

test("full schedule workflow: professor → director → dean (publish)", async ({ page }) => {
  // --- Professor: slot + submit ---
  await login(page, profEmail, profPassword);
  await page.waitForURL(/\/(professor|dashboard)/, { timeout: 20_000 });
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

  await page.getByRole("button", { name: "Add slot" }).click();
  const modal = page.getByRole("heading", { name: "Add preferred slot" });
  await expect(modal).toBeVisible();
  await page.getByLabel("Course", { exact: true }).selectOption({ label: /E2E-WF-1/ });
  await page.getByLabel("Day", { exact: true }).selectOption("1");
  await page.getByRole("button", { name: "Create" }).click();
  await expect(modal).toBeHidden();

  await expect(page.getByText(/1 slot\(s\) for your courses/)).toBeVisible();
  await page.getByRole("button", { name: "Submit my schedule for review" }).click();
  await expect(
    page.getByText(/This term's proposal status:|Status:\s*submitted/i)
  ).toBeVisible({ timeout: 25_000 });

  await signOut(page);

  // --- Director: pick up + approve ---
  await login(page, dirEmail, dirPassword);
  await page.waitForURL(/\/(director|dashboard)/, { timeout: 20_000 });
  await dismissWelcomeIfPresent(page);
  await page.goto("/director/approvals");
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
  await page.waitForURL(/\/(dean|dashboard)/, { timeout: 20_000 });
  await dismissWelcomeIfPresent(page);
  await page.goto("/dean/proposals");
  await expect(page.getByRole("heading", { name: "Proposals" })).toBeVisible();
  await page.getByLabel("Status").selectOption("approved");
  await expect(page.getByText(profDisplayName).first()).toBeVisible({ timeout: 20_000 });
  await page.getByRole("link", { name: "Review" }).first().click();
  await page.getByRole("button", { name: "Finalize" }).click();
  await expect(page.getByText(/Status:\s*finalized/i)).toBeVisible({ timeout: 20_000 });
  await page.goto("/dean/proposals");
  await page.getByLabel("Status").selectOption("finalized");
  await expect(page.getByText(profDisplayName).first()).toBeVisible({ timeout: 15_000 });
  await page.getByRole("button", { name: "Publish term" }).click();
  await expect(page.getByRole("heading", { name: "Proposals" })).toBeVisible();
});
