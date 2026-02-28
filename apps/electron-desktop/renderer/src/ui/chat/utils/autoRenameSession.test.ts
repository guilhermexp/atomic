import { describe, expect, it, vi } from "vitest";
import { autoRenameSessionFromFirstMessage, getFallbackSessionLabel } from "./autoRenameSession";

describe("getFallbackSessionLabel", () => {
  it("returns New Chat for empty message", () => {
    expect(getFallbackSessionLabel("   ")).toBe("New Chat");
  });

  it("keeps short messages", () => {
    expect(getFallbackSessionLabel("fix flaky tests")).toBe("fix flaky tests");
  });

  it("truncates long messages to 25 chars + ellipsis", () => {
    expect(getFallbackSessionLabel("this is a very long message that should be truncated")).toBe(
      "this is a very long messa..."
    );
  });
});

describe("autoRenameSessionFromFirstMessage", () => {
  it("retries sessions.patch until success", async () => {
    const request = vi
      .fn()
      .mockRejectedValueOnce(new Error("not-ready"))
      .mockRejectedValueOnce(new Error("not-ready"))
      .mockResolvedValueOnce({});

    await autoRenameSessionFromFirstMessage({
      sessionKey: "agent:main:main:test",
      userMessage: "my first user prompt",
      request,
      delaysMs: [0, 0, 0],
      sleepFn: async () => {},
    });

    expect(request).toHaveBeenCalledTimes(3);
    expect(request).toHaveBeenNthCalledWith(1, "sessions.patch", {
      key: "agent:main:main:test",
      label: "my first user prompt",
    });
  });

  it("skips patch when message is empty", async () => {
    const request = vi.fn();
    await autoRenameSessionFromFirstMessage({
      sessionKey: "agent:main:main:test",
      userMessage: "   ",
      request,
      delaysMs: [0],
    });
    expect(request).not.toHaveBeenCalled();
  });
});
