/**
 * Pulse UI audit. Prints violation counts per category (should be zero) and lists every
 * documented per-line exception ("Pulse UI exception: reason").
 *   node scripts/pulse-ui-audit.mjs
 * Enforcement itself is eslint (see eslint.config.js); CI runs this through `npm run ui:check`.
 */
import { ESLint } from "eslint";
import { globSync, readFileSync } from "node:fs";
import { relative, resolve } from "node:path";
import { PULSE_UI_EXEMPT, PULSE_UI_IMPORT_BAN, PULSE_UI_PAGE_FILES, PULSE_UI_PAGE_RULES } from "../eslint.pulse-ui-rules.js";

const root = resolve(import.meta.dirname, "..");
process.chdir(root);

const CATEGORIES = [
  ["spinner", /No spinner/],
  ["truncate", /^No truncated/],
  ["font-size", /^No arbitrary font/],
  ["palette", /^No raw palette/],
  ["label", /^No stacked labels/],
  ["raw-control", /^No raw form controls/],
  ["shadcn-import", /Import Button, Field/],
];

const eslint = new ESLint({
  overrideConfig: [
    { files: ["src/**/*.{ts,tsx}"], ignores: PULSE_UI_EXEMPT, rules: PULSE_UI_IMPORT_BAN },
    { files: PULSE_UI_PAGE_FILES, ignores: PULSE_UI_EXEMPT, rules: PULSE_UI_PAGE_RULES },
  ],
});
const results = await eslint.lintFiles(["src"]);

const totals = {};
const perFile = {};
for (const r of results) {
  for (const m of r.messages) {
    if (m.ruleId !== "no-restricted-syntax" && m.ruleId !== "no-restricted-imports") continue;
    const cat = CATEGORIES.find(([, re]) => re.test(m.message))?.[0] ?? "other";
    totals[cat] = (totals[cat] ?? 0) + 1;
    const rel = relative(root, r.filePath).replaceAll("\\", "/");
    perFile[rel] = (perFile[rel] ?? 0) + 1;
    console.log(`${rel}:${m.line} [${cat}]`);
  }
}
const violations = Object.values(totals).reduce((a, b) => a + b, 0);
console.log(`violations: ${violations} in ${Object.keys(perFile).length} files`);
for (const [cat] of CATEGORIES) console.log(`  ${cat}: ${totals[cat] ?? 0}`);

const exceptions = [];
for (const file of globSync("src/**/*.{ts,tsx}")) {
  readFileSync(file, "utf8")
    .split(/\r?\n/)
    .forEach((line, i) => {
      const m = line.match(/Pulse UI exception: (.*?)(\s*\*\/\})?$/);
      if (m) exceptions.push(`${file.replaceAll("\\", "/")}:${i + 1} ${m[1]}`);
    });
}
console.log(`documented exceptions: ${exceptions.length}`);
for (const e of exceptions.sort()) console.log(`  ${e}`);
process.exit(violations ? 1 : 0);