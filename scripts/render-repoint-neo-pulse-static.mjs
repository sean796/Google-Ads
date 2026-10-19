#!/usr/bin/env node
/**
 * Point neo-pulse-static at the public fork (legal pages + Render build) and redeploy.
 * Requires RENDER_API_KEY (see render-provision-neo-pulse.mjs loadApiKey paths).
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, "..");

process.env.NEO_PULSE_RENDER_REPO = "https://github.com/neodigitalca/neo-pulse";
process.env.NEO_PULSE_RENDER_BRANCH = "main";

const child = spawnSync("node", [path.join(repoRoot, "scripts", "render-provision-neo-pulse.mjs")], {
  cwd: repoRoot,
  stdio: "inherit",
  env: process.env,
});

process.exit(child.status ?? 1);
