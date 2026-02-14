/**
 * Tests for pure helper functions in register.ts.
 * These functions will be extracted into domain-specific modules during refactoring;
 * the tests serve as a safety net to catch regressions.
 */
import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

// The helpers are not exported by register.ts, so we import the file indirectly.
// For now we replicate the function signatures to test them in isolation.
// When the refactoring extracts them into separate modules, these tests will import directly.

// ── parseObsidianVaultsFromJson ────────────────────────────────────────────────

// Inline copy for testing (mirrors register.ts lines 31-63)
type ObsidianVaultEntry = { name: string; path: string; open: boolean };

function parseObsidianVaultsFromJson(payload: unknown): ObsidianVaultEntry[] {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return [];
  }
  const root = payload as Record<string, unknown>;
  const vaultsRaw = root.vaults;
  if (!vaultsRaw || typeof vaultsRaw !== "object" || Array.isArray(vaultsRaw)) {
    return [];
  }
  const vaults = vaultsRaw as Record<string, unknown>;
  const openVaultId = typeof root.openVaultId === "string" ? root.openVaultId : null;
  const out: ObsidianVaultEntry[] = [];
  for (const [id, v] of Object.entries(vaults)) {
    if (!v || typeof v !== "object" || Array.isArray(v)) {
      continue;
    }
    const obj = v as Record<string, unknown>;
    const vaultPath = typeof obj.path === "string" ? obj.path.trim() : "";
    if (!vaultPath) {
      continue;
    }
    const isOpen = obj.open === true || (openVaultId ? id === openVaultId : false);
    const name = path.basename(vaultPath);
    out.push({ name, path: vaultPath, open: isOpen });
  }
  out.sort((a, b) => {
    if (a.open !== b.open) {
      return a.open ? -1 : 1;
    }
    return a.name.localeCompare(b.name);
  });
  return out;
}

describe("parseObsidianVaultsFromJson", () => {
  it("parses valid payload with multiple vaults", () => {
    const payload = {
      vaults: {
        abc: { path: "/Users/me/vault-a", open: false },
        def: { path: "/Users/me/vault-b", open: true },
      },
    };
    const result = parseObsidianVaultsFromJson(payload);
    expect(result).toHaveLength(2);
    // open vault should come first
    expect(result[0]).toEqual({ name: "vault-b", path: "/Users/me/vault-b", open: true });
    expect(result[1]).toEqual({ name: "vault-a", path: "/Users/me/vault-a", open: false });
  });

  it("uses openVaultId to determine open status", () => {
    const payload = {
      openVaultId: "xyz",
      vaults: {
        xyz: { path: "/Users/me/notes" },
        abc: { path: "/Users/me/work" },
      },
    };
    const result = parseObsidianVaultsFromJson(payload);
    expect(result[0]).toMatchObject({ name: "notes", open: true });
    expect(result[1]).toMatchObject({ name: "work", open: false });
  });

  it("returns empty for null input", () => {
    expect(parseObsidianVaultsFromJson(null)).toEqual([]);
  });

  it("returns empty for non-object input", () => {
    expect(parseObsidianVaultsFromJson("string")).toEqual([]);
    expect(parseObsidianVaultsFromJson(42)).toEqual([]);
    expect(parseObsidianVaultsFromJson([])).toEqual([]);
  });

  it("returns empty when vaults key is missing", () => {
    expect(parseObsidianVaultsFromJson({})).toEqual([]);
  });

  it("skips entries with missing path", () => {
    const payload = {
      vaults: {
        a: { path: "/ok" },
        b: { nopath: true },
        c: { path: "" },
      },
    };
    const result = parseObsidianVaultsFromJson(payload);
    expect(result).toHaveLength(1);
    expect(result[0].path).toBe("/ok");
  });

  it("skips array entries inside vaults", () => {
    const payload = { vaults: { a: [1, 2, 3] } };
    expect(parseObsidianVaultsFromJson(payload)).toEqual([]);
  });
});

// ── parseSkillFrontmatter ──────────────────────────────────────────────────────

type CustomSkillMeta = { name: string; description: string; emoji: string; dirName: string };

function parseSkillFrontmatter(content: string): Omit<CustomSkillMeta, "dirName"> {
  const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
  if (!fmMatch) {
    return { name: "", description: "", emoji: "🧩" };
  }
  const block = fmMatch[1] ?? "";
  const nameMatch = block.match(/^name:\s*(.+)$/m);
  const name = nameMatch?.[1]?.trim() ?? "";
  const descMatch = block.match(/^description:\s*(.+)$/m);
  const description = descMatch?.[1]?.trim() ?? "";
  let emoji = "🦞";
  const emojiMatch = block.match(/"emoji"\s*:\s*"([^"]+)"/);
  if (emojiMatch?.[1]) {
    emoji = emojiMatch[1];
  }
  return { name, description, emoji };
}

