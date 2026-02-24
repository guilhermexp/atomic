import fs from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import {
  ensureDir,
  extractZip,
  copyExecutable,
  findFileRecursive,
  binName,
  ghHeaders,
  targetPlatform,
  targetArch,
  isCrossCompiling,
} from "./lib/script-platform.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(here, "..");

// This directory is gitignored and used in dev + as input for prepare-gh-runtime.
const runtimeRoot = path.join(appRoot, ".gh-runtime");

const SUPPORTED_PLATFORMS = ["darwin", "win32"];

async function fetchJson(url) {
  if (typeof fetch !== "function") {
    throw new Error("global fetch() not available; please run this script with Node 18+");
  }
  const res = await fetch(url, {
    headers: ghHeaders("openclaw-electron-desktop/fetch-gh-runtime"),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status} fetching ${url}: ${text || res.statusText}`);
  }
  return await res.json();
}

async function downloadToFile(url, destPath) {
  if (typeof fetch !== "function") {
    throw new Error("global fetch() not available; please run this script with Node 18+");
  }

  // Treat an existing non-empty destination as a cache hit.
  if (fs.existsSync(destPath)) {
    try {
      const st = fs.statSync(destPath);
      if (
        st.isFile() &&
        st.size > 0 &&
        String(process.env.GH_FORCE_DOWNLOAD || "").trim() !== "1"
      ) {
        return;
      }
    } catch {
      // Ignore and continue with a download attempt.
    }
  }

  const res = await fetch(url, {
    headers: ghHeaders("openclaw-electron-desktop/fetch-gh-runtime"),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status} downloading ${url}: ${text || res.statusText}`);
  }
  ensureDir(path.dirname(destPath));
  const tmpPath = `${destPath}.tmp`;
  try {
    fs.rmSync(tmpPath, { force: true });
  } catch {
    // ignore
  }
  try {
    const body = res.body;
    if (!body) {
      throw new Error(`empty response body for ${url}`);
    }
    await pipeline(Readable.fromWeb(body), fs.createWriteStream(tmpPath));
    fs.renameSync(tmpPath, destPath);
  } finally {
    try {
      fs.rmSync(tmpPath, { force: true });
    } catch {
      // ignore
    }
  }
}

function expectedAssetName(params) {
  const { tagName, arch, platform } = params;
  const version = String(tagName).startsWith("v") ? String(tagName).slice(1) : String(tagName);
  const archToken = arch === "arm64" ? "arm64" : "amd64";

  if (platform === "darwin") {
    return `gh_${version}_macOS_${archToken}.zip`;
  }
  if (platform === "win32") {
    return `gh_${version}_windows_${archToken}.zip`;
  }
  throw new Error(`unsupported platform for gh: ${platform}`);
}

async function main() {
  const platform = targetPlatform();
  const arch = targetArch();

  if (!SUPPORTED_PLATFORMS.includes(platform)) {
    throw new Error(
      `fetch-gh-runtime: unsupported platform "${platform}" (supported: ${SUPPORTED_PLATFORMS.join(", ")})`
    );
  }

  const repo = (process.env.GH_REPO && String(process.env.GH_REPO).trim()) || "cli/cli";
  const tag = (process.env.GH_TAG && String(process.env.GH_TAG).trim()) || "latest";
  const apiUrl =
    tag === "latest"
      ? `https://api.github.com/repos/${repo}/releases/latest`
      : `https://api.github.com/repos/${repo}/releases/tags/${tag}`;

  const release = await fetchJson(apiUrl);
  const tagName = typeof release?.tag_name === "string" ? release.tag_name : "";
  if (!tagName) {
    throw new Error("failed to resolve gh release tag_name from GitHub API");
  }

  const expected = expectedAssetName({ tagName, arch, platform });
  const assets = Array.isArray(release?.assets) ? release.assets : [];
  const match = assets.find((a) => a && typeof a.name === "string" && a.name === expected);
  const downloadUrl =
    match && typeof match.browser_download_url === "string" ? match.browser_download_url : "";
  if (!downloadUrl) {
    const known = assets
      .map((a) => (a && typeof a.name === "string" ? a.name : ""))
      .filter(Boolean)
      .slice(0, 40)
      .join(", ");
    throw new Error(`gh asset not found. Expected ${expected}. Known assets: ${known || "<none>"}`);
  }

  const cacheDir = path.join(runtimeRoot, "_cache", `${tagName || tag}`, `${platform}-${arch}`);
  const archivePath = path.join(cacheDir, expected);
  const extractDir = path.join(cacheDir, "extract");

  console.log(`[electron-desktop] gh runtime dir: ${runtimeRoot}`);
  console.log(`[electron-desktop] gh cache dir: ${cacheDir}`);
  console.log(`[electron-desktop] Downloading gh: ${downloadUrl}`);
  await downloadToFile(downloadUrl, archivePath);

  console.log(`[electron-desktop] Extracting gh archive...`);
  extractZip(archivePath, extractDir);

  const ghBinName = binName("gh");
  const extractedBin = findFileRecursive(extractDir, (entryName, fullPath) => {
    if (entryName === ghBinName) {
      return fullPath.includes(`${path.sep}bin${path.sep}${ghBinName}`);
    }
    return false;
  });
  if (!extractedBin) {
    throw new Error(`failed to locate gh binary in extracted archive (dir: ${extractDir})`);
  }

  const targetDir = path.join(runtimeRoot, `${platform}-${arch}`);
  const targetBin = path.join(targetDir, ghBinName);
  ensureDir(targetDir);
  copyExecutable(extractedBin, targetBin);

  if (!isCrossCompiling()) {
    const res = spawnSync(targetBin, ["--version"], { encoding: "utf-8" });
    if (res.status !== 0) {
      const stderr = String(res.stderr || "").trim();
      const stdout = String(res.stdout || "").trim();
      throw new Error(`downloaded gh failed to run: ${stderr || stdout || "unknown error"}`);
    }
  }

  console.log(`[electron-desktop] gh downloaded to: ${targetBin}`);
}

main().catch((err) => {
  console.error(String(err?.stack || err?.message || err));
  process.exitCode = 1;
});
