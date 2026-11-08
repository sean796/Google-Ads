#!/usr/bin/env node
/**
 * One-shot NEO Pulse rebrand: content replacements + file renames.
 * Run from repo root: node scripts/rebrand-neo-pulse.mjs
 */
import { readFileSync, writeFileSync, readdirSync, statSync, renameSync, existsSync } from "node:fs";
import { join, dirname, relative } from "node:path";
import { execSync } from "node:child_process";

const root = join(import.meta.dirname, "..");

const SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  "dist",
  ".cursor",
  "agent-transcripts",
]);

const SKIP_FILES = new Set([
  "package-lock.json",
  "rebrand-neo-pulse.mjs",
]);

/** Ordered replacements (most specific first). */
const REPLACEMENTS = [
  ["FlowbieAppBrand", "NeoPulseAppBrand"],
  ["FloBrandMark", "NeoPulseBrandMark"],
  ["FlowbieAppBrandProps", "NeoPulseAppBrandProps"],
  ["FloBrandMarkProps", "NeoPulseBrandMarkProps"],
  ["__NEO_PULSE_WP_LOGGED_IN__", "__NEO_PULSE_WP_LOGGED_IN__"],
  ["FlowbieONE", "NEO Pulse"],
  ["Flowbie WP", "NEO Pulse WP"],
  ["Flowbie App", "NEO Pulse App"],
  ["Flowbie ONE", "NEO Pulse App"],
  ["flowbie-meta-program-brief", "neo-pulse-meta-program-brief"],
  ["flowbie-meta-marketing-context", "neo-pulse-meta-marketing-context"],
  ["flowbie-wp-tools", "REMOVED_NEO_PULSE_WP_TOOLs"],
  ["flowbie-fields-discovery", "neo-pulse-fields-discovery"],
  ["flowbie-ca-deploy", "neo-pulse-deploy"],
  ["flowbie-ca-smoke", "neo-pulse-smoke"],
  ["build-flowbie-ca", "build-neo-pulse"],
  ["build-flowbie-wp-zip", "build-neo-pulse-wp-zip"],
  ["deploy-flowbie-app", "deploy-neo-pulse-app"],
  ["deploy-flowbie-ca", "deploy-neo-pulse"],
  ["smoke:flowbie-ca", "smoke:neo-pulse"],
  ["build:flowbie-ca", "build:neo-pulse"],
  ["build:flowbie-wp-zip", "build:neo-pulse-wp-zip"],
  ["deploy:flowbie-ca", "deploy:neo-pulse"],
  ["embed:flowbie-wp-secrets", "embed:neo-pulse-wp-secrets"],
  ["test:flowbie-app", "test:neo-pulse-app"],
  ["deploy-flowbie-ca.md", "deploy-neo-pulse.md"],
  ["VITE_NEO_PULSE_CA", "VITE_NEO_PULSE"],
  ["flowbie-wpengine", "neo-pulse-wpengine"],
  ["flowbieDistRemotePath", "neoPulseDistRemotePath"],
  ["flowbieAppRemotePath", "neoPulseAppRemotePath"],
  ["NEO_PULSE_WPENGINE_CONFIG", "NEO_PULSE_WPENGINE_CONFIG"],
  ["flowbie-brain-icon", "neo-pulse-icon"],
  ["flowbie-brain-icon.svg", "neo-pulse-icon.svg"],
  ["flowbie-wp-secrets", "neo-pulse-wp-secrets"],
  ["flowbie-app-secrets", "neo-pulse-app-secrets"],
  ["flowbie-wp-gsc-config", "neo-pulse-wp-gsc-config"],
  ["embed-flowbie-wp-secrets", "embed-neo-pulse-wp-secrets"],
  ["flowbie-wp.zip", "neo-pulse-wp.zip"],
  ["flowbie-data", "neo-pulse-data"],
  ["flowbie_fields", "neo_pulse_fields"],
  ["flowbieBlack", "neoPulseBlack"],
  ["flowbie_session_token", "neo_pulse_session_token"],
  ["flowbie_session", "neo_pulse_session"],
  ["flowbie-workspace", "neo-pulse-workspace"],
  ["flowbie-manager-tab", "neo-pulse-manager-tab"],
  ["flowbie-manager-settings-cluster", "neo-pulse-manager-settings-cluster"],
  ["flowbie-manager-sticky-nav", "neo-pulse-manager-sticky-nav"],
  ["flowbie-manager-tab-scroll", "neo-pulse-manager-tab-scroll"],
  ["flowbie-active-wp-site-id", "neo-pulse-active-wp-site-id"],
  ["flowbie-panel-neon", "neo-pulse-panel-neon"],
  ["--flowbie-glow-subtle", "--neo-pulse-glow-subtle"],
  ["--flowbie-glow", "--neo-pulse-glow"],
  ["flowbie-accent-row", "neo-pulse-accent-row"],
  ["flowbie-zone-tile", "neo-pulse-zone-tile"],
  ["flowbie-glow", "neo-pulse-glow"],
  ["flowbie.ca/flowbie", "neodigital.ca/neo-pulse"],
  ["https://flowbie.ca/flowbie/", "https://neodigital.ca/neo-pulse/"],
  ["https://flowbie.ca/flowbie", "https://neodigital.ca/neo-pulse"],
  ["https://flowbie.ca", "https://neodigital.ca"],
  ["http://flowbie.ca", "https://neodigital.ca"],
  ["flowbie.ca", "neodigital.ca"],
  ["noreply@flowbie.ca", "noreply@neodigital.ca"],
  ["flo@flowbie.system", "pulse@neodigital.ca"],
  ["Flowbie Web App", "NEO Pulse Web App"],
  ["OPENROUTER_WEB_APP_TITLE = \"Flowbie", "OPENROUTER_WEB_APP_TITLE = \"NEO Pulse"],
  ["flowbie-app/v1", "neo-pulse-app/v1"],
  ["flowbie/v1", "neo-pulse/v1"],
  ["flowbie-app", "neo-pulse-app"],
  ["flowbie-wp", "neo-pulse-wp"],
  ["Flowbie_Wp", "Neo_Pulse_Wp"],
  ["Flowbie_App", "Neo_Pulse_App"],
  ["NEO_PULSE_WP_", "NEO_PULSE_WP_"],
  ["NEO_PULSE_APP_", "NEO_PULSE_APP_"],
  ["class-flowbie-wp-", "class-neo-pulse-wp-"],
  ["class-flowbie-app-", "class-neo-pulse-app-"],
  ["class-flowbie-data-", "class-neo-pulse-data-"],
  ["trait-flowbie-wp-", "trait-neo-pulse-wp-"],
  ["flowbie_wp_", "neo_pulse_wp_"],
  ["flowbie_teams", "neo_pulse_teams"],
  ["flowbie_team_", "neo_pulse_team_"],
  ["flowbie_chat_", "neo_pulse_chat_"],
  ["flowbie_current_settings", "neo_pulse_current_settings"],
  ["flowbie-one", "neo-pulse"],
  ["siteHasFlowbieWp", "siteHasNeoPulseWp"],
  ["flowbieWp", "neoPulseWp"],
  ["Flowbie", "NEO Pulse"],
  ["flowbie", "neo-pulse"],
  ["flo-email-reply", "neo-pulse-email-reply"],
  ["chat-flo", "chat-neo-pulse"],
  ["/flowbie/", "/neo-pulse/"],
  ["/flowbie", "/neo-pulse"],
];