describe("parseSkillFrontmatter", () => {
  it("extracts name, description, and emoji from valid frontmatter", () => {
    const content = `---
name: My Skill
description: Does something cool
metadata: {"emoji": "🚀"}
---
# Content here`;
    const result = parseSkillFrontmatter(content);
    expect(result).toEqual({ name: "My Skill", description: "Does something cool", emoji: "🚀" });
  });

  it("returns defaults when no frontmatter", () => {
    const content = "# Just a heading\nSome text";
    const result = parseSkillFrontmatter(content);
    expect(result).toEqual({ name: "", description: "", emoji: "🧩" });
  });

  it("returns defaults for empty string", () => {
    expect(parseSkillFrontmatter("")).toEqual({ name: "", description: "", emoji: "🧩" });
  });

  it("handles partial frontmatter (name only)", () => {
    const content = `---
name: Partial
---
body`;
    const result = parseSkillFrontmatter(content);
    expect(result.name).toBe("Partial");
    expect(result.description).toBe("");
    // Default emoji when no metadata block
    expect(result.emoji).toBe("🦞");
  });

  it("handles frontmatter with no name/description", () => {
    const content = `---
version: 1.0
---`;
    const result = parseSkillFrontmatter(content);
    expect(result.name).toBe("");
    expect(result.description).toBe("");
  });
});

// ── resolveSkillRoot ───────────────────────────────────────────────────────────

// Inline copy (mirrors register.ts lines 137-165)
async function resolveSkillRoot(extractDir: string): Promise<string> {
  const entries = await fsp.readdir(extractDir, { withFileTypes: true });
  const dirs = entries.filter((e) => e.isDirectory());
  if (dirs.length === 1 && dirs[0]) {
    const candidate = path.join(extractDir, dirs[0].name);
    try {
      await fsp.stat(path.join(candidate, "SKILL.md"));
      return candidate;
    } catch {
      // fall through
    }
  }
  try {
    await fsp.stat(path.join(extractDir, "SKILL.md"));
    return extractDir;
  } catch {
    // not found
  }
  if (dirs.length === 1 && dirs[0]) {
    return path.join(extractDir, dirs[0].name);
  }
  return extractDir;
}

describe("resolveSkillRoot", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), "skill-root-test-"));
  });

  afterEach(async () => {
    await fsp.rm(tmpDir, { recursive: true, force: true });
  });

  it("returns extractDir when SKILL.md is at root", async () => {
    await fsp.writeFile(path.join(tmpDir, "SKILL.md"), "# Skill");
    const result = await resolveSkillRoot(tmpDir);
    expect(result).toBe(tmpDir);
  });

  it("returns subdirectory when SKILL.md is in single subdir", async () => {
    const sub = path.join(tmpDir, "my-skill");
    await fsp.mkdir(sub);
    await fsp.writeFile(path.join(sub, "SKILL.md"), "# Skill");
    const result = await resolveSkillRoot(tmpDir);
    expect(result).toBe(sub);
  });

  it("returns extractDir when no SKILL.md anywhere", async () => {
    await fsp.writeFile(path.join(tmpDir, "readme.txt"), "hello");
    const result = await resolveSkillRoot(tmpDir);
    expect(result).toBe(tmpDir);
  });

  it("returns single subdir even without SKILL.md as last resort", async () => {
    const sub = path.join(tmpDir, "only-dir");
    await fsp.mkdir(sub);
    await fsp.writeFile(path.join(sub, "readme.md"), "no skill");
    const result = await resolveSkillRoot(tmpDir);
    expect(result).toBe(sub);
  });
});

// ── listCustomSkillsFromDir ────────────────────────────────────────────────────

// Inline copy (mirrors register.ts lines 170-196)
async function listCustomSkillsFromDir(
  skillsDir: string
): Promise<CustomSkillMeta[]> {
  try {
    await fsp.stat(skillsDir);
  } catch {
    return [];
  }
  const entries = await fsp.readdir(skillsDir, { withFileTypes: true });
  const skills: CustomSkillMeta[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }
    const skillMdPath = path.join(skillsDir, entry.name, "SKILL.md");
    try {
      const content = await fsp.readFile(skillMdPath, "utf-8");
      const meta = parseSkillFrontmatter(content);
      skills.push({
        name: meta.name || entry.name,
        description: meta.description,
        emoji: meta.emoji,
        dirName: entry.name,
      });
    } catch {
      // skip
    }
  }
  return skills;
}

