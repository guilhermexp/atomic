/**
 * Tests for network utilities.
 */
import { describe, expect, it } from "vitest";

import { createTailBuffer, pickPort } from "./net";

describe("createTailBuffer", () => {
  it("stores and returns pushed content", () => {
    const buf = createTailBuffer(100);
    buf.push("hello ");
    buf.push("world");
    expect(buf.read()).toBe("hello world");
  });

  it("trims to maxChars when buffer exceeds limit", () => {
    const buf = createTailBuffer(5);
    buf.push("abcdefgh");
    // Should keep last 5 chars
    expect(buf.read()).toBe("defgh");
  });

  it("handles zero maxChars", () => {
    const buf = createTailBuffer(0);
    buf.push("test");
    // With maxChars 0, every push slices from end, leaving empty
    expect(buf.read()).toBe("");
  });

  it("accumulates across multiple pushes", () => {
    const buf = createTailBuffer(10);
    buf.push("abc");
    buf.push("def");
    buf.push("ghi");
    // Total 9 chars, under limit
    expect(buf.read()).toBe("abcdefghi");
  });

  it("trims correctly across multiple pushes", () => {
    const buf = createTailBuffer(6);
    buf.push("aaa");
    buf.push("bbb");
    buf.push("ccc");
    // Total would be 9, trimmed to last 6
    expect(buf.read()).toBe("bbbccc");
  });
});

describe("pickPort", () => {
  it("returns preferred port when free", async () => {
    const preferred = 49152 + Math.floor(Math.random() * 10000);
    const port = await pickPort(preferred);
    expect(port).toBe(preferred);
  });

  it("always returns the preferred port even if occupied (waits then falls through)", async () => {
    // pickPort now always returns the preferred port — it waits for it to free up
    // and if it doesn't, returns it anyway so the gateway can fail loudly.
    const preferred = 49152 + Math.floor(Math.random() * 10000);
    const port = await pickPort(preferred, 200);
    expect(port).toBe(preferred);
  });
});
