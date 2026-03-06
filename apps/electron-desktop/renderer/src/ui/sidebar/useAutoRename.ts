/**
 * Background hook that generates descriptive session titles via a lightweight
 * LLM call and persists them as session labels through the gateway.
 *
 * Strategy:
 * 1. Read auth profiles from the main process to find a usable API key
 * 2. For sessions whose title looks like raw user input (short/generic), call
 *    a fast LLM model to produce a concise descriptive title
 * 3. Persist the generated title via `sessions.patch { label }` so it survives
 *    reloads and is returned by `sessions.list`
 */
import React from "react";

type SessionCandidate = {
  key: string;
  title: string;
  label?: string;
};

type ProviderConfig = {
  provider: "openrouter" | "openai";
  apiKey: string;
  baseUrl: string;
  model: string;
};

const TITLE_PROMPT =
  `You generate ultra-short session titles (max 6 words). ` +
  `Given the first message of a chat session, produce a concise descriptive title. ` +
  `Reply with ONLY the title, no quotes, no explanation.`;

// Sessions with titles <= this length are candidates for auto-rename.
const SHORT_TITLE_THRESHOLD = 20;

// Don't rename sessions whose title already looks descriptive.
const GENERIC_PATTERNS = [
  /^new chat$/i,
  /^eae$/i,
  /^oi$/i,
  /^hi$/i,
  /^hello$/i,
  /^hey$/i,
  /^ola$/i,
  /^olá$/i,
  /^teste?$/i,
  /^test$/i,
];

function needsRename(s: SessionCandidate): boolean {
  // Already has a user/auto-generated label — skip.
  if (s.label) return false;
  const t = s.title.trim();
  if (!t || t === "New Chat") return true;
  if (t.length <= SHORT_TITLE_THRESHOLD && GENERIC_PATTERNS.some((p) => p.test(t))) return true;
  // Very short titles that are just the raw first message.
  if (t.length <= 8) return true;
  return false;
}

async function resolveProvider(): Promise<ProviderConfig | null> {
  const api = (
    window as unknown as {
      openclawDesktop?: {
        authReadProfiles?: () => Promise<{
          profiles: Record<
            string,
            { type: string; provider: string; key?: string; [k: string]: unknown }
          >;
          order: Record<string, string[]>;
        }>;
      };
    }
  ).openclawDesktop;

  if (!api?.authReadProfiles) return null;

  try {
    const { profiles, order } = await api.authReadProfiles();

    // Prefer OpenRouter (cheaper, wider model access), then OpenAI.
    for (const providerName of ["openrouter", "openai"] as const) {
      const profileIds = order[providerName] ?? [];
      for (const id of profileIds) {
        const profile = profiles[id];
        if (profile?.type === "api_key" && profile.key && typeof profile.key === "string") {
          if (providerName === "openrouter") {
            return {
              provider: "openrouter",
              apiKey: profile.key,
              baseUrl: "https://openrouter.ai/api/v1",
              model: "meta-llama/llama-3.1-8b-instruct:free",
            };
          }
          if (providerName === "openai") {
            return {
              provider: "openai",
              apiKey: profile.key,
              baseUrl: "https://api.openai.com/v1",
              model: "gpt-4o-mini",
            };
          }
        }
      }
    }
  } catch (err) {
    console.warn("[autoRename] failed to resolve provider:", err);
  }
  return null;
}

async function generateTitle(
  provider: ProviderConfig,
  firstMessage: string
): Promise<string | null> {
  try {
    const res = await fetch(`${provider.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${provider.apiKey}`,
      },
      body: JSON.stringify({
        model: provider.model,
        max_tokens: 30,
        temperature: 0.3,
        messages: [
          { role: "system", content: TITLE_PROMPT },
          { role: "user", content: firstMessage.slice(0, 200) },
        ],
      }),
    });
    if (!res.ok) {
      console.warn("[autoRename] LLM call failed:", res.status);
      return null;
    }
    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const title = data.choices?.[0]?.message?.content?.trim();
    if (!title || title.length < 2) return null;
    // Cap at 48 chars.
    return title.length > 48 ? `${title.slice(0, 48)}…` : title;
  } catch (err) {
    console.warn("[autoRename] generateTitle error:", err);
    return null;
  }
}

// Track which sessions we've already attempted to rename (avoid retries).
const attemptedKeys = new Set<string>();

/**
 * Hook: given the current sessions list and gateway RPC, automatically renames
 * sessions that have poor/generic titles. Runs once per session load.
 */
type GatewayRpcLike = {
  request: <T = unknown>(method: string, params?: unknown) => Promise<T>;
};

export function useAutoRenameSessions(
  sessions: SessionCandidate[],
  gw: GatewayRpcLike,
  onTitleUpdated: (key: string, title: string) => void
): void {
  React.useEffect(() => {
    if (!sessions.length) return;

    const candidates = sessions.filter((s) => needsRename(s) && !attemptedKeys.has(s.key));
    if (!candidates.length) return;

    // Mark all as attempted immediately to avoid duplicate runs.
    for (const c of candidates) {
      attemptedKeys.add(c.key);
    }

    let cancelled = false;

    (async () => {
      const provider = await resolveProvider();
      if (!provider || cancelled) return;

      // Process up to 5 sessions per batch to avoid rate limits.
      const batch = candidates.slice(0, 5);
      for (const session of batch) {
        if (cancelled) break;
        const title = await generateTitle(provider, session.title || "New Chat");
        if (!title || cancelled) continue;

        try {
          await gw.request("sessions.patch", { key: session.key, label: title });
          if (!cancelled) {
            onTitleUpdated(session.key, title);
          }
        } catch (err) {
          console.warn("[autoRename] sessions.patch failed:", err);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [sessions, gw, onTitleUpdated]);
}