describe("listCustomSkillsFromDir", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), "skills-list-test-"));
  });

  afterEach(async () => {
    await fsp.rm(tmpDir, { recursive: true, force: true });
  });

  it("returns skills from directories with SKILL.md", async () => {
    const skillDir = path.join(tmpDir, "cool-skill");
    await fsp.mkdir(skillDir);
    await fsp.writeFile(
      path.join(skillDir, "SKILL.md"),
      `---\nname: Cool Skill\ndescription: It is cool\n---\n`
    );
    const result = await listCustomSkillsFromDir(tmpDir);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      name: "Cool Skill",
      description: "It is cool",
      dirName: "cool-skill",
    });
  });

  it("returns empty for missing directory", async () => {
    const result = await listCustomSkillsFromDir("/nonexistent/path/xyz");
    expect(result).toEqual([]);
  });

  it("returns empty for empty directory", async () => {
    const result = await listCustomSkillsFromDir(tmpDir);
    expect(result).toEqual([]);
  });

  it("skips subdirs without SKILL.md", async () => {
    await fsp.mkdir(path.join(tmpDir, "no-skill"));
    await fsp.writeFile(path.join(tmpDir, "no-skill", "README.md"), "hi");
    const result = await listCustomSkillsFromDir(tmpDir);
    expect(result).toEqual([]);
  });

  it("uses directory name when skill has no name in frontmatter", async () => {
    const skillDir = path.join(tmpDir, "unnamed");
    await fsp.mkdir(skillDir);
    await fsp.writeFile(path.join(skillDir, "SKILL.md"), "---\nversion: 1\n---\n");
    const result = await listCustomSkillsFromDir(tmpDir);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("unnamed");
  });
});

// ── extractZipBuffer ───────────────────────────────────────────────────────────

// We import JSZip to create test fixtures.
import JSZip from "jszip";

async function extractZipBuffer(buffer: Buffer, destDir: string): Promise<void> {
  const zip = await JSZip.loadAsync(buffer);
  const entries = Object.values(zip.files);
  for (const entry of entries) {
    const entryPath = entry.name.replaceAll("\\", "/");
    if (!entryPath || entryPath.endsWith("/")) {
      const dirPath = path.resolve(destDir, entryPath);
      if (!dirPath.startsWith(destDir)) {
        throw new Error(`zip entry escapes destination: ${entry.name}`);
      }
      await fsp.mkdir(dirPath, { recursive: true });
      continue;
    }
    const outPath = path.resolve(destDir, entryPath);
    if (!outPath.startsWith(destDir)) {
      throw new Error(`zip entry escapes destination: ${entry.name}`);
    }
    await fsp.mkdir(path.dirname(outPath), { recursive: true });
    const data = await entry.async("nodebuffer");
    await fsp.writeFile(outPath, data);
  }
}

describe("extractZipBuffer", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), "zip-extract-test-"));
  });

  afterEach(async () => {
    await fsp.rm(tmpDir, { recursive: true, force: true });
  });

  it("extracts files from a valid zip", async () => {
    const zip = new JSZip();
    zip.file("hello.txt", "world");
    zip.file("sub/nested.txt", "deep");
    const buf = await zip.generateAsync({ type: "nodebuffer" });

    await extractZipBuffer(buf, tmpDir);

    const hello = await fsp.readFile(path.join(tmpDir, "hello.txt"), "utf-8");
    expect(hello).toBe("world");
    const nested = await fsp.readFile(path.join(tmpDir, "sub", "nested.txt"), "utf-8");
    expect(nested).toBe("deep");
  });

  it("handles empty zip gracefully", async () => {
    const zip = new JSZip();
    const buf = await zip.generateAsync({ type: "nodebuffer" });
    await extractZipBuffer(buf, tmpDir);
    const entries = await fsp.readdir(tmpDir);
    expect(entries).toEqual([]);
  });

  it("rejects path traversal entries", async () => {
    const zip = new JSZip();
    zip.file("../escape.txt", "evil");
    const buf = await zip.generateAsync({ type: "nodebuffer" });
    await expect(extractZipBuffer(buf, tmpDir)).rejects.toThrow("escapes destination");
  });
});
