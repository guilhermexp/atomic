import { vi } from "vitest";

// Global mocks for Electron-specific modules that are unavailable in a Node test environment.
vi.mock("electron", () => import("./mocks/electron"));
vi.mock("node-pty", () => import("./mocks/node-pty"));

// Electron's process.resourcesPath is only defined in packaged apps.
// Set a mock value so path resolution code doesn't crash.
if (!(process as Record<string, unknown>).resourcesPath) {
  Object.defineProperty(process, "resourcesPath", {
    value: "/mock/resources",
    writable: true,
    configurable: true,
  });
}

// Node.js 22+ ships a native `localStorage` global that requires
// `--localstorage-file` to work correctly.  Without a valid path the
// object is partially broken (e.g. `.clear()` is `undefined`).
// Override it with a spec-compliant in-memory shim so tests that rely on
// the Web Storage API (both in node and jsdom environments) work reliably.
{
  const store = new Map<string, string>();
  const storage: Storage = {
    get length() {
      return store.size;
    },
    clear() {
      store.clear();
    },
    getItem(key: string) {
      return store.get(key) ?? null;
    },
    key(index: number) {
      return [...store.keys()][index] ?? null;
    },
    removeItem(key: string) {
      store.delete(key);
    },
    setItem(key: string, value: string) {
      store.set(key, String(value));
    },
  };
  Object.defineProperty(globalThis, "localStorage", {
    value: storage,
    writable: true,
    configurable: true,
  });
}
