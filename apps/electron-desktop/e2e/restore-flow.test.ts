import { test, expect, type Page } from "@playwright/test";
import { type AppContext, launchApp, closeApp, waitForConsentScreen } from "./helpers";

test.describe("Import / Restore flow", () => {
  test.describe.configure({ mode: "serial" });

  let ctx: AppContext;
  let page: Page;

  test.beforeAll(async () => {
    ctx = await launchApp();
    page = ctx.page;
  });

  test.afterAll(async () => {
    if (ctx) await closeApp(ctx);
  });

  test("import button navigates to restore options", async () => {
    test.setTimeout(90_000);
    await waitForConsentScreen(page);
    await page.getByText("Import an existing setup").click();

    const restorePage = page.locator('[aria-label="Restore option"]');
    await restorePage.waitFor({ state: "visible", timeout: 30_000 });

    await expect(page.locator('input[value="local"]')).toBeAttached();
    await expect(page.locator('input[value="file"]')).toBeAttached();
    await expect(page.getByRole("button", { name: "Restore now" })).toBeVisible();
  });

  test("back from restore options returns to consent", async () => {
    await page
      .locator('[aria-label="Restore option"]')
      .getByRole("button", { name: "Back" })
      .click();

    await waitForConsentScreen(page);
    await expect(page.locator('[role="dialog"][aria-label="User agreement"]')).toBeVisible();
  });

  test("file restore page renders correctly", async () => {
    await page.getByText("Import an existing setup").click();
    await page
      .locator('[aria-label="Restore option"]')
      .waitFor({ state: "visible", timeout: 15_000 });

    await page.locator('input[value="file"]').check({ force: true });
    await page.getByRole("button", { name: "Restore now" }).click();

    const fileRestorePage = page.locator('[aria-label="Restore from backup file"]');
    await fileRestorePage.waitFor({ state: "visible", timeout: 15_000 });

    await expect(page.getByText("Drag ZIP folder here")).toBeVisible();
    await expect(page.getByText("choose a file")).toBeVisible();
    await expect(fileRestorePage.getByRole("button", { name: "Back" })).toBeVisible();
  });

  test("back from file restore returns to restore options", async () => {
    await page
      .locator('[aria-label="Restore from backup file"]')
      .getByRole("button", { name: "Back" })
      .click();

    await expect(page.locator('[aria-label="Restore option"]')).toBeVisible({ timeout: 10_000 });
  });
});
