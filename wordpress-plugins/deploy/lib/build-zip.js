import { readFileSync, readdirSync } from "fs";
import { join } from "path";
import AdmZip from "adm-zip";
import { assertNoSecretsInFiles, isSecretRelPath } from "./secret-excludes.js";

const SKIP_DIRS = new Set(["tests", ".git", "node_modules"]);

function shouldSkip(rel) {
  const norm = rel.replace(/\\/g, "/");
  if (norm.split("/").some((p) => SKIP_DIRS.has(p))) return true;
  if (!norm.includes("/") && norm.toLowerCase().endsWith(".md")) return true;
  if (isSecretRelPath(norm)) return true;
  return false;
}

function collectFiles(root, rel = "") {
  const files = [];
  for (const ent of readdirSync(join(root, rel), { withFileTypes: true })) {
    const nextRel = rel ? `${rel}/${ent.name}` : ent.name;
    if (shouldSkip(nextRel.replace(/\\/g, "/"))) continue;
    if (ent.isDirectory()) {
      files.push(...collectFiles(root, nextRel));
    } else if (ent.isFile()) {
      files.push({ local: join(root, nextRel), rel: nextRel.replace(/\\/g, "/") });
    }
  }
  return files;
}

export function buildPluginZip(pluginDir, zipPath, onProgress) {
  const files = collectFiles(pluginDir).sort((a, b) => {
    if (a.rel === "neo-pulse-wp.php") return -1;
    if (b.rel === "neo-pulse-wp.php") return 1;
    return a.rel.localeCompare(b.rel);
  });
  assertNoSecretsInFiles(files, "Plugin zip build");
  const zip = new AdmZip();

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const buf = readFileSync(file.local);
    zip.addFile(`neo-pulse-wp/${file.rel}`, buf.length > 0 ? buf : Buffer.from("\n", "utf8"));
    onProgress?.(i + 1, files.length);
  }

  zip.writeZip(zipPath);
}
