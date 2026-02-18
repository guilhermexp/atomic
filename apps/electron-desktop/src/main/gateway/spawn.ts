import { spawn, type ChildProcess } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";

import { ensureDir } from "../util/fs";
import type { TailBuffer } from "../util/net";
import {
  DEFAULT_MODEL_ID,
  getModelDef,
  resolveModelPath,
  type WhisperModelId,
} from "../whisper/ipc";

const WHISPER_MODEL_FILE = "whisper-model-id";

export function readSelectedWhisperModel(stateDir: string): WhisperModelId | "openai" {
  try {
    const raw = fs.readFileSync(path.join(stateDir, WHISPER_MODEL_FILE), "utf-8").trim();
    if (
      raw === "openai" ||
      raw === "small" ||
      raw === "large-v3-turbo-q8" ||
      raw === "large-v3-turbo"
    ) {
      return raw;
    }
  } catch {
    // File doesn't exist yet — use default
  }
  return DEFAULT_MODEL_ID;
}

export function writeSelectedWhisperModel(stateDir: string, modelId: string): void {
  fs.writeFileSync(path.join(stateDir, WHISPER_MODEL_FILE), modelId, "utf-8");
}

export function spawnGateway(params: {
  port: number;
  logsDir: string;
  stateDir: string;
  configPath: string;
  token: string;
  openclawDir: string;
  nodeBin: string;
  gogBin?: string;
  jqBin?: string;
  memoBin?: string;
  remindctlBin?: string;
  obsidianCliBin?: string;
  ghBin?: string;
  whisperCliBin?: string;
  electronRunAsNode?: boolean;
  stderrTail: TailBuffer;
}): ChildProcess {
  const {
    port,
    logsDir,
    stateDir,
    configPath,
    token,
    openclawDir,
    nodeBin,
    gogBin,
    jqBin,
    memoBin,
    remindctlBin,
    obsidianCliBin,
    ghBin,
    whisperCliBin,
    electronRunAsNode,
    stderrTail,
  } = params;

  ensureDir(logsDir);
  ensureDir(stateDir);

  const stdoutPath = path.join(logsDir, "gateway.stdout.log");
  const stderrPath = path.join(logsDir, "gateway.stderr.log");
  const stdout = fs.createWriteStream(stdoutPath, { flags: "a" });
  const stderr = fs.createWriteStream(stderrPath, { flags: "a" });

  const script = path.join(openclawDir, "openclaw.mjs");
  // Important: first-run embedded app starts without a config file. Allow the Gateway to start
  // so the Control UI/WebChat + wizard flows can create config.
  // --verbose enables debug-level logging to help diagnose provider/model errors.
  const args = [
    script,
    "gateway",
    "--bind",
    "loopback",
    "--port",
    String(port),
    "--allow-unconfigured",
    "--verbose",
    // Kill any lingering gateway process on this port before binding.
    // Covers orphans from crashes, force-quit, or previous app versions.
    "--force",
  ];

  const envPath = typeof process.env.PATH === "string" ? process.env.PATH : "";
  const extraBinDirs = [jqBin, gogBin, memoBin, remindctlBin, obsidianCliBin, ghBin, whisperCliBin]
    .map((bin) => (bin ? path.dirname(bin) : ""))
    .filter(Boolean);
  const uniqueExtraBinDirs = Array.from(new Set(extraBinDirs));
  const mergedPath =
    uniqueExtraBinDirs.length > 0
      ? `${uniqueExtraBinDirs.join(path.delimiter)}${path.delimiter}${envPath}`
      : envPath;

  const ghConfigDir = path.join(stateDir, "gh");
  ensureDir(ghConfigDir);

  const env: NodeJS.ProcessEnv = {
    ...process.env,
    // Keep all OpenClaw state inside the Electron app's userData directory.
    OPENCLAW_STATE_DIR: stateDir,
    OPENCLAW_CONFIG_PATH: configPath,
    OPENCLAW_GATEWAY_PORT: String(port),
    OPENCLAW_GATEWAY_TOKEN: token,
    // Ensure the embedded Gateway resolves bundled binaries via PATH (gog, jq, ...).
    PATH: mergedPath,
    // Ensure `gh` uses the app's own config storage.
    GH_CONFIG_DIR: ghConfigDir,
    // Point the gateway's whisper-cli media-understanding runner at the user's selected model.
    // When "openai" is selected, omit WHISPER_CPP_MODEL so the gateway uses the OpenAI API.
    ...(() => {
      if (!whisperCliBin) return {};
      const selected = readSelectedWhisperModel(stateDir);
      if (selected === "openai") return {};
      return { WHISPER_CPP_MODEL: resolveModelPath(whisperCliBin, getModelDef(selected)) };
    })(),
    // Reduce noise in embedded contexts.
    NO_COLOR: "1",
    FORCE_COLOR: "0",
    // Prevent the gateway from spawning a detached child on self-restart (SIGUSR1).
    // In-process restart keeps the same PID so Electron can always kill it on quit.
    OPENCLAW_NO_RESPAWN: "1",
  };

  // If we're spawning via Electron, force it into "Node mode" (otherwise it tries to launch a GUI process).
  if (electronRunAsNode) {
    env.ELECTRON_RUN_AS_NODE = "1";
  }

  const child = spawn(nodeBin, args, {
    cwd: openclawDir,
    env,
    stdio: ["ignore", "pipe", "pipe"],
    // Make the gateway a process group leader so we can kill the entire tree
    // (parent + any children it spawns) with process.kill(-pid, signal).
    detached: true,
  });

  child.stderr.on("data", (chunk) => {
    try {
      stderrTail.push(String(chunk));
    } catch {
      // ignore
    }
  });

  child.stdout.pipe(stdout);
  child.stderr.pipe(stderr);

  return child;
}
