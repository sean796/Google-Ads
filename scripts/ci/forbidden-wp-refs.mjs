#!/usr/bin/env node
/**
 * Fail CI when forbidden WordPress legacy tokens appear in app source.
 * Field keys like keyword_focus are allowed (no standalone \bacf\b in identifiers).
 */
import { execSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

const SCAN_ROOTS = [
  "src",
  path.join("wordpress-plugins", "neo-pulse-app"),
  path.join("wordpress-plugins", "neo-pulse-wp"),
];

const EXCLUDE_GLOB =
  "!**/node_modules/** !**/vendor/** !**/.deploy/** !**/includes/vendor/**";

const PATTERNS = [
  String.raw`\bacf\b`,
  String.raw`redirectcsv`,
  String.raw`neo_pulse_seo`,
  String.raw`\bemcp\b`,
  String.raw`neo-mcp`,
  String.raw`mcp_acf`,
  String.raw`mcp_elementor`,
  String.raw`Neo_Pulse_App_Wp_Acf`,
  String.raw`class-wp-acf`,
];

function rg(pattern, dirs) {
  const globArgs = EXCLUDE_GLOB.split(" ")
    .filter(Boolean)
    .flatMap((g) => ["--glob", g]);
  try {
    const out = execSync(
      [
        "rg",
        "-i",
        "--no-heading",
        "-n",
        pattern,
        ...globArgs,
        ...dirs.map((d) => `"${path.join(root, d)}"`),
      ].join(" "),
      { encoding: "utf8", maxBuffer: 20 * 1024 * 1024 },
    );
    return out.trim();
  } catch (e) {
    if (e.status === 1) return "";
    throw e;
  }
}

let failed = false;
const report = [];

for (const pattern of PATTERNS) {
  const hits = rg(pattern, SCAN_ROOTS);
  if (hits) {
    failed = true;
    report.push(`Pattern /${pattern}/i:\n${hits}\n`);
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
