#!/usr/bin/env node
/**
 * Secret guard: block secret files and known credential patterns.
 *
 * Modes:
 *   node scripts/check-no-secrets.mjs                  staged files (pre-commit default, reads index blobs)
 *   node scripts/check-no-secrets.mjs --all-tracked    every tracked file (working tree)
 *
 *   git config core.hooksPath .githooks
 */

import { execSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";
import { basename } from "node:path";

const SECRET_BASENAMES = new Set([
  "neo-pulse-app-secrets.php",
  "neo-pulse-wp-secrets.php",
  "neo-pulse-wp-gsc-config.php",
  ".env",
  // Wave 0: files that must never return to the repo.
  "default-properties-seed.json",
  "sites-json-backup-check.json",
  "manager-settings.json",
  "email-worker-keys.json",
  "ga-service-account.json",
  "gsc-service-account.json",
]);

const BLOCKED_PATH_PATTERNS = [
  /^wordpress-plugins\/\.deploy\/.*\.zip$/i,
  /^wordpress-plugins\/.*\.zip$/i,
  /^\.env(?!.*\.example$)(\.|$)/,
  /-credentials.*\.json$/i,
  /\.credentials\.json$/i,
  /neo-pulse-wpengine\.config\.json$/i,
  /^gsc-config\.local\.js$/i,
];

// Field-context patterns: they name the credential slot, not generic words,
// so docs and test fixtures that merely mention a field stay green.
const CONTENT_PATTERNS = [
  { re: /GOCSPX-[A-Za-z0-9_-]{10,}/, label: "Google OAuth client secret (GOCSPX-)" },
  {
    re: /define\s*\(\s*['"]NEO_PULSE_APP_GMB_CLIENT_SECRET['"]\s*,\s*['"][^'"]{8,}['"]/,
    label: "non-empty NEO_PULSE_APP_GMB_CLIENT_SECRET",
  },
  {
    re: /define\s*\(\s*['"]NEO_PULSE_WP_GMB_CLIENT_SECRET['"]\s*,\s*['"][^'"]{8,}['"]/,
    label: "non-empty NEO_PULSE_WP_GMB_CLIENT_SECRET",
  },
  { re: /\bsk-or-[A-Za-z0-9_-]{20,}/, label: "OpenRouter API key (sk-or-)" },
  { re: /-----BEGIN (?:RSA |EC )?PRIVATE KEY-----/, label: "PEM private key" },
  { re: /"appPassword"\s*:\s*"[^"]{6,}"/, label: "WordPress app password value (appPassword field)" },
  { re: /'appPassword'\s*=>\s*'[^']{6,}'/, label: "WordPress app password value (appPassword field)" },
  { re: /\bLOCAL_DEMO_(?:PASSWORD|EMAIL|USER|TEAM)\s*=/, label: "hardcoded demo credential constant" },
  { re: /saveDeviceAuth\(\s*["'][^"']+["']\s*,\s*["']/, label: "literal credentials passed to saveDeviceAuth" },
  { re: /\bxox[baprs]-[A-Za-z0-9-]{10,}/, label: "Slack token (xox*)" },
  { re: /\bxapp-[A-Za-z0-9-]{10,}/, label: "Slack app token (xapp-)" },
  { re: /hooks\.slack\.com\/services\/[A-Za-z0-9/]{10,}/, label: "Slack incoming webhook URL" },
  { re: /"type"\s*:\s*"service_account"/, label: "Google service account JSON" },
  { re: /\bAIza[0-9A-Za-z_-]{20,}/, label: "Google API key (AIza)" },
  { re: /\bya29\.[0-9A-Za-z_-]{10,}/, label: "Google OAuth access token (ya29.)" },
  { re: /\bsemrtkn-[A-Za-z0-9_-]{10,}/, label: "Semrush token (semrtkn-)" },
];

function stagedFiles() {
  const out = execSync("git diff --cached --name-only --diff-filter=ACMR", {
    encoding: "utf8",
  });
  return out
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function trackedFiles() {
  const out = execSync("git ls-files", { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });
  return out
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function stagedBlob(file) {
  try {
    return execSync(`git show ":${file.replace(/"/g, "")}"`, {
      encoding: "utf8",
      maxBuffer: 4 * 1024 * 1024,
    });
  } catch {
    return null;
  }
}

function isBlockedPath(file) {
  const norm = file.replace(/\\/g, "/");
  const base = basename(norm);
  if (SECRET_BASENAMES.has(base)) return `secret filename (${base})`;
  if (base.startsWith(".env") && !base.endsWith(".example")) return "env file";
  for (const re of BLOCKED_PATH_PATTERNS) {
    if (re.test(norm)) return `blocked path pattern (${re})`;
  }
  return null;
}

function scanText(text) {
  if (text.includes("\0")) return [];
  const hits = [];
  for (const { re, label } of CONTENT_PATTERNS) {
    if (re.test(text)) hits.push(label);
  }
  return hits;
}

function scanWorkingFile(file) {
  const norm = file.replace(/\\/g, "/");
  if (/\/vendor\//.test(norm)) return [];

  let stat;
  try {
    stat = statSync(file);
  } catch {
    return [];
  }
  if (!stat.isFile() || stat.size > 2 * 1024 * 1024) return [];

  let text;
  try {
    text = readFileSync(file, "utf8");
  } catch {
    return [];
  }
  return scanText(text);
}

function main() {
  const allTracked = process.argv.includes("--all-tracked");
  const files = allTracked ? trackedFiles() : stagedFiles();
  if (files.length === 0) process.exit(0);

  /** @type {string[]} */
  const errors = [];

  for (const file of files) {
    const pathReason = isBlockedPath(file);
    if (pathReason) {
      errors.push(`${file}: ${pathReason}`);
      continue;
    }
    let hits;
    if (allTracked) {
      hits = scanWorkingFile(file);
    } else {
      const blob = stagedBlob(file);
      hits = blob === null ? scanWorkingFile(file) : scanText(blob);
    }
    for (const hit of hits) {
      errors.push(`${file}: contains ${hit}`);
    }
  }

  if (errors.length === 0) {
    if (allTracked) console.log(`check-no-secrets: ${files.length} tracked files clean.`);
    process.exit(0);
  }

  console.error(allTracked ? "Secret scan failed (all tracked files):\n" : "Commit blocked: possible secrets detected.\n");
  for (const err of errors) console.error(`  - ${err}`);
  console.error(
    "\nRemove these files (git reset HEAD -- <path>) or rotate credentials if already pushed."
  );
  process.exit(1);
}

main();
