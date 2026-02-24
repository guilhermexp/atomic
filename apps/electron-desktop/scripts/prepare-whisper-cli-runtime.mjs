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
const outRoot = path.join(appRoot, "vendor", "whisper-cli");
const runtimeRoot = path.join(appRoot, ".whisper-cli-runtime");

const SUPPORTED_PLATFORMS = ["darwin", "win32"];

async function main() {
  const platform = targetPlatform();
  const arch = targetArch();

  if (!SUPPORTED_PLATFORMS.includes(platform)) {
    throw new Error(
      `prepare-whisper-cli-runtime: unsupported platform "${platform}" (supported: ${SUPPORTED_PLATFORMS.join(", ")})`
    );
  }
  const whisperBin = binName("whisper-cli");
  const targetDir = path.join(outRoot, `${platform}-${arch}`);
  const targetBin = path.join(targetDir, whisperBin);

  rmrf(targetDir);
  ensureDir(targetDir);

  const downloadedBin = path.join(runtimeRoot, `${platform}-${arch}`, whisperBin);
  if (!fs.existsSync(downloadedBin)) {
    throw new Error(
      [
        "downloaded whisper-cli binary not found.",
        `Expected: ${downloadedBin}`,
        "Run: cd apps/electron-desktop && npm run fetch:whisper-cli",
      ].join("\n")
    );
  }

  console.log(`[electron-desktop] Bundling whisper-cli from: ${downloadedBin}`);
  copyExecutable(downloadedBin, targetBin);

  // On Windows, copy companion DLLs alongside the executable.
  const srcDir = path.join(runtimeRoot, `${platform}-${arch}`);
  for (const entry of fs.readdirSync(srcDir)) {
    if (entry.toLowerCase().endsWith(".dll")) {
      fs.copyFileSync(path.join(srcDir, entry), path.join(targetDir, entry));
    }
  }

  if (!isCrossCompiling()) {
    const res = spawnSync(targetBin, ["--help"], { encoding: "utf-8", timeout: 10_000 });
    if (res.status !== 0 && res.status !== null) {
      const stderr = String(res.stderr || "").trim();
      const stdout = String(res.stdout || "").trim();
      throw new Error(`bundled whisper-cli failed to run: ${stderr || stdout || "unknown error"}`);
    }
  }

  console.log(`[electron-desktop] whisper-cli runtime ready at: ${targetBin}`);
}

main().catch((err) => {
  console.error(String(err?.stack || err?.message || err));
  process.exitCode = 1;
});
