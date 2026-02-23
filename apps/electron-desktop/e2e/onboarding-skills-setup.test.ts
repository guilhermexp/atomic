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
  waitForSkillsPage,
  skipSkills,
  waitForConnectionsPage,
  getConfig,
  getTestCredentials,
  getE2EConfig,
} from "./helpers";

const creds = getTestCredentials();

function getObj(val: unknown): Record<string, unknown> {
  return val && typeof val === "object" && !Array.isArray(val)
    ? (val as Record<string, unknown>)
    : {};
}

test.describe("Skills setup during onboarding", () => {
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

  test("navigate through onboarding to skills page", async () => {
    test.setTimeout(180_000);
    await acceptConsent(page);
    await waitForProviderSelect(page);
    await selectProvider(page, creds!.provider);
    await enterApiKey(page, creds!.key);
    await waitForModelSelect(page);
    await selectFirstModel(page);
    // Skills page may take extra time after model selection config.patch
    await page
      .locator('[aria-label="Skills setup"]')
      .waitFor({ state: "visible", timeout: 30_000 });
    await expect(page.getByText("Set Up Skills")).toBeVisible();
  });

  test("media understanding toggles work", async () => {
    test.setTimeout(60_000);
    const mediaCard = page.locator('[role="group"][aria-label="Media Analysis"]');
    await mediaCard.getByText("Connect").click();

    const mediaPage = page.locator('[aria-label="Media understanding setup"]');
    await mediaPage.waitFor({ state: "visible", timeout: 15_000 });

    // Verify three checkbox rows exist
    const imageCheckbox = mediaPage
      .locator("label")
      .filter({ hasText: "Images" })
      .locator('input[type="checkbox"]');
    const audioCheckbox = mediaPage
      .locator("label")
      .filter({ hasText: "Audio" })
      .locator('input[type="checkbox"]');
    const videoCheckbox = mediaPage
      .locator("label")
      .filter({ hasText: "Video" })
      .locator('input[type="checkbox"]');

    await expect(imageCheckbox).toBeAttached();
    await expect(audioCheckbox).toBeAttached();
    await expect(videoCheckbox).toBeAttached();

    // Ensure image is checked (enable if not)
    if (!(await imageCheckbox.isChecked())) {
      await imageCheckbox.check({ force: true });
    }

    // Media understanding may require an OpenAI API key if provider is not openai.
    // If the key input is visible, enter it from config or go back.
    const openaiKeyInput = mediaPage.locator('input[type="password"]');
    if (await openaiKeyInput.isVisible().catch(() => false)) {
      const cfg = getE2EConfig();
      const openaiKey = cfg.providers?.openai?.key?.trim();
      if (openaiKey && !openaiKey.includes("...")) {
        await openaiKeyInput.fill(openaiKey);
        await page.waitForTimeout(300);
        const continueBtn = mediaPage.getByRole("button", {
          name: /Continue|Save/,
        });
        await continueBtn.click();
        await waitForSkillsPage(page);
      } else {
        // No OpenAI key available — go back to skills page
        await mediaPage.getByRole("button", { name: "Back" }).click();
        await waitForSkillsPage(page);
      }
    } else {
      const continueBtn = mediaPage.getByRole("button", {
        name: /Continue|Save/,
      });
      await continueBtn.click();
      await waitForSkillsPage(page);
    }
  });

  test("web search setup", async () => {
    const cfg = getE2EConfig();
    const webSearchEntry = cfg.skills?.["webSearch"] ?? cfg.skills?.["web-search"];
    const webSearchKey = (webSearchEntry as Record<string, string> | undefined)?.key ?? null;
    test.skip(!webSearchKey, "No web search API key in e2e.config.json");
    test.setTimeout(60_000);

    const webSearchCard = page.locator('[role="group"][aria-label="Advanced Web Search"]');
    await webSearchCard.getByText("Connect").click();

    const wsPage = page.locator('[aria-label="Web search setup"]');
    await wsPage.waitFor({ state: "visible", timeout: 15_000 });

    // Select first available provider radio
    const radios = wsPage.locator('input[name="web-search-provider"]');
    await radios.first().check({ force: true });

    const keyInput = wsPage.locator('input[type="password"]').first();
    await keyInput.fill(webSearchKey!);
    await page.waitForTimeout(300);

    const continueBtn = wsPage.getByRole("button", {
      name: /Continue|Save/,
    });
    await continueBtn.click();

    await waitForSkillsPage(page);

    const snap = await getConfig(page);
    const cfg2 = getObj(snap.config);
    const tools = getObj(cfg2.tools);
    const web = getObj(tools.web);
    const search = getObj(web.search);
    expect(search.enabled).toBe(true);
  });

  test("skip skills without configuring", async () => {
    test.setTimeout(30_000);
    await skipSkills(page);
    await waitForConnectionsPage(page);
    await expect(page.locator('[aria-label="Skills setup"]')).not.toBeVisible();
  });
});
