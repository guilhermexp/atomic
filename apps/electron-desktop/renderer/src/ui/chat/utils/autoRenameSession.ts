import type { GatewayRequest } from "@store/slices/chatSlice";

const NEW_CHAT_LABEL = "New Chat";
const MAX_FALLBACK_LABEL_LENGTH = 25;
const RETRY_DELAYS_MS = [0, 3_000, 5_000, 5_000];

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export function getFallbackSessionLabel(userMessage: string): string {
  const trimmed = userMessage.trim();
  if (trimmed.length <= MAX_FALLBACK_LABEL_LENGTH) {
    return trimmed || NEW_CHAT_LABEL;
  }
  return `${trimmed.slice(0, MAX_FALLBACK_LABEL_LENGTH)}...`;
}

type AutoRenameSessionParams = {
  sessionKey: string;
  userMessage: string;
  request: GatewayRequest;
  delaysMs?: number[];
  sleepFn?: (ms: number) => Promise<void>;
};

/**
 * Auto-rename session label from the first user message.
 * Fire-and-forget to avoid blocking chat send/navigation.
 */
export async function autoRenameSessionFromFirstMessage(params: AutoRenameSessionParams) {
  const label = getFallbackSessionLabel(params.userMessage);
  if (!label || label === NEW_CHAT_LABEL) {
    return;
  }

  const delays = params.delaysMs?.length ? params.delaysMs : RETRY_DELAYS_MS;
  const wait = params.sleepFn ?? sleep;

  for (let attempt = 0; attempt < delays.length; attempt += 1) {
    if (attempt > 0) {
      await wait(delays[attempt] ?? 0);
    }
    try {
      await params.request("sessions.patch", {
        key: params.sessionKey,
        label,
      });
      return;
    } catch {
      // Session entry may not be ready yet (or label conflict); retry a few times.
    }
  }
}
