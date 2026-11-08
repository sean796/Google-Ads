#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const RENAMES = [
  ["src/lib/acf-origin-applies.ts", "src/lib/post-fields-origin-applies.ts"],
  ["src/lib/__tests__/acf-origin-applies.test.ts", "src/lib/__tests__/post-fields-origin-applies.test.ts"],
  ["src/lib/overview/overview-acf-meta-line.ts", "src/lib/overview/overview-post-fields-meta-line.ts"],
  ["src/lib/overview/__tests__/overview-acf-meta-line.test.ts", "src/lib/overview/__tests__/overview-post-fields-meta-line.test.ts"],
  ["src/lib/wordpress-api/__tests__/acf-name-map-from-discovery.test.ts", "src/lib/wordpress-api/__tests__/post-field-name-map-from-discovery.test.ts"],
  ["src/lib/content-generation/__tests__/get-seo-research-from-acf.test.ts", "src/lib/content-generation/__tests__/get-seo-research-from-post-fields.test.ts"],
  ["src/lib/content-generation/__tests__/bulk-acf-seo-faq-optimize.test.ts", "src/lib/content-generation/__tests__/bulk-post-fields-seo-faq-optimize.test.ts"],
  ["src/lib/content-generation/__tests__/bulk-acf-seo-faq-entries.test.ts", "src/lib/content-generation/__tests__/bulk-post-fields-seo-faq-entries.test.ts"],
  ["src/lib/__tests__/sitemap-optimizer-rankmath-import.test.ts", "src/lib/__tests__/sitemap-optimizer-redirect-csv-import.test.ts"],
  ["src/hooks/content-optimization/__tests__/bulk-optimization-prefetch-acf-by-post-id.test.ts", "src/hooks/content-optimization/__tests__/bulk-optimization-prefetch-fields-by-post-id.test.ts"],
  ["src/hooks/content-optimization/__tests__/bulk-optimization-grep-acf.test.ts", "src/hooks/content-optimization/__tests__/bulk-optimization-grep-fields.test.ts"],
];

const REPLACEMENTS = [
  ["REMOVED_acf_native", ""],
  ["REMOVED_acfRestObjectPresent", ""],
  ["| \"REMOVED_emcp\"", ""],
  ['"REMOVED_emcp"', ""],
  ["REMOVED_neo-emcp", "neo-emcp-legacy"],
  ['"REMOVED_emcp", label: "REMOVED Engine"', ""],
  ['emcp: "REMOVED"', ""],
  ["getACFFieldsForUrl", "getPostFieldsForUrl"],
  ["getSeoResearchFromAcf", "getSeoResearchFromPostFields"],
  ["acfOriginAppliesForSitemapType", "postFieldsOriginAppliesForSitemapType"],
  ["acfOriginAppliesForRow", "postFieldsOriginAppliesForRow"],
  ["@/lib/acf-origin-applies", "@/lib/post-fields-origin-applies"],
  ["overview-acf-meta-line", "overview-post-fields-meta-line"],
  ["acfMetaDescriptionLine", "postFieldsMetaDescriptionLine"],
  ['fieldsBackend: \'REMOVED_acf_native\' | \'neo_pulse_fields\' | \'none\'', "fieldsBackend: 'neo_pulse_fields' | 'none'"],
  ["if (cap.fieldsBackend === \"REMOVED_acf_native\") return \"ACF Pro\";", ""],
  ["getACFFromOpenRouter", "getPostFieldsFromOpenRouter"],
  ["fullPostForAcf", "fullPostForFields"],
  ["prefetchedAcfFieldsCache", "prefetchedPostFieldsCache"],
  ["acfRow", "postFieldsRow"],
  ["acfBrief", "postFieldsBrief"],
  ["acfSeoResearch", "postFieldsSeoResearch"],
  ["@/lib/content-generation/ai-driven-acf-reader", "@/lib/content-generation/ai-driven-post-fields-reader"],
  ["sitemap-optimizer-rankmath-import", "sitemap-optimizer-redirect-csv-import"],
  ["redirectcsv:", "redirect-csv:"],
  ["describe(\"acfOriginAppliesForSitemapType\"", "describe(\"postFieldsOriginAppliesForSitemapType\""],
  ["describe(\"getSeoResearchFromAcf\"", "describe(\"getSeoResearchFromPostFields\""],
];

function walk(dir, out = []) {
  const abs = path.join(root, dir);
  if (!fs.existsSync(abs)) return out;
  for (const name of fs.readdirSync(abs)) {
    if (name === "node_modules" || name === "vendor" || name === "dist") continue;
    const p = path.join(abs, name);
    if (fs.statSync(p).isDirectory()) walk(path.relative(root, p), out);
    else if (/\.(ts|tsx|js|mjs|php|json)$/.test(name)) out.push(p);
  }
  return out;
}

for (const [from, to] of RENAMES) {
  const a = path.join(root, from);
  const b = path.join(root, to);
  if (!fs.existsSync(a)) continue;
  fs.mkdirSync(path.dirname(b), { recursive: true });
  fs.renameSync(a, b);
}

const files = [...walk("src"), ...walk("wordpress-plugins/neo-pulse-app"), ...walk("wordpress-plugins/neo-pulse-wp")];
for (const file of files) {
  let text = fs.readFileSync(file, "utf8");
  let next = text;
  for (const [from, to] of REPLACEMENTS) {
    if (!from) continue;
    next = next.split(from).join(to);
  }
  if (next !== text) fs.writeFileSync(file, next);
}

console.log("purge-wp-acf-pass2 done");