const TEXT_EXTENSIONS = new Set([
  ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs",
  ".php", ".css", ".md", ".json", ".html", ".txt", ".bat", ".ps1", ".example",
]);

function walk(dir, files = []) {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, files);
    else files.push(p);
  }
  return files;
}

function applyReplacements(content) {
  let out = content;
  for (const [from, to] of REPLACEMENTS) {
    out = out.split(from).join(to);
  }
  return out;
}

function shouldProcessFile(filePath) {
  const base = filePath.split(/[/\\]/).pop() ?? "";
  if (SKIP_FILES.has(base)) return false;
  if (base.endsWith(".png") || base.endsWith(".jpg") || base.endsWith(".zip")) return false;
  const ext = base.includes(".") ? base.slice(base.lastIndexOf(".")) : "";
  return TEXT_EXTENSIONS.has(ext) || base === "vite.config.ts";
}

function renamePath(oldPath, newPath) {
  if (!existsSync(oldPath)) return false;
  if (existsSync(newPath)) return false;
  renameSync(oldPath, newPath);
  return true;
}

function renameFilesByPattern(dir) {
  if (!existsSync(dir)) return;
  for (const file of walk(dir)) {
    const base = file.split(/[/\\]/).pop() ?? "";
    let newBase = base;
    for (const [from, to] of REPLACEMENTS) {
      if (newBase.includes(from)) newBase = newBase.split(from).join(to);
    }
    if (newBase !== base) {
      const newPath = join(dirname(file), newBase);
      renamePath(file, newPath);
    }
  }
}

