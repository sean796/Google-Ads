#!/usr/bin/env node
// Ships a generated page payload to a WordPress + Elementor MCP site via the
// WP Abilities REST endpoint. The JSON goes straight from disk to the server, // no conversation-context inlining required, no token-cost overhead from the
// payload size.
//
// Usage:
//   node ship.mjs <slug> [--regen]
//
// --regen   Re-runs build.mjs first to refresh output/<slug>.json
//
// Auth: reads the same Authorization header used by the MCP HTTP client out of
// project-root .mcp.json (the existing emcp-tools server config), so once
// the MCP transport works, ship.mjs works too.
//
// Override the .mcp.json location with EMCP_MCP_JSON=/path/to/.mcp.json

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execSync } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Walk up from scripts/ to find the project root that holds .mcp.json.
// Default assumption: scripts/ sits two levels below project root
// (e.g. <project>/scripts/template-builder/scripts/ship.mjs). Adjust if your
// layout differs, or set EMCP_MCP_JSON to point directly at the file.
const projectRoot = process.env.EMCP_PROJECT_ROOT
  ? path.resolve(process.env.EMCP_PROJECT_ROOT)
  : path.resolve(__dirname, '../..');

const args = process.argv.slice(2);
const slug = args[0];
const regen = args.includes('--regen');

if (!slug) {
  console.error('Usage: node ship.mjs <slug> [--regen]');
  process.exit(1);
}

// 1. Optionally regenerate the JSON.
if (regen) {
  console.log(`→ regenerating output/${slug}.json …`);
  execSync(`node ${path.join(__dirname, 'build.mjs')} ${slug}`, { stdio: 'inherit' });
}

// 2. Load the generated payload.
const outPath = path.join(__dirname, 'output', `${slug}.json`);
if (!fs.existsSync(outPath)) {
  console.error(`✗ ${outPath} not found. Run \`node build.mjs ${slug}\` first or pass --regen.`);
  process.exit(1);
}
const payload = JSON.parse(fs.readFileSync(outPath, 'utf8'));
const bytes = fs.statSync(outPath).size;
const elementCount = JSON.stringify(payload).match(/"type":/g)?.length ?? 0;

// 3. Read auth from .mcp.json (the same header the MCP HTTP client uses).
const mcpJsonPath = process.env.EMCP_MCP_JSON
  ? path.resolve(process.env.EMCP_MCP_JSON)
  : path.join(projectRoot, '.mcp.json');
if (!fs.existsSync(mcpJsonPath)) {
  console.error(`✗ ${mcpJsonPath} not found, can't read auth credentials.`);
  process.exit(1);
}
const mcpConfig = JSON.parse(fs.readFileSync(mcpJsonPath, 'utf8'));
const serverConfig = mcpConfig.mcpServers?.['emcp-tools'];
const authHeader = serverConfig?.headers?.Authorization;
const serverUrl = serverConfig?.url;
if (!authHeader || !serverUrl) {
  console.error('✗ .mcp.json is missing the emcp-tools server URL or Authorization header.');
  process.exit(1);
}

// Derive the abilities endpoint from the MCP server URL.
// MCP URL:        https://site/wp-json/mcp/emcp-tools-server
// Abilities URL:  https://site/wp-json/wp-abilities/v1/abilities/emcp-tools/build-page/run
const restRoot = serverUrl.replace(/\/mcp\/.*$/, '');
const endpoint = `${restRoot}/wp-abilities/v1/abilities/emcp-tools/build-page/run`;

console.log(`→ shipping to ${endpoint}`);
console.log(`  title:     ${payload.title}`);
console.log(`  elements:  ${elementCount}`);
console.log(`  size:      ${(bytes / 1024).toFixed(1)} KB`);

// 4. POST the payload.
const start = Date.now();
const res = await fetch(endpoint, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    Authorization: authHeader,
  },
  body: JSON.stringify({ input: payload }),
});

const elapsedMs = Date.now() - start;
const body = await res.text();

let parsed;
try { parsed = JSON.parse(body); } catch { parsed = null; }

if (!res.ok || parsed?.code) {
  console.error(`\n✗ Request failed (${res.status} ${res.statusText}, ${elapsedMs}ms)`);
  console.error(body);
  process.exit(1);
}

console.log(`\n✓ Created in ${elapsedMs}ms`);
console.log(`  post_id:        ${parsed.post_id}`);
console.log(`  elements_created: ${parsed.elements_created}`);
console.log(`  edit_url:       ${parsed.edit_url}`);
console.log(`  preview_url:    ${parsed.preview_url}`);
