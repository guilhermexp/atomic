import fs from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(here, "..");
const runtimeRoot = path.join(appRoot, ".whisper-cli-runtime");

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

function rmrf(p) {
  try {
    fs.rmSync(p, { recursive: true, force: true });
  } catch {
    // ignore
  }
}

function listDirSafe(p) {
  try {
    return fs.readdirSync(p);
  } catch {
    return [];
  }
}

function findFileRecursive(rootDir, filename) {
  const queue = [rootDir];
  while (queue.length > 0) {
    const dir = queue.shift();
    if (!dir) {
      continue;
    }
    for (const entry of listDirSafe(dir)) {
      const full = path.join(dir, entry);
      let st;
      try {
        st = fs.statSync(full);
      } catch {
        continue;
      }
      if (st.isDirectory()) {
        queue.push(full);
        continue;
      }
      if (st.isFile() && entry === filename) {
        return full;
      }
    }
  }
  return null;
}

function ghHeaders(userAgent) {
  const headers = {
    Accept: "application/vnd.github+json",
    "User-Agent": userAgent,
  };
  const token = (process.env.GITHUB_TOKEN || process.env.GH_TOKEN || "").trim();
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  return headers;
}

async function fetchJson(url) {
  if (typeof fetch !== "function") {
    throw new Error("global fetch() not available; please run this script with Node 18+");
  }
  const res = await fetch(url, {
    headers: ghHeaders("openclaw-electron-desktop/fetch-whisper-cli-runtime"),
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

  if (fs.existsSync(destPath)) {
    try {
      const st = fs.statSync(destPath);
      if (
        st.isFile() &&
        st.size > 0 &&
        String(process.env.WHISPER_CLI_FORCE_DOWNLOAD || "").trim() !== "1"
      ) {
        return;
      }
    } catch {
      // continue with download
    }
  }

  const res = await fetch(url, {
    headers: ghHeaders("openclaw-electron-desktop/fetch-whisper-cli-runtime"),
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

function extractZip(archivePath, extractDir) {
  rmrf(extractDir);
  ensureDir(extractDir);
  const res = spawnSync("unzip", ["-q", archivePath, "-d", extractDir], { encoding: "utf-8" });
  if (res.status !== 0) {
    const stderr = String(res.stderr || "").trim();
    throw new Error(`failed to extract whisper-cli archive: ${stderr || "unknown error"}`);
  }
}

function copyExecutable(src, dest) {
  ensureDir(path.dirname(dest));
  fs.copyFileSync(src, dest);
  fs.chmodSync(dest, 0o755);
}

function resolveAssetArch(arch) {
  if (arch === "arm64") return "arm64";
  if (arch === "x64") return "x86_64";
  throw new Error(`unsupported arch for whisper-cli: ${arch}`);
}

async function main() {
  if (process.platform !== "darwin") {
    throw new Error("fetch-whisper-cli-runtime is macOS-only (darwin)");
  }

  const platform = process.platform;
  const arch = process.arch;
  const assetArch = resolveAssetArch(arch);

  const repo =
    (process.env.WHISPER_CLI_REPO && String(process.env.WHISPER_CLI_REPO).trim()) ||
    "AtomicBot-ai/whisper.cpp";
  const tag =
    (process.env.WHISPER_CLI_TAG && String(process.env.WHISPER_CLI_TAG).trim()) || "v1.0.1";
  const apiUrl =
    tag === "latest"
      ? `https://api.github.com/repos/${repo}/releases/latest`
      : `https://api.github.com/repos/${repo}/releases/tags/${tag}`;

  const release = await fetchJson(apiUrl);
  const tagName = typeof release?.tag_name === "string" ? release.tag_name : "";
  const version = tagName && tagName.startsWith("v") ? tagName.slice(1) : tagName;
  if (!version) {
    throw new Error(
      `failed to resolve whisper-cli version from GitHub release tag: ${tagName || "<missing>"}`
    );
  }

  // Asset name pattern: whisper-v{version}-macos-{arch}.zip
  const assetName = `whisper-${tagName}-macos-${assetArch}.zip`;
  const assets = Array.isArray(release?.assets) ? release.assets : [];
  const match = assets.find((a) => a && typeof a.name === "string" && a.name === assetName);
  const downloadUrl =
    match && typeof match.browser_download_url === "string" ? match.browser_download_url : "";
  if (!downloadUrl) {
    const known = assets
      .map((a) => (a && typeof a.name === "string" ? a.name : ""))
      .filter(Boolean)
      .slice(0, 40)
      .join(", ");
    throw new Error(
      `whisper-cli asset not found for ${platform}/${arch}. Expected ${assetName}. Known assets (first 40): ${known || "<none>"}`
    );
  }

  const cacheDir = path.join(runtimeRoot, "_cache", `${tagName || tag}`, `darwin-${assetArch}`);
  const archivePath = path.join(cacheDir, assetName);
  const extractDir = path.join(cacheDir, "extract");

  console.log(`[electron-desktop] whisper-cli runtime dir: ${runtimeRoot}`);
  console.log(`[electron-desktop] whisper-cli cache dir: ${cacheDir}`);

  console.log(`[electron-desktop] Downloading whisper-cli: ${downloadUrl}`);
  await downloadToFile(downloadUrl, archivePath);

  extractZip(archivePath, extractDir);

  const binName = "whisper-cli";
  const extracted = findFileRecursive(extractDir, binName);
  if (!extracted) {
    throw new Error(`failed to locate ${binName} in extracted archive (dir: ${extractDir})`);
  }

  const targetDir = path.join(runtimeRoot, `${platform}-${arch}`);
  const targetBin = path.join(targetDir, "whisper-cli");
  copyExecutable(extracted, targetBin);

  // Sanity check.
  const res = spawnSync(targetBin, ["--help"], { encoding: "utf-8", timeout: 10_000 });
  if (res.status !== 0 && res.status !== null) {
    const stderr = String(res.stderr || "").trim();
    const stdout = String(res.stdout || "").trim();
    throw new Error(`downloaded whisper-cli failed to run: ${stderr || stdout || "unknown error"}`);
  }

  console.log(`[electron-desktop] whisper-cli downloaded to: ${targetBin}`);
}

main().catch((err) => {
  console.error(String(err?.stack || err?.message || err));
  process.exitCode = 1;
});