// 1. Content replacements
let changed = 0;
const targets = [
  join(root, "src"),
  join(root, "scripts"),
  join(root, "docs"),
  join(root, "wordpress-plugins"),
  join(root, "marketing"),
  join(root, "public"),
  join(root, "index.html"),
  join(root, "package.json"),
  join(root, "vite.config.ts"),
  join(root, "tailwind.config.ts"),
].filter((p) => existsSync(p));

const allFiles = [];
for (const t of targets) {
  if (statSync(t).isDirectory()) walk(t, allFiles);
  else allFiles.push(t);
}

for (const file of allFiles) {
  if (!shouldProcessFile(file)) continue;
  const before = readFileSync(file, "utf8");
  const after = applyReplacements(before);
  if (after !== before) {
    writeFileSync(file, after, "utf8");
    changed++;
    console.log("updated:", relative(root, file));
  }
}

console.log(`\nContent: ${changed} files updated`);

// 2. Rename WP plugin directories
const renames = [
  [join(root, "wordpress-plugins/flowbie-wp"), join(root, "wordpress-plugins/neo-pulse-wp")],
  [join(root, "wordpress-plugins/flowbie-app"), join(root, "wordpress-plugins/neo-pulse-app")],
  [join(root, "src/components/manager/FloBrandMark.tsx"), join(root, "src/components/manager/NeoPulseBrandMark.tsx")],
  [join(root, "src/components/manager/FlowbieAppBrand.tsx"), join(root, "src/components/manager/NeoPulseAppBrand.tsx")],
  [join(root, "src/lib/flowbie-ca-deploy.ts"), join(root, "src/lib/neo-pulse-deploy.ts")],
  [join(root, "src/lib/chat-flo.ts"), join(root, "src/lib/chat-neo-pulse.ts")],
  [join(root, "src/lib/flo-email-reply.ts"), join(root, "src/lib/neo-pulse-email-reply.ts")],
  [join(root, "src/lib/wordpress-api/flowbie-wp-tools.ts"), join(root, "src/lib/wordpress-api/REMOVED_NEO_PULSE_WP_TOOLs.ts")],
  [join(root, "src/lib/ppc/flowbie-meta-marketing-context.ts"), join(root, "src/lib/ppc/neo-pulse-meta-marketing-context.ts")],
  [join(root, "src/lib/ppc/flowbie-meta-program-brief.md"), join(root, "src/lib/ppc/neo-pulse-meta-program-brief.md")],
  [join(root, "public/marketing/flowbie-meta-program-brief.md"), join(root, "public/marketing/neo-pulse-meta-program-brief.md")],
  [join(root, "scripts/build-flowbie-ca.cjs"), join(root, "scripts/build-neo-pulse.cjs")],
  [join(root, "scripts/flowbie-ca-smoke.cjs"), join(root, "scripts/neo-pulse-smoke.cjs")],
  [join(root, "scripts/build-flowbie-wp-zip.mjs"), join(root, "scripts/build-neo-pulse-wp-zip.mjs")],
  [join(root, "scripts/add-flowbie-user.mjs"), join(root, "scripts/add-neo-pulse-user.mjs")],
  [join(root, "wordpress-plugins/deploy-flowbie-app.js"), join(root, "wordpress-plugins/deploy-neo-pulse-app.js")],
  [join(root, "docs/deploy-flowbie-ca.md"), join(root, "docs/deploy-neo-pulse.md")],
];

for (const [from, to] of renames) {
  if (renamePath(from, to)) console.log("renamed:", relative(root, from), "->", relative(root, to));
}

// 3. Rename files inside plugin dirs
renameFilesByPattern(join(root, "wordpress-plugins/neo-pulse-wp"));
renameFilesByPattern(join(root, "wordpress-plugins/neo-pulse-app"));
renameFilesByPattern(join(root, "src"));

// 4. Bootstrap PHP main files
const wpMain = [
  [join(root, "wordpress-plugins/neo-pulse-wp/flowbie-wp.php"), join(root, "wordpress-plugins/neo-pulse-wp/neo-pulse-wp.php")],
  [join(root, "wordpress-plugins/neo-pulse-app/flowbie-app.php"), join(root, "wordpress-plugins/neo-pulse-app/neo-pulse-app.php")],
];
for (const [from, to] of wpMain) {
  if (renamePath(from, to)) console.log("renamed:", relative(root, from), "->", relative(root, to));
}

console.log("\nDone. Review git diff before commit.");
