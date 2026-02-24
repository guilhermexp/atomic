import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  rmrf,
  ensureDir,
  copyExecutable,
  binName,
  targetPlatform,
  targetArch,
  isCrossCompiling,
} from "./lib/script-platform.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(here, "..");
const outRoot = path.join(appRoot, "vendor", "obsidian-cli");
const runtimeRoot = path.join(appRoot, ".obsidian-cli-runtime");

const SUPPORTED_PLATFORMS = ["darwin", "win32"];

async function main() {
  const platform = targetPlatform();
  const arch = targetArch();

  if (!SUPPORTED_PLATFORMS.includes(platform)) {
    throw new Error(
      `prepare-obsidian-cli-runtime: unsupported platform "${platform}" (supported: ${SUPPORTED_PLATFORMS.join(", ")})`
    );
  }
  const cliBin = binName("obsidian-cli");
  const targetDir = path.join(outRoot, `${platform}-${arch}`);
  const targetBin = path.join(targetDir, cliBin);

  rmrf(targetDir);
  ensureDir(targetDir);

  const downloadedBin = path.join(runtimeRoot, `${platform}-${arch}`, cliBin);
  if (!fs.existsSync(downloadedBin)) {
    throw new Error(
      [
        "downloaded obsidian-cli binary not found.",
        `Expected: ${downloadedBin}`,
        "Run: cd apps/electron-desktop && npm run fetch:obsidian-cli",
      ].join("\n")
    );
  }

  console.log(`[electron-desktop] Bundling obsidian-cli from: ${downloadedBin}`);
  copyExecutable(downloadedBin, targetBin);

  if (!isCrossCompiling()) {
    const res = spawnSync(targetBin, ["--help"], { encoding: "utf-8" });
    if (res.status !== 0) {
      const stderr = String(res.stderr || "").trim();
      const stdout = String(res.stdout || "").trim();
      throw new Error(`bundled obsidian-cli failed to run: ${stderr || stdout || "unknown error"}`);
    }
  }

  console.log(`[electron-desktop] obsidian-cli runtime ready at: ${targetBin}`);
}

main().catch((err) => {
  console.error(String(err?.stack || err?.message || err));
  process.exitCode = 1;
});
