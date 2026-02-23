import { test, expect, type Page } from "@playwright/test";
import {
  type AppContext,
  launchApp,
  closeApp,
  acceptConsent,
  waitForProviderSelect,
  selectProvider,
  enterApiKey,
  waitForModelSelect,
  selectFirstModel,
  skipSkills,
  waitForConnectionsPage,
  getTestCredentials,
} from "./helpers";

const creds = getTestCredentials();

test.describe("Onboarding — connection pages", () => {
  test.describe.configure({ mode: "serial" });

  let ctx: AppContext;
  let page: Page;

  test.skip(!creds, "No API key — create e2e/e2e.config.json (see e2e.config.example.json)");

  test.beforeAll(async () => {
    ctx = await launchApp();
    page = ctx.page;
  });

  test.afterAll(async () => {
    if (ctx) await closeApp(ctx);
  });

  test("navigate through onboarding to connections page", async () => {
    test.setTimeout(180_000);
    await acceptConsent(page);
    await waitForProviderSelect(page);
    await selectProvider(page, creds!.provider);
    await enterApiKey(page, creds!.key);
    await waitForModelSelect(page);
    await selectFirstModel(page);
    await skipSkills(page);
    await waitForConnectionsPage(page);

    await expect(page.getByText("Set Up Connections")).toBeVisible();
  });

  test("connections page shows Telegram and Slack cards", async () => {
    test.setTimeout(15_000);
    const telegramCard = page.locator('[role="group"][aria-label="Telegram"]');
    await expect(telegramCard).toBeVisible();
    await expect(telegramCard.getByText("Telegram", { exact: true })).toBeVisible();

    const slackCard = page.locator('[role="group"][aria-label="Slack"]');
    await expect(slackCard).toBeVisible();
    await expect(slackCard.getByText("Slack", { exact: true })).toBeVisible();
  });

  test("connections page has Skip, Continue, and Back buttons", async () => {
    test.setTimeout(10_000);
    const container = page.locator('[aria-label="Connections setup"]');
    await expect(container.getByRole("button", { name: "Skip" })).toBeVisible();
    await expect(container.getByRole("button", { name: "Continue" })).toBeVisible();
    await expect(container.getByText("Back")).toBeVisible();
  });

  test("clicking Slack Connect opens Slack setup page", async () => {
    test.setTimeout(15_000);
    const slackCard = page.locator('[role="group"][aria-label="Slack"]');
    await slackCard.getByText("Connect").click();

    const slackPage = page.locator('[aria-label="Slack setup"]');
    await slackPage.waitFor({ state: "visible", timeout: 15_000 });

    await expect(page.getByText("Connect Slack")).toBeVisible();
  });

  test("Slack setup page shows form fields", async () => {
    test.setTimeout(15_000);
    const slackPage = page.locator('[aria-label="Slack setup"]');

    await expect(slackPage.getByText("Bot display name")).toBeVisible();
    await expect(slackPage.getByText("Bot token xoxb")).toBeVisible();
    await expect(slackPage.getByText("App token xapp")).toBeVisible();
    await expect(slackPage.getByText("Channel access policy")).toBeVisible();
    await expect(slackPage.getByText("DM policy")).toBeVisible();
  });

  test("Slack setup page has Back and Connect buttons", async () => {
    test.setTimeout(10_000);
    const slackPage = page.locator('[aria-label="Slack setup"]');
    await expect(slackPage.getByText("Back")).toBeVisible();
    await expect(slackPage.getByRole("button", { name: "Connect" })).toBeVisible();
  });

  test("Back from Slack returns to connections page", async () => {
    test.setTimeout(15_000);
    const slackPage = page.locator('[aria-label="Slack setup"]');
    await slackPage.getByText("Back").click();

    await waitForConnectionsPage(page);
    await expect(page.getByText("Set Up Connections")).toBeVisible();
  });

  test("clicking Telegram Connect opens Telegram setup page", async () => {
    test.setTimeout(15_000);
    const telegramCard = page.locator('[role="group"][aria-label="Telegram"]');
    await telegramCard.getByText("Connect").click();

    // The Telegram setup page should appear with a bot token label
    await page.waitForTimeout(2_000);
    await expect(page.getByText("Telegram bot token", { exact: true })).toBeVisible({
      timeout: 10_000,
    });
  });

  test("Back from Telegram returns to connections page", async () => {
    test.setTimeout(15_000);
    const backBtn = page.getByRole("button", { name: "Back" }).first();
    await backBtn.click();

    await waitForConnectionsPage(page);
    await expect(page.getByText("Set Up Connections")).toBeVisible();
  });

  test("connections page Back returns to skills page", async () => {
    test.setTimeout(15_000);
    const container = page.locator('[aria-label="Connections setup"]');
    await container.getByText("Back").click();

    await page
      .locator('[aria-label="Skills setup"]')
      .waitFor({ state: "visible", timeout: 15_000 });
    await expect(page.getByText("Set Up Skills")).toBeVisible();
  });
});
