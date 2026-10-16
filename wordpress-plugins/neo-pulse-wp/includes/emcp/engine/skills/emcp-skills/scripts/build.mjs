#!/usr/bin/env node
// CLI runner: node build.mjs <slug>
//
// Reads templates/<slug>.mjs (default export = page payload),
// writes output/<slug>.json, feed that JSON into the emcp-tools
// `build-page` MCP tool or REST ability to materialize the page on a
// WordPress + Elementor + Elementor MCP site.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const slug = process.argv[2];
if (!slug) {
  console.error('Usage: node build.mjs <slug>');
  console.error('Looks for templates/<slug>.mjs, writes output/<slug>.json');
  process.exit(1);
}

const templatePath = path.join(__dirname, 'templates', `${slug}.mjs`);
if (!fs.existsSync(templatePath)) {
  console.error(`Template config not found: ${templatePath}`);
  process.exit(1);
}

const outputDir = path.join(__dirname, 'output');
fs.mkdirSync(outputDir, { recursive: true });

const mod = await import(pathToFileURL(templatePath).href);
const payload = mod.default;

if (!payload || !payload.structure || !Array.isArray(payload.structure)) {
  console.error(`Template ${slug} did not export a valid payload (expected { title, structure, ... })`);
  process.exit(1);
}

const outPath = path.join(outputDir, `${slug}.json`);
fs.writeFileSync(outPath, JSON.stringify(payload, null, 2));

const elementCount = JSON.stringify(payload).match(/"type":/g)?.length ?? 0;
console.log(`✓ Wrote ${outPath}`);
console.log(`  Title:          ${payload.title}`);
console.log(`  Elements:       ${elementCount}`);
console.log(`  Payload size:   ${(fs.statSync(outPath).size / 1024).toFixed(1)} KB`);
console.log('');
console.log('Next step: ship to the live site , ');
console.log(`  node ship.mjs ${slug}`);
console.log('');
console.log('Or paste the JSON directly into an MCP build-page tool call:');
console.log(`  mcp__emcp-tools__emcp-tools-build-page({`);
console.log(`    title: "${payload.title}",`);
console.log(`    status: "${payload.status ?? 'publish'}",`);
console.log(`    page_settings: ${JSON.stringify(payload.page_settings ?? {})},`);
console.log(`    structure: <contents of ${path.relative(process.cwd(), outPath)}>`);
console.log(`  })`);
