import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { readGeneratedExternals } from "./lib/openclaw-bundle-config.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(here, "..");
const prepareScript = path.join(appRoot, "scripts", "prepare-openclaw-bundle.mjs");

const child = spawnSync(process.execPath, [prepareScript], {
  cwd: appRoot,
  stdio: "inherit",
  env: {
    ...process.env,
    OPENCLAW_BUNDLE_WRITE_GENERATED_EXTERNALS: "1",
  },
});

if (child.status !== 0) {
  process.exit(child.status ?? 1);
}

const generated = readGeneratedExternals();
console.log(
  `[electron-desktop] Refreshed generated externals (${generated.length}): ${generated.join(", ") || "<none>"}`
);
