import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(here, "..");
const outRoot = path.join(appRoot, "vendor", "whisper-cli");
const runtimeRoot = path.join(appRoot, ".whisper-cli-runtime");

function rmrf(p) {
  try {
    fs.rmSync(p, { recursive: true, force: true });
  } catch {
    // ignore
  }
}

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

function copyExecutable(src, dest) {
  ensureDir(path.dirname(dest));
  fs.copyFileSync(src, dest);
  fs.chmodSync(dest, 0o755);
}

async function main() {
  if (process.platform !== "darwin") {
    throw new Error("prepare-whisper-cli-runtime is macOS-only (darwin)");
  }

  const platform = process.platform;
  const arch = process.arch;
  const targetDir = path.join(outRoot, `${platform}-${arch}`);
  const targetBin = path.join(targetDir, "whisper-cli");

  rmrf(targetDir);
  ensureDir(targetDir);

  const downloadedBin = path.join(runtimeRoot, `${platform}-${arch}`, "whisper-cli");
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

  // Sanity check.
  const res = spawnSync(targetBin, ["--help"], { encoding: "utf-8", timeout: 10_000 });
  if (res.status !== 0 && res.status !== null) {
    const stderr = String(res.stderr || "").trim();
    const stdout = String(res.stdout || "").trim();
    throw new Error(`bundled whisper-cli failed to run: ${stderr || stdout || "unknown error"}`);
  }

  console.log(`[electron-desktop] whisper-cli runtime ready at: ${targetBin}`);
}

main().catch((err) => {
  console.error(String(err?.stack || err?.message || err));
  process.exitCode = 1;
});
