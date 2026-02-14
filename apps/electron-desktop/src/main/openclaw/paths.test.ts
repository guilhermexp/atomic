/**
 * Tests for path resolution functions in paths.ts.
 * Validates that each resolve* function constructs correct paths
 * for the current platform/arch combination.
 */
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

import {
  resolveRepoRoot,
  resolveBundledOpenClawDir,
  resolveBundledNodeBin,
  resolveBundledGogBin,
  resolveBundledJqBin,
  resolveBundledMemoBin,
  resolveBundledRemindctlBin,
  resolveBundledObsidianCliBin,
  resolveBundledGhBin,
  resolveDownloadedGogBin,
  resolveDownloadedJqBin,
  resolveDownloadedMemoBin,
  resolveDownloadedRemindctlBin,
  resolveDownloadedObsidianCliBin,
  resolveDownloadedGhBin,
  resolveBundledGogCredentialsPath,
  resolveDownloadedGogCredentialsPath,
  resolveGogCredentialsPaths,
  resolveRendererIndex,
  resolvePreloadPath,
} from "./paths";

// process.resourcesPath is only available in packaged Electron.
// We mock it for testing.
const MOCK_RESOURCES = "/mock/resources";
Object.defineProperty(process, "resourcesPath", {
  value: MOCK_RESOURCES,
  writable: true,
  configurable: true,
});

const platform = process.platform;
const arch = process.arch;
const platArch = `${platform}-${arch}`;

describe("resolveRepoRoot", () => {
  it("returns three directories up from mainDir", () => {
    const result = resolveRepoRoot("/app/electron-desktop/dist");
    // dist -> electron-desktop -> app -> (root)
    expect(result).toBe(path.resolve("/app/electron-desktop/dist", "..", "..", ".."));
  });
});

describe("resolveBundled* functions", () => {
  it("resolveBundledOpenClawDir returns resourcesPath/openclaw", () => {
    expect(resolveBundledOpenClawDir()).toBe(path.join(MOCK_RESOURCES, "openclaw"));
  });

  it("resolveBundledNodeBin returns correct platform-specific path", () => {
    const result = resolveBundledNodeBin();
    if (platform === "win32") {
      expect(result).toBe(path.join(MOCK_RESOURCES, "node", platArch, "node.exe"));
    } else {
      expect(result).toBe(path.join(MOCK_RESOURCES, "node", platArch, "bin", "node"));
    }
  });

  it("resolveBundledGogBin returns correct path", () => {
    expect(resolveBundledGogBin()).toBe(path.join(MOCK_RESOURCES, "gog", platArch, "gog"));
  });

  it("resolveBundledJqBin returns correct path", () => {
    expect(resolveBundledJqBin()).toBe(path.join(MOCK_RESOURCES, "jq", platArch, "jq"));
  });

  it("resolveBundledMemoBin returns correct path", () => {
    expect(resolveBundledMemoBin()).toBe(path.join(MOCK_RESOURCES, "memo", platArch, "memo"));
  });

  it("resolveBundledRemindctlBin returns correct path", () => {
    expect(resolveBundledRemindctlBin()).toBe(
      path.join(MOCK_RESOURCES, "remindctl", platArch, "remindctl")
    );
  });

  it("resolveBundledObsidianCliBin returns correct path", () => {
    expect(resolveBundledObsidianCliBin()).toBe(
      path.join(MOCK_RESOURCES, "obsidian-cli", platArch, "obsidian-cli")
    );
  });

  it("resolveBundledGhBin returns correct path", () => {
    expect(resolveBundledGhBin()).toBe(path.join(MOCK_RESOURCES, "gh", platArch, "gh"));
  });

  it("resolveBundledGogCredentialsPath returns correct path", () => {
    expect(resolveBundledGogCredentialsPath()).toBe(
      path.join(MOCK_RESOURCES, "gog-credentials", "gog-client-secret.json")
    );
  });
});

describe("resolveDownloaded* functions", () => {
  const mainDir = "/app/electron-desktop/dist";
  const appDir = path.resolve(mainDir, "..");

  it("resolveDownloadedGogBin", () => {
    expect(resolveDownloadedGogBin(mainDir)).toBe(
      path.join(appDir, ".gog-runtime", platArch, "gog")
    );
  });

  it("resolveDownloadedJqBin", () => {
    expect(resolveDownloadedJqBin(mainDir)).toBe(
      path.join(appDir, ".jq-runtime", platArch, "jq")
    );
  });

  it("resolveDownloadedMemoBin", () => {
    expect(resolveDownloadedMemoBin(mainDir)).toBe(
      path.join(appDir, ".memo-runtime", platArch, "memo")
    );
  });

  it("resolveDownloadedRemindctlBin", () => {
    expect(resolveDownloadedRemindctlBin(mainDir)).toBe(
      path.join(appDir, ".remindctl-runtime", platArch, "remindctl")
    );
  });

  it("resolveDownloadedObsidianCliBin", () => {
    expect(resolveDownloadedObsidianCliBin(mainDir)).toBe(
      path.join(appDir, ".obsidian-cli-runtime", platArch, "obsidian-cli")
    );
  });

  it("resolveDownloadedGhBin", () => {
    expect(resolveDownloadedGhBin(mainDir)).toBe(
      path.join(appDir, ".gh-runtime", platArch, "gh")
    );
  });

  it("resolveDownloadedGogCredentialsPath", () => {
    expect(resolveDownloadedGogCredentialsPath(mainDir)).toBe(
      path.join(appDir, ".gog-runtime", "credentials", "gog-client-secret.json")
    );
  });
});

describe("resolveGogCredentialsPaths", () => {
  it("returns an array of paths", () => {
    const paths = resolveGogCredentialsPaths();
    expect(Array.isArray(paths)).toBe(true);
    expect(paths.length).toBeGreaterThanOrEqual(1);
    for (const p of paths) {
      expect(p).toContain("credentials.json");
    }
  });
});

describe("resolveRendererIndex", () => {
  it("returns packaged path when isPackaged is true", () => {
    const result = resolveRendererIndex({
      isPackaged: true,
      appPath: "/app",
      mainDir: "/app/dist",
    });
    expect(result).toBe(path.join("/app", "renderer", "dist", "index.html"));
  });

  it("returns dev path when isPackaged is false", () => {
    const result = resolveRendererIndex({
      isPackaged: false,
      appPath: "/app",
      mainDir: "/app/electron-desktop/dist",
    });
    const expected = path.join(
      path.resolve("/app/electron-desktop/dist", ".."),
      "renderer",
      "dist",
      "index.html"
    );
    expect(result).toBe(expected);
  });
});

describe("resolvePreloadPath", () => {
  it("returns mainDir/preload.js", () => {
    expect(resolvePreloadPath("/app/dist")).toBe(path.join("/app/dist", "preload.js"));
  });
});
