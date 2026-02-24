import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import https from "node:https";
import { fileURLToPath } from "node:url";

function _targetPlatform() {
  const env = (process.env.TARGET_PLATFORM || "").trim();
  return env || process.platform;
}

function _targetArch() {
  const env = (process.env.TARGET_ARCH || "").trim();
  return env || process.arch;
}

function _isCrossCompiling() {
  return _targetPlatform() !== process.platform || _targetArch() !== process.arch;
}

const DEFAULT_NODE_VERSION = "22.22.0";

const here = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(here, "..");
const outRoot = path.join(appRoot, "vendor", "node");

function rmrf(p) {
  try {
    fs.rmSync(p, { recursive: true, force: true });
  } catch {
    // ignore
  }
}

// fs.renameSync fails with EXDEV when src and dest are on different drives
// (common on Windows CI where temp is on C:\ and workspace on D:\).
function moveDir(src, dest) {
  try {
    fs.renameSync(src, dest);
  } catch (err) {
    if (err.code === "EXDEV") {
      rmrf(dest);
      fs.cpSync(src, dest, { recursive: true });
      rmrf(src);
    } else {
      throw err;
    }
  }
}

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

function run(cmd, args, opts = {}) {
  const result = spawnSync(cmd, args, { stdio: "inherit", ...opts });
  if (result.status !== 0) {
    throw new Error(`${cmd} ${args.join(" ")} failed with exit code ${result.status ?? "?"}`);
  }
}

function download(url, destPath) {
  return new Promise((resolve, reject) => {
    ensureDir(path.dirname(destPath));
    const file = fs.createWriteStream(destPath);
    const req = https.get(url, (res) => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        file.close();
        fs.rmSync(destPath, { force: true });
        resolve(download(res.headers.location, destPath));
        return;
      }
      if (res.statusCode !== 200) {
        reject(new Error(`Download failed: ${url} (status ${res.statusCode})`));
        return;
      }
      res.pipe(file);
      file.on("finish", () => file.close(resolve));
    });
    req.on("error", (err) => reject(err));
  });
}

function nodeAssetFor(platform, arch, version) {
  const base = `https://nodejs.org/dist/v${version}`;
  if (platform === "darwin") {
    const a = arch === "arm64" ? "arm64" : "x64";
    return {
      url: `${base}/node-v${version}-darwin-${a}.tar.xz`,
      kind: "tar",
    };
  }
  if (platform === "linux") {
    const a = arch === "arm64" ? "arm64" : "x64";
    return {
      url: `${base}/node-v${version}-linux-${a}.tar.xz`,
      kind: "tar",
    };
  }
  if (platform === "win32") {
    const a = arch === "arm64" ? "arm64" : "x64";
    return {
      url: `${base}/node-v${version}-win-${a}.zip`,
      kind: "zip",
    };
  }
  throw new Error(`Unsupported platform: ${platform}`);
}

async function main() {
  const version = process.env.NODE_VERSION || DEFAULT_NODE_VERSION;
  const platform = _targetPlatform();
  const arch = _targetArch();

  const targetDir = path.join(outRoot, `${platform}-${arch}`);
  rmrf(targetDir);
  ensureDir(targetDir);

  const asset = nodeAssetFor(platform, arch, version);
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "openclaw-node-"));
  const archivePath = path.join(tmpDir, path.basename(asset.url));

  console.log(`[electron-desktop] Downloading Node v${version} from: ${asset.url}`);
  await download(asset.url, archivePath);

  console.log(`[electron-desktop] Extracting Node runtime…`);
  if (asset.kind === "tar") {
    // Extract into tmpDir/node, then move the extracted folder to targetDir.
    const extractDir = path.join(tmpDir, "extract");
    ensureDir(extractDir);
    run("tar", ["-xJf", archivePath, "-C", extractDir]);
    const entries = fs.readdirSync(extractDir);
    const root = entries.find((e) => e.startsWith("node-v"));
    if (!root) {
      throw new Error("Failed to find extracted Node directory");
    }
    moveDir(path.join(extractDir, root), targetDir);
  } else {
    // zip (Windows) — nodejs.org zips contain a top-level directory like
    // node-v22.12.0-win-x64/, so extract to a temp dir first, then move.
    const extractDir = path.join(tmpDir, "extract-zip");
    ensureDir(extractDir);
    if (process.platform === "win32") {
      run("powershell", [
        "-NoProfile",
        "-Command",
        `Expand-Archive -LiteralPath '${archivePath}' -DestinationPath '${extractDir}' -Force`,
      ]);
    } else {
      run("unzip", ["-q", archivePath, "-d", extractDir]);
    }
    const entries = fs.readdirSync(extractDir);
    const root = entries.find((e) => e.startsWith("node-v"));
    if (root) {
      rmrf(targetDir);
      moveDir(path.join(extractDir, root), targetDir);
    }
  }

  const nodeBin =
    platform === "win32" ? path.join(targetDir, "node.exe") : path.join(targetDir, "bin", "node");
  if (!fs.existsSync(nodeBin)) {
    throw new Error(`Node binary not found after extraction: ${nodeBin}`);
  }

  console.log(`[electron-desktop] Node runtime ready at: ${targetDir}`);
}

await main();
