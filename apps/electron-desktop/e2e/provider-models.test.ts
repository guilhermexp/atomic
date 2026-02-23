import { test, expect, type Page } from "@playwright/test";
import {
  type AppContext,
  launchApp,
  closeApp,
  finishOnboarding,
  navigateToSettings,
  gatewayRpc,
  getConfig,
  sendChatMessage,
  waitForAssistantResponse,
  getTestCredentials,
  getSecondProviderCredentials,
} from "./helpers";

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

const creds = getTestCredentials();
const secondCreds = getSecondProviderCredentials();

test.describe("Provider addition, model listing, and model switching", () => {
  test.describe.configure({ mode: "serial" });

  let ctx: AppContext;
  let page: Page;

  let originalModelPrimary: string;
  let initialModelCount: number;

  test.skip(
    !creds,
    "No primary API key — create e2e/e2e.config.json (see e2e.config.example.json)"
  );
  test.skip(!secondCreds, "No second provider key — configure 2+ provider keys in e2e.config.json");

  test.beforeAll(async () => {
    ctx = await launchApp();
    page = ctx.page;
  });

  test.afterAll(async () => {
    if (ctx) await closeApp(ctx);
  });

  // ── Onboarding ────────────────────────────────────────────

  test("complete onboarding with default provider", async () => {
    test.setTimeout(120_000);
    await finishOnboarding(page, creds!);
  });

  // ── Record initial state ──────────────────────────────────

  test("record initial model and model count", async () => {
    test.setTimeout(30_000);
    const snap = await getConfig(page);
    const cfg = getObj(snap.config);
    const agents = getObj(cfg.agents);
    const defaults = getObj(agents.defaults);
    const model = getObj(defaults.model);
    originalModelPrimary = model.primary as string;
    expect(originalModelPrimary).toBeTruthy();

    const result = await gatewayRpc<{
      models: Array<{ id: string; name?: string; provider?: string }>;
    }>(page, "models.list", {});
    initialModelCount = result.models.length;
    expect(initialModelCount).toBeGreaterThan(0);
  });

  // ── Add second provider via Settings UI ───────────────────

  test("navigate to AI Providers and add second provider", async () => {
    test.setTimeout(60_000);
    await navigateToSettings(page);

    const tabNav = page.locator('[aria-label="Settings sections"]');
    await tabNav.getByText("AI Providers").click();
    await page.waitForTimeout(1_000);

    const displayName = PROVIDER_DISPLAY_NAMES[secondCreds!.provider] ?? secondCreds!.provider;

    // Click "Connect" button inside the unconfigured provider tile
    const tile = page.locator(`[role="button"][aria-label="${displayName}"]`);
    await tile.waitFor({ state: "visible", timeout: 10_000 });
    const connectBtn = tile.locator("button", { hasText: "Connect" });
    await connectBtn.click();

    // Wait for modal to appear (aria-label depends on provider auth type)
    const modal = page.locator('[role="dialog"]');
    await modal.waitFor({ state: "visible", timeout: 10_000 });

    // Fill in the API key
    const keyInput = modal.locator('input[type="password"]');
    await keyInput.fill(secondCreds!.key);

    // Click Save
    const saveBtn = modal.locator("button").filter({ hasText: /Save/ });
    await saveBtn.click();

    // Wait for modal to close (save succeeded)
    await modal.waitFor({ state: "hidden", timeout: 30_000 });
  });

  // ── Verify via RPC ────────────────────────────────────────

  test("config has 2 provider profiles after adding second", async () => {
    test.setTimeout(15_000);
    // Allow time for config to propagate
    await page.waitForTimeout(2_000);

    const snap = await getConfig(page);
    const cfg = getObj(snap.config);
    const auth = getObj(cfg.auth);
    const profiles = getObj(auth.profiles);

    expect(Object.keys(profiles).length).toBeGreaterThanOrEqual(2);
  });

  test("auth.order includes both providers", async () => {
    test.setTimeout(15_000);
    const snap = await getConfig(page);
    const cfg = getObj(snap.config);
    const auth = getObj(cfg.auth);
    const order = auth.order;

    expect(order).toBeTruthy();
    const orderKeys = Object.keys(getObj(order));
    expect(orderKeys).toContain(creds!.provider);
    expect(orderKeys).toContain(secondCreds!.provider);
  });

  // ── Verify models list expanded ───────────────────────────

  test("models.list includes models from both providers", async () => {
    test.setTimeout(30_000);
    const result = await gatewayRpc<{
      models: Array<{ id: string; name?: string; provider?: string }>;
    }>(page, "models.list", {});

    expect(result.models.length).toBeGreaterThanOrEqual(initialModelCount);

    const firstProviderModels = result.models.filter((m) => m.provider === creds!.provider);
    expect(firstProviderModels.length).toBeGreaterThan(0);

    const secondProviderModels = result.models.filter((m) => m.provider === secondCreds!.provider);
    expect(secondProviderModels.length).toBeGreaterThan(0);
  });

  // ── Verify models from both providers in UI ───────────────

  test("AI Models tab shows models from both providers", async () => {
    test.setTimeout(30_000);
    const tabNav = page.locator('[aria-label="Settings sections"]');
    await tabNav.getByText("AI Models").click();

    const modelList = page.locator('[aria-label="Model list"]');
    await modelList.waitFor({ state: "visible", timeout: 15_000 });

    // Verify group titles exist for both providers
    const groupTitles = modelList.locator(".UiModelGroupTitle");
    const count = await groupTitles.count();
    expect(count).toBeGreaterThanOrEqual(2);
  });

  // ── Switch model to second provider ───────────────────────

  test("switch to a model from the second provider", async () => {
    test.setTimeout(30_000);
    const modelList = page.locator('[aria-label="Model list"]');

    // Find first radio whose value starts with the second provider ID
    const secondProviderRadio = modelList.locator(
      `input[name="model"][value^="${secondCreds!.provider}/"]`
    );
    const radioCount = await secondProviderRadio.count();
    expect(radioCount).toBeGreaterThan(0);

    // Click the first matching radio
    await secondProviderRadio.first().check({ force: true });
    await page.waitForTimeout(2_000);
  });

  test("config reflects switched model (second provider)", async () => {
    test.setTimeout(30_000);
    // Model switch may trigger config save + gateway reload
    await page.waitForTimeout(3_000);

    const snap = await getConfig(page);
    const cfg = getObj(snap.config);
    const agents = getObj(cfg.agents);
    const defaults = getObj(agents.defaults);
    const model = getObj(defaults.model);

    const newPrimary = model.primary as string;
    expect(newPrimary).toBeTruthy();
    expect(newPrimary.startsWith(`${secondCreds!.provider}/`)).toBe(true);
  });

  // ── Verify chat works with new model ──────────────────────

  test("chat works with the new model", async () => {
    test.setTimeout(180_000);
    // Navigate to chat
    await page.locator('[aria-label="New session"]').click();
    await page.waitForTimeout(1_000);

    await sendChatMessage(page, "Say OK if you can hear me.");
    const response = await waitForAssistantResponse(page, 120_000);
    expect(response.length).toBeGreaterThan(0);
  });

  // ── Restore original model via RPC ────────────────────────

  test("restore original model via config.patch", async () => {
    test.setTimeout(60_000);

    // After chat streaming, gateway WS may need a moment to accept new
    // connections. Retry with increasing delays.
    async function rpcWithRetry<T>(fn: () => Promise<T>, retries = 3): Promise<T> {
      for (let i = 0; i < retries; i++) {
        try {
          return await fn();
        } catch {
          if (i === retries - 1) throw new Error("RPC failed after retries");
          await page.reload();
          await page.waitForTimeout(3_000 * (i + 1));
        }
      }
      throw new Error("unreachable");
    }

    const snap = await rpcWithRetry(() => getConfig(page));
    await rpcWithRetry(() =>
      gatewayRpc(page, "config.patch", {
        baseHash: snap.hash,
        raw: JSON.stringify({
          agents: { defaults: { model: { primary: originalModelPrimary } } },
        }),
      })
    );
    await page.waitForTimeout(2_000);

    const after = await rpcWithRetry(() => getConfig(page));
    const cfg = getObj(after.config);
    const agents = getObj(cfg.agents);
    const defaults = getObj(agents.defaults);
    const model = getObj(defaults.model);
    expect(model.primary).toBe(originalModelPrimary);
  });
});
