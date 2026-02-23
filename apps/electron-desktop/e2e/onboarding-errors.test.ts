import { test, expect, type Page } from "@playwright/test";
import {
  type AppContext,
  launchApp,
  closeApp,
  acceptConsent,
  waitForProviderSelect,
  selectProvider,
  waitForApiKeyPage,
  enterApiKey,
  waitForModelSelect,
  clickBackButton,
  getTestCredentials,
} from "./helpers";

const creds = getTestCredentials();

test.describe("Onboarding error handling", () => {
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

  test("empty API key shows validation error", async () => {
    test.setTimeout(90_000);
    await acceptConsent(page);
    await waitForProviderSelect(page);
    await selectProvider(page, "openai");
    await waitForApiKeyPage(page);

    await page
      .locator('[aria-label="API key setup"]')
      .getByRole("button", { name: "Continue" })
      .click();

    await expect(page.getByText("Please enter your API key to continue")).toBeVisible({
      timeout: 5_000,
    });

    await expect(page.locator('[aria-label="API key setup"]')).toBeVisible();
  });

  test("invalid API key shows provider error", async () => {
    test.setTimeout(60_000);
    const container = page.locator('[aria-label="API key setup"]');
    const input = container.locator("input").first();
    await input.click();
    await input.fill("invalid-key-123");
    await page.waitForTimeout(300);

    const btn = container.getByRole("button", { name: "Continue" });
    await btn.click();

    // Wait for validation to complete (button text changes from "Validating…" back)
    await page.waitForTimeout(1_000);
    await expect(btn).not.toHaveText("Validating…", { timeout: 30_000 });

    // Should still be on the API key page (not navigated away)
    await expect(container).toBeVisible();
  });

  test("recovery: valid key after invalid error", async () => {
    test.skip(!creds, "No API key — create e2e/e2e.config.json (see e2e.config.example.json)");
    test.setTimeout(120_000);

    // Navigate back to provider select and choose the correct provider
    // (previous tests used hardcoded "openai" which may not match creds)
    await clickBackButton(page, "API key setup");
    await waitForProviderSelect(page);
    await selectProvider(page, creds!.provider);
    await waitForApiKeyPage(page);

    // Enter the valid key
    await enterApiKey(page, creds!.key);

    await waitForModelSelect(page);
    await expect(page.locator('[aria-label="Model selection"]')).toBeVisible();
  });
});
