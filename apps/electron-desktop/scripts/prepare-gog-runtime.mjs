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
const outRoot = path.join(appRoot, "vendor", "gog");
const runtimeRoot = path.join(appRoot, ".gog-runtime");

const SUPPORTED_PLATFORMS = ["darwin", "win32"];

async function main() {
  const platform = targetPlatform();
  const arch = targetArch();

  if (!SUPPORTED_PLATFORMS.includes(platform)) {
    throw new Error(
      `prepare-gog-runtime: unsupported platform "${platform}" (supported: ${SUPPORTED_PLATFORMS.join(", ")})`
    );
  }
  const gogBin = binName("gog");
  const targetDir = path.join(outRoot, `${platform}-${arch}`);
  const targetBin = path.join(targetDir, gogBin);

  rmrf(targetDir);
  ensureDir(targetDir);

  const downloadedBin = path.join(runtimeRoot, `${platform}-${arch}`, gogBin);
  if (!fs.existsSync(downloadedBin)) {
    throw new Error(
      [
        "downloaded gog binary not found.",
        `Expected: ${downloadedBin}`,
        "Run: cd apps/electron-desktop && npm run fetch:gog",
      ].join("\n")
    );
  }

  console.log(`[electron-desktop] Bundling gog from: ${downloadedBin}`);
  copyExecutable(downloadedBin, targetBin);

  if (!isCrossCompiling()) {
    const res = spawnSync(targetBin, ["--version"], { encoding: "utf-8" });
    if (res.status !== 0) {
      const stderr = String(res.stderr || "").trim();
      const stdout = String(res.stdout || "").trim();
      throw new Error(`bundled gog failed to run: ${stderr || stdout || "unknown error"}`);
    }
  }

  console.log(`[electron-desktop] gog runtime ready at: ${targetBin}`);
}

main().catch((err) => {
  console.error(String(err?.stack || err?.message || err));
  process.exitCode = 1;
});
