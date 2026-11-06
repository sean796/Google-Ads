#!/usr/bin/env node
/**
 * UI catalog generator. Renders the component table in docs/api/ui/registry.md
 * from UI_REGISTRY (src/ui/registry.ts) so the doc cannot drift from the code.
 *
 *   node scripts/generate-ui-catalog.mjs           rewrite the table
 *   node scripts/generate-ui-catalog.mjs --check   fail if the table is stale,
 *                                                  a registry entry is not
 *                                                  exported from @/ui, or its
 *                                                  component file is missing
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import ts from "typescript";

const root = resolve(import.meta.dirname, "..");
const REGISTRY_TS = resolve(root, "src/ui/registry.ts");
const INDEX_TS = resolve(root, "src/ui/index.ts");
const DOC = resolve(root, "docs/api/ui/registry.md");
const START = "<!-- ui-catalog:start -->";
const END = "<!-- ui-catalog:end -->";

function parseSource(path) {
  return ts.createSourceFile(path, readFileSync(path, "utf8"), ts.ScriptTarget.Latest, true);
}

function stringValue(node) {
  return node && (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) ? node.text : "";
}

/** @returns {{name:string, layer:string}[]} registry entries in source order. */
function readRegistry() {
  const sf = parseSource(REGISTRY_TS);
  const entries = [];
  for (const stmt of sf.statements) {
    if (!ts.isVariableStatement(stmt)) continue;
    for (const decl of stmt.declarationList.declarations) {
      if (decl.name.getText() !== "UI_REGISTRY" || !decl.initializer) continue;
      let init = decl.initializer;
      while (ts.isAsExpression(init) || ts.isSatisfiesExpression(init) || ts.isParenthesizedExpression(init)) {
        init = init.expression;
      }
      if (!ts.isObjectLiteralExpression(init)) continue;
      for (const prop of init.properties) {
        if (!ts.isPropertyAssignment(prop) || !ts.isObjectLiteralExpression(prop.initializer)) continue;
        const fields = {};
        for (const field of prop.initializer.properties) {
          if (ts.isPropertyAssignment(field)) fields[field.name.getText()] = stringValue(field.initializer);
        }
        entries.push({ name: prop.name.getText(), layer: fields.layer ?? "" });
      }
    }
  }
  return entries;
}

/** @returns {Map<string,string>} exported name to module specifier. */
function readExports() {
  const sf = parseSource(INDEX_TS);
  const map = new Map();
  for (const stmt of sf.statements) {
    if (!ts.isExportDeclaration(stmt) || !stmt.moduleSpecifier || !stmt.exportClause) continue;
    if (!ts.isNamedExports(stmt.exportClause)) continue;
    for (const el of stmt.exportClause.elements) {
      map.set(el.name.getText(), stmt.moduleSpecifier.text);
    }
  }
  return map;
}

function moduleToFile(spec) {
  const rel = spec.startsWith("@/") ? `src/${spec.slice(2)}` : spec;
  for (const candidate of [`${rel}.tsx`, `${rel}.ts`, `${rel}/index.tsx`, `${rel}/index.ts`]) {
    if (existsSync(resolve(root, candidate))) return candidate.replaceAll("\\", "/");
  }
  return null;
}

const entries = readRegistry();
const exportsMap = readExports();
const errors = [];
const rows = [];
for (const entry of entries) {
  const spec = exportsMap.get(entry.name);
  if (!spec) {
    errors.push(`${entry.name}: in UI_REGISTRY but not exported from src/ui/index.ts`);
    continue;
  }
  const file = moduleToFile(spec);
  if (!file) {
    errors.push(`${entry.name}: exported from ${spec} but the file does not exist`);
    continue;
  }
  const storyPath = resolve(root, dirname(file), `${entry.name}.stories.tsx`);
  const story = existsSync(storyPath) ? `${entry.name}.stories.tsx` : "none yet";
  rows.push(`| \`${entry.name}\` | ${entry.layer} | \`${file}\` | \`${story}\` |`);
}

if (entries.length === 0) errors.push("UI_REGISTRY parsed to zero entries; the parser is out of date.");

const table = ["| Name | Layer | File | Story |", "|---|---|---|---|", ...rows].join("\n");
const doc = readFileSync(DOC, "utf8");
const startIdx = doc.indexOf(START);
const endIdx = doc.indexOf(END);
if (startIdx === -1 || endIdx === -1 || endIdx < startIdx) {
  console.error(`generate-ui-catalog: ${DOC} is missing the ${START} / ${END} markers.`);
  process.exit(1);
}
const next = `${doc.slice(0, startIdx + START.length)}\n\n${table}\n\n${doc.slice(endIdx)}`;

for (const e of errors) console.error(`generate-ui-catalog: ${e}`);
if (process.argv.includes("--check")) {
  if (next !== doc) {
    console.error("generate-ui-catalog: docs/api/ui/registry.md table is stale. Run: node scripts/generate-ui-catalog.mjs");
    process.exit(1);
  }
  if (errors.length > 0) process.exit(1);
  console.log(`generate-ui-catalog: ${entries.length} entries in sync.`);
} else {
  if (errors.length > 0) process.exit(1);
  writeFileSync(DOC, next);
  console.log(`generate-ui-catalog: wrote ${entries.length} entries to docs/api/ui/registry.md`);
}
