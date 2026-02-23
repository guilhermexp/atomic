import { test, expect, type Page } from "@playwright/test";
import {
  type AppContext,
  launchApp,
  closeApp,
  finishOnboarding,
  navigateToSettings,
  getConfig,
  getTestCredentials,
  getSecondProviderCredentials,
} from "./helpers";

const creds = getTestCredentials();

const PROVIDER_DISPLAY_NAMES: Record<string, string> = {
  anthropic: "Anthropic (Claude)",
  openai: "OpenAI (API Key)",
  openrouter: "OpenRouter",
  google: "Google (Gemini)",
  nvidia: "NVIDIA NIM",
  xai: "xAI (Grok)",
  zai: "Z.ai (GLM)",
  minimax: "MiniMax",
  moonshot: "Moonshot (Kimi)",
  "kimi-coding": "Kimi Coding",
};

function getObj(val: unknown): Record<string, unknown> {
  return val && typeof val === "object" && !Array.isArray(val)
    ? (val as Record<string, unknown>)
    : {};
}

test.describe("Settings page", () => {
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

  test("navigate to settings and see tabs", async () => {
    test.setTimeout(120_000);
    await finishOnboarding(page, creds!);
    await navigateToSettings(page);

    await expect(page.locator('[aria-label="Settings page"]')).toBeVisible();

    const tabNav = page.locator('[aria-label="Settings sections"]');
    for (const tabName of ["AI Models", "AI Providers", "Messengers", "Skills", "Voice", "Other"]) {
      await expect(tabNav.getByText(tabName)).toBeVisible();
    }
  });

  test("switch between settings tabs", async () => {
    test.setTimeout(60_000);
    const tabNav = page.locator('[aria-label="Settings sections"]');

    await tabNav.getByText("AI Models").click();
    await expect(page.locator('[aria-label="Model list"]')).toBeVisible({ timeout: 15_000 });

    await tabNav.getByText("AI Providers").click();
    // Provider tiles use aria-label like "Anthropic (Claude) (configured)"
    await expect(page.locator('[role="button"][aria-label*="(configured)"]').first()).toBeVisible({
      timeout: 15_000,
    });

    await tabNav.getByText("Messengers").click();
    await expect(page.locator('[role="group"][aria-label="Telegram"]')).toBeVisible({
      timeout: 15_000,
    });

    await tabNav.getByText("Skills").click();
    await expect(page.getByPlaceholder("Search by skills…")).toBeVisible({ timeout: 15_000 });

    await tabNav.getByText("Other").click();
    await expect(page.locator('[aria-label="Launch at startup"]')).toBeVisible({ timeout: 15_000 });
  });

  test("change default model via settings", async () => {
    test.setTimeout(60_000);
    const tabNav = page.locator('[aria-label="Settings sections"]');
    await tabNav.getByText("AI Models").click();
    await page.locator('[aria-label="Model list"]').waitFor({ state: "visible", timeout: 15_000 });

    const radios = page.locator('input[name="model"]');
    const count = await radios.count();
    if (count < 2) {
      test.skip(true, "Only one model available, cannot test switching");
      return;
    }

    const originalModel = await page.locator('input[name="model"]:checked').getAttribute("value");

    await radios.nth(1).check({ force: true });
    await page.waitForTimeout(2_000);

    const snap = await getConfig(page);
    const cfg = getObj(snap.config);
    const agents = getObj(cfg.agents);
    const defaults = getObj(agents.defaults);
    const model = getObj(defaults.model);
    expect(model.primary).not.toBe(originalModel);
  });

  test("add second provider", async () => {
    const secondCreds = getSecondProviderCredentials();
    test.skip(!secondCreds, "Need 2+ provider keys in e2e.config.json");
    test.setTimeout(60_000);

    const tabNav = page.locator('[aria-label="Settings sections"]');
    await tabNav.getByText("AI Providers").click();
    await page.waitForTimeout(1_000);

    const displayName = PROVIDER_DISPLAY_NAMES[secondCreds!.provider] ?? secondCreds!.provider;

    // Click the "Connect" button inside the unconfigured provider tile
    const tile = page.locator(`[role="button"][aria-label="${displayName}"]`);
    await tile.getByRole("button", { name: "Connect" }).click();

    // Wait for the API key input modal/page to appear
    await page.waitForTimeout(1_000);
    const keyInput = page.locator('input[type="password"], input[type="text"]').last();
    await keyInput.waitFor({ state: "visible", timeout: 10_000 });
    await keyInput.fill(secondCreds!.key);
    await page.waitForTimeout(500);

    const submitBtn = page
      .getByRole("button", {
        name: /Continue|Save|Connect/,
      })
      .last();
    await submitBtn.click();

    await page.waitForTimeout(5_000);

    const snap = await getConfig(page);
    const cfg = getObj(snap.config);
    const auth = getObj(cfg.auth);
    const profiles = getObj(auth.profiles);
    expect(Object.keys(profiles).length).toBeGreaterThanOrEqual(2);
  });

  test("navigate back to chat from settings", async () => {
    test.setTimeout(15_000);
    await page.locator('[aria-label="New session"]').click();

    await expect(page.getByText("What can I help with?")).toBeVisible({ timeout: 10_000 });
  });
});
