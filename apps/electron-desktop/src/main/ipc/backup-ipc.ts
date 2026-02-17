/**
 * IPC handlers for full config backup (create) and restore.
 *
 * - backup-create: zips the stateDir and lets the user pick a save location.
 * - backup-restore: receives a base64-encoded zip, validates it, swaps config,
 *   and restarts the gateway.
 */
import { app, dialog, ipcMain } from "electron";
import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { randomBytes } from "node:crypto";

import JSZip from "jszip";
import type { RegisterParams } from "./types";
import { readGatewayTokenFromConfig } from "../gateway/config";

/**
 * Recursively add every file/dir inside `dirPath` to a JSZip instance.
 * `baseDir` is stripped from the stored zip entry paths.
 */
async function addDirToZip(zip: JSZip, dirPath: string, baseDir: string): Promise<void> {
  const entries = await fsp.readdir(dirPath, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    const relativePath = path.relative(baseDir, fullPath);
    if (entry.isDirectory()) {
      zip.folder(relativePath);
      await addDirToZip(zip, fullPath, baseDir);
    } else if (entry.isFile()) {
      const data = await fsp.readFile(fullPath);
      zip.file(relativePath, data);
    }
  }
}

/**
 * After extraction, resolve the backup root: if the zip contains a single top-level
 * directory with `openclaw.json` inside, use that; otherwise use extractDir itself.
 */
async function resolveBackupRoot(extractDir: string): Promise<string> {
  // Check extractDir directly first
  try {
    await fsp.stat(path.join(extractDir, "openclaw.json"));
    return extractDir;
  } catch {
    // not at top level
  }

  // Check if there's a single subdirectory containing the config
  const entries = await fsp.readdir(extractDir, { withFileTypes: true });
  const dirs = entries.filter((e) => e.isDirectory());
  if (dirs.length === 1 && dirs[0]) {
    const candidate = path.join(extractDir, dirs[0].name);
    try {
      await fsp.stat(path.join(candidate, "openclaw.json"));
      return candidate;
    } catch {
      // not there either
    }
  }

  throw new Error("Invalid backup: openclaw.json not found in the archive");
}

/**
 * Extract a zip buffer into destDir using JSZip.
 * Validates that no entry escapes the destination directory.
 */
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

export function registerBackupHandlers(params: RegisterParams) {
  const { stateDir, stopGatewayChild, startGateway, getMainWindow, setGatewayToken } = params;

  // ── Create backup ──────────────────────────────────────────────────────
  ipcMain.handle("backup-create", async () => {
    try {
      // Build the zip from stateDir
      const zip = new JSZip();
      await addDirToZip(zip, stateDir, stateDir);
      const zipBuffer = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });

      const now = new Date();
      const datePart = [
        now.getFullYear(),
        String(now.getMonth() + 1).padStart(2, "0"),
        String(now.getDate()).padStart(2, "0"),
      ].join("-");

      const parentWindow = getMainWindow();
      const dialogOpts = {
        title: "Save OpenClaw Backup",
        defaultPath: path.join(app.getPath("documents"), `openclaw-backup-${datePart}.zip`),
        filters: [{ name: "ZIP Archives", extensions: ["zip"] }],
      };
      const result = parentWindow
        ? await dialog.showSaveDialog(parentWindow, dialogOpts)
        : await dialog.showSaveDialog(dialogOpts);

      if (result.canceled || !result.filePath) {
        return { ok: false, cancelled: true };
      }

      await fsp.writeFile(result.filePath, zipBuffer);
      return { ok: true };
    } catch (err) {
      console.error("[ipc/backup] backup-create failed:", err);
      return { ok: false, error: `Failed to create backup: ${String(err)}` };
    }
  });

  // ── Restore from backup ────────────────────────────────────────────────
  ipcMain.handle("backup-restore", async (_evt, p: { data?: unknown }) => {
    const b64 = typeof p?.data === "string" ? p.data : "";
    if (!b64) {
      return { ok: false, error: "No data provided" };
    }

    const tmpDir = path.join(os.tmpdir(), `openclaw-restore-${randomBytes(8).toString("hex")}`);
    const preRestoreDir = `${stateDir}.pre-restore`;

    try {
      // 1. Extract zip to temp dir and validate
      const buffer = Buffer.from(b64, "base64");
      await fsp.mkdir(tmpDir, { recursive: true });
      await extractZipBuffer(buffer, tmpDir);
      const backupRoot = await resolveBackupRoot(tmpDir);

      // 2. Stop the gateway
      await stopGatewayChild();

      // 3. Safety backup: rename current stateDir
      try {
        await fsp.rm(preRestoreDir, { recursive: true, force: true });
      } catch {
        // may not exist
      }
      await fsp.rename(stateDir, preRestoreDir);

      // 4. Create fresh stateDir and copy backup contents
      await fsp.mkdir(stateDir, { recursive: true });
      await fsp.cp(backupRoot, stateDir, { recursive: true });

      // 5. Read the token from the restored config and update in-memory state
      //    so gateway, main process, and renderer all use the backup's token.
      const configPath = path.join(stateDir, "openclaw.json");
      const restoredToken = readGatewayTokenFromConfig(configPath);
      if (restoredToken) {
        setGatewayToken(restoredToken);
      }

      // 6. Start the gateway — it reads the token from config + env var (now in sync)
      await startGateway();

      return { ok: true };
    } catch (err) {
      console.error("[ipc/backup] backup-restore failed:", err);

      // Attempt rollback: restore original stateDir and restart gateway
      try {
        if (fs.existsSync(stateDir)) {
          await fsp.rm(stateDir, { recursive: true, force: true });
        }
        if (fs.existsSync(preRestoreDir)) {
          await fsp.rename(preRestoreDir, stateDir);
        }
        await startGateway();
      } catch (rollbackErr) {
        console.error("[ipc/backup] rollback also failed:", rollbackErr);
      }

      return { ok: false, error: `Failed to restore backup: ${String(err)}` };
    } finally {
      try {
        await fsp.rm(tmpDir, { recursive: true, force: true });
      } catch {
        // cleanup best-effort
      }
    }
  });
}
