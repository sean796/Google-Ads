#!/usr/bin/env node
/**
 * Fail CI when forbidden WordPress legacy tokens appear in app source.
 * Field keys like keyword_focus are allowed (no standalone \bacf\b in identifiers).
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

const SCAN_ROOTS = [
  "src",
  path.join("wordpress-plugins", "neo-pulse-app"),
  path.join("wordpress-plugins", "neo-pulse-wp"),
];

const EXCLUDED_DIRS = new Set(["node_modules", "vendor", ".deploy", ".git"]);

const PATTERNS = [
  String.raw`mcp_acf`,
  String.raw`mcp_elementor`,
  String.raw`Neo_Pulse_App_Wp_Acf`,
  String.raw`class-wp-acf`,
];

function collectFiles(dirPath, out = []) {
  let entries;
  try {
    entries = readdirSync(dirPath, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (entry.name.startsWith(".") && entry.name !== ".htaccess") continue;
    if (EXCLUDED_DIRS.has(entry.name)) continue;
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      collectFiles(fullPath, out);
    } else if (entry.isFile()) {
      out.push(fullPath);
    }
  }
  return out;
}

const filesToScan = SCAN_ROOTS.flatMap((rel) => collectFiles(path.join(root, rel)));
const fileContents = [];

for (const filePath of filesToScan) {
  try {
    const st = statSync(filePath);
    if (st.size > 2 * 1024 * 1024) continue;
    const text = readFileSync(filePath, "utf8");
    if (text.includes("\0")) continue;
    fileContents.push({ filePath, lines: text.split(/\r?\n/) });
  } catch {
    // skip unreadable files
  }
}

let failed = false;
const report = [];

for (const pattern of PATTERNS) {
  const re = new RegExp(pattern, "i");
  const hits = [];
  for (const { filePath, lines } of fileContents) {
    for (let i = 0; i < lines.length; i++) {
      if (re.test(lines[i])) {
        hits.push(`${path.relative(root, filePath)}:${i + 1}:${lines[i]}`);
      }
    }
  }
  if (hits.length > 0) {
    failed = true;
    report.push(`Pattern /${pattern}/i:\n${hits.join("\n")}\n`);
  }
}

if (failed) {
  console.error(
    "Forbidden WordPress legacy references (ACF, NEO Pulse redirect, EMCP/MCP). Remove or rename:\n",
  );
  console.error(report.join("\n"));
  process.exit(1);
}

console.log("forbidden-wp-refs: OK");
