#!/usr/bin/env node
const { spawnSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { requireLocalDevApiTarget } = require("./resolve-dev-api-target.cjs");
const { ensureAutomationRecipesCatalog } = require("./ensure-automation-recipes-catalog.cjs");

const repoRoot = path.resolve(__dirname, "..");
const viteBin = path.join(repoRoot, "node_modules", "vite", "bin", "vite.js");

const catalogStatus = ensureAutomationRecipesCatalog();
if (catalogStatus !== 0) {
  process.exit(catalogStatus);
}

process.env.NEO_PULSE_DEV_ORCHESTRATOR = "1";
process.env.VITE_LOCAL_API_TARGET = requireLocalDevApiTarget();
process.env.VITE_MCP_API_BASE = process.env.VITE_MCP_API_BASE || "/api/mcp";

// The dev proxy verifies TLS against the local site CA (never disabled).
// Point Node at the local CA bundle (mkcert or WP Staging) when one exists.
if (!process.env.NODE_EXTRA_CA_CERTS) {
  const caCandidates = [
    path.join(os.homedir(), "wpstaging", "stack", "localcert", "ca", "rootCA.pem"),
    path.join(process.env.LOCALAPPDATA || "", "mkcert", "rootCA.pem"),
    path.join(os.homedir(), ".local", "share", "mkcert", "rootCA.pem"),
  ];
  const caFile = caCandidates.find((candidate) => candidate && fs.existsSync(candidate));
  if (caFile) {
    process.env.NODE_EXTRA_CA_CERTS = caFile;
  }
}

const viteArgs = [viteBin];
if (process.env.LOCAL_DEV_VITE_FORCE === "1") {
  viteArgs.push("--force");
}

const result = spawnSync(process.execPath, viteArgs, {
  stdio: "inherit",
  cwd: repoRoot,
  env: process.env,
});

process.exit(result.status ?? 1);
