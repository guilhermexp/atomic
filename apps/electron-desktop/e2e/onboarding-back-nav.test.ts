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
  selectFirstModel,
  waitForSkillsPage,
  skipSkills,
  waitForConnectionsPage,
  skipConnections,
  clickBackButton,
  getConfig,
  getTestCredentials,
} from "./helpers";

const creds = getTestCredentials();

function getObj(val: unknown): Record<string, unknown> {
  return val && typeof val === "object" && !Array.isArray(val)
    ? (val as Record<string, unknown>)
    : {};
}

test.describe("Onboarding back navigation", () => {
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

  test("back from API key to provider select", async () => {
    test.setTimeout(120_000);
    await acceptConsent(page);
    await waitForProviderSelect(page);
    await selectProvider(page, creds!.provider);
    await waitForApiKeyPage(page);

    await clickBackButton(page, "API key setup");

    await waitForProviderSelect(page);
    await expect(page.locator('[aria-label="Provider selection"]')).toBeVisible();
  });

  test("back from model select to API key", async () => {
    test.setTimeout(120_000);
    await selectProvider(page, creds!.provider);
    await enterApiKey(page, creds!.key);
    await waitForModelSelect(page);

    await clickBackButton(page, "Model selection");

    await waitForApiKeyPage(page);
    await expect(page.locator('[aria-label="API key setup"]')).toBeVisible();
  });

  test("back from skills to model select", async () => {
    test.setTimeout(120_000);
    await enterApiKey(page, creds!.key);
    await waitForModelSelect(page);
    await selectFirstModel(page);
    await waitForSkillsPage(page);

    await clickBackButton(page, "Skills setup");

    await waitForModelSelect(page);
    await expect(page.locator('[aria-label="Model selection"]')).toBeVisible();
  });

  test("back from connections to skills", async () => {
    test.setTimeout(120_000);
    await selectFirstModel(page);
    await waitForSkillsPage(page);
    await skipSkills(page);
    await waitForConnectionsPage(page);

    await clickBackButton(page, "Connections setup");

    await waitForSkillsPage(page);
    await expect(page.locator('[aria-label="Skills setup"]')).toBeVisible();
  });

  test("full back-forward cycle preserves config consistency", async () => {
    test.setTimeout(180_000);

    // Forward: skills → connections (already on skills from previous test)
    await skipSkills(page);
    await waitForConnectionsPage(page);

    // Back all the way to provider select
    await clickBackButton(page, "Connections setup");
    await waitForSkillsPage(page);
    await clickBackButton(page, "Skills setup");
    await waitForModelSelect(page);
    await clickBackButton(page, "Model selection");
    await waitForApiKeyPage(page);
    await clickBackButton(page, "API key setup");
    await waitForProviderSelect(page);

    // Forward again through the entire flow
    await selectProvider(page, creds!.provider);
    await enterApiKey(page, creds!.key);
    await waitForModelSelect(page);
    const modelId = await selectFirstModel(page);
    await waitForSkillsPage(page);
    await skipSkills(page);
    await waitForConnectionsPage(page);
    await skipConnections(page);

    // Verify config is consistent after full back-forward cycle
    const snap = await getConfig(page);
    const cfg = getObj(snap.config);
    const auth = getObj(cfg.auth);
    const profiles = getObj(auth.profiles);
    expect(Object.keys(profiles).length).toBeGreaterThan(0);

    const agents = getObj(cfg.agents);
    const defaults = getObj(agents.defaults);
    const model = getObj(defaults.model);
    expect(model.primary).toBe(modelId);
  });
});
