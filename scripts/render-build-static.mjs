#!/usr/bin/env node
/**
 * Render static site build. Set RENDER_PROFILE=demo|prod and optional overrides.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, "..");

const profile = (process.env.RENDER_PROFILE || "demo").trim().toLowerCase();
const renderApiBase =
  (process.env.NEO_PULSE_RENDER_API_BASE || "https://pulse-host-wp-hub.onrender.com/api/mcp").trim();

const defaults =
  profile === "prod"
    ? {
        VITE_BASE_PATH: "/",
        VITE_MCP_API_BASE: renderApiBase,
      }
    : {
        VITE_BASE_PATH: "/",
        VITE_MCP_API_BASE: renderApiBase,
      };

process.env.RENDER = "true";
process.env.VITE_NEO_PULSE = process.env.VITE_NEO_PULSE || "1";
process.env.VITE_BASE_PATH = process.env.VITE_BASE_PATH || defaults.VITE_BASE_PATH;
process.env.VITE_MCP_API_BASE = process.env.VITE_MCP_API_BASE || defaults.VITE_MCP_API_BASE;

if (!process.env.VITE_BASE_PATH.endsWith("/")) {
  process.env.VITE_BASE_PATH = `${process.env.VITE_BASE_PATH}/`;
}

console.log("[render-build-static]", {
  profile,
  VITE_BASE_PATH: process.env.VITE_BASE_PATH,
  VITE_MCP_API_BASE: process.env.VITE_MCP_API_BASE,
});

const result = spawnSync("node", [path.join(repoRoot, "scripts", "build-neo-pulse.cjs")], {
  cwd: repoRoot,
  stdio: "inherit",
  env: process.env,
  shell: false,
});

if ((result.status ?? 1) === 0) {
  const redirectsPath = path.join(repoRoot, "dist", "_redirects");
  fs.mkdirSync(path.dirname(redirectsPath), { recursive: true });
  fs.writeFileSync(
    redirectsPath,
    "/terms-of-service    /terms-of-service.html    200\n/privacy-policy      /privacy-policy.html      200\n/*                   /index.html               200\n",
    "utf8",
  );
  console.log("[render-build-static] wrote dist/_redirects");
}

process.exit(result.status ?? 1);
