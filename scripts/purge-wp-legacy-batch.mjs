#!/usr/bin/env node
/**
 * One-shot mechanical purge: routes, filenames, common identifiers.
 * Run once during ACF/EMCP/NEO Pulse redirect removal.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const RENAME_MAP = [
  ["src/lib/wordpress-api/post-fields-discovery-types.ts", "src/lib/wordpress-api/post-fields-discovery-types.ts"],
  ["src/lib/wordpress-api/post-fields-discovery-url-batch.ts", "src/lib/wordpress-api/post-fields-discovery-url-batch.ts"],
  ["src/lib/wordpress-api/post-fields-discovery.ts", "src/lib/wordpress-api/post-fields-discovery.ts"],
  ["src/lib/wordpress-post-fields-origin.ts", "src/lib/wordpress-post-fields-origin.ts"],
  ["src/lib/content-generation/wordpress-uploader-fields-writer.ts", "src/lib/content-generation/wordpress-uploader-fields-writer.ts"],
  ["src/lib/content-generation/apply-meta-optimizer-to-fields.ts", "src/lib/content-generation/apply-meta-optimizer-to-fields.ts"],
  ["src/lib/content-generation/ai-driven-post-fields-reader.ts", "src/lib/content-generation/ai-driven-post-fields-reader.ts"],
  ["src/lib/content-generation/post-fields-origin-updater.ts", "src/lib/content-generation/post-fields-origin-updater.ts"],
  ["src/lib/content-generation/post-field-mapper.ts", "src/lib/content-generation/post-field-mapper.ts"],
  ["src/lib/content-generation/bulk-post-fields-seo-bundle.ts", "src/lib/content-generation/bulk-post-fields-seo-bundle.ts"],
  ["src/lib/content-generation/apply-meta-fields-payload.ts", "src/lib/content-generation/apply-meta-fields-payload.ts"],
  ["src/lib/bulk/bulk-wordpress-publish-fields-sync.ts", "src/lib/bulk/bulk-wordpress-publish-fields-sync.ts"],
  ["src/lib/bulk/bulk-row-post-fields-meta.ts", "src/lib/bulk/bulk-row-post-fields-meta.ts"],
  ["src/lib/post-fields-competitor-applies.ts", "src/lib/post-fields-competitor-applies.ts"],
  ["src/hooks/content-optimization/bulk-optimization-prefetch-fields-by-post-id.ts", "src/hooks/content-optimization/bulk-optimization-prefetch-fields-by-post-id.ts"],
  ["src/hooks/content-optimization/bulk-optimization-grep-fields.ts", "src/hooks/content-optimization/bulk-optimization-grep-fields.ts"],
  ["src/hooks/research/use-sitemap-optimizer-redirectcsv-import.ts", "src/hooks/research/use-sitemap-optimizer-redirect-csv-import.ts"],
  ["src/lib/sitemap-optimizer/sitemap-optimizer-redirectcsv-import.ts", "src/lib/sitemap-optimizer/sitemap-optimizer-redirect-csv-import.ts"],
  ["src/lib/sitemap-optimizer/parse-grid-pulse-redirect-export-csv.ts", "src/lib/sitemap-optimizer/parse-grid-redirect-export-csv.ts"],
  ["src/lib/sitemap-optimizer/build-grid-pulse-redirect-redirects.ts", "src/lib/sitemap-optimizer/build-grid-pulse-redirects.ts"],
  ["src/lib/sitemap-optimizer/build-content-sheet-pulse-redirect.ts", "src/lib/sitemap-optimizer/build-content-sheet-pulse-redirects.ts"],
  ["src/lib/pulse-redirect-redirect-csv.ts", "src/lib/pulse-redirect-csv.ts"],
  ["src/lib/content-generation/pulse-redirect-exact-keyword.ts", "src/lib/content-generation/pulse-seo-exact-keyword.ts"],
  ["src/components/research/sitemap-optimizer/SitemapOptimizerGridRedirectCsvGrid.tsx", "src/components/research/sitemap-optimizer/SitemapOptimizerGridRedirectCsvGrid.tsx"],
  ["wordpress-plugins/neo-pulse-app/includes/wordpress/class-wp-post-fields.php", "wordpress-plugins/neo-pulse-app/includes/wordpress/class-wp-post-fields.php"],
  ["wordpress-plugins/neo-pulse-app/includes/wordpress/class-wp-post-fields-by-url.php", "wordpress-plugins/neo-pulse-app/includes/wordpress/class-wp-post-fields-by-url.php"],
  ["wordpress-plugins/neo-pulse-app/includes/wordpress/class-wp-post-field-keys-discovery.php", "wordpress-plugins/neo-pulse-app/includes/wordpress/class-wp-post-field-keys-discovery.php"],
];

const TEXT_REPLACEMENTS = [
  ["discover-post-field-keys", "discover-post-field-keys"],
  ["get-post-fields-by-url-batch", "get-post-fields-by-url-batch"],
  ["get-post-fields-by-url", "get-post-fields-by-url"],
  ["get-post-fields-batch", "get-post-fields-batch"],
  ["get-post-fields", "get-post-fields"],
  ["update-post-fields", "update-post-fields"],
  ["update-post-field", "update-post-field"],
  ["REMOVED_NEO_PULSE_WP_TOOLS_LIST", "REMOVED_NEO_PULSE_WP_TOOLS_LIST"],
  ["REMOVED_NEO_PULSE_WP_TOOL", "REMOVED_NEO_PULSE_WP_TOOL"],
  ["PostFieldsDiscoveryResult", "PostFieldsDiscoveryResult"],
  ["discoverPostFieldKeys", "discoverPostFieldKeys"],
  ["getPostFieldsForPostsBatch", "getPostFieldsForPostsBatch"],
  ["getPostFieldsForUrlsBatch", "getPostFieldsForUrlsBatch"],
  ["getPostFieldsForPost", "getPostFieldsForPost"],
  ["updateWordPressPostFields", "updateWordPressPostFields"],
  ["siteSupportsSeoExtraTextField", "siteSupportsSeoExtraTextField"],
  ["fieldNameMapFromDiscovery", "fieldNameMapFromDiscovery"],
  ["resolvePostFieldsForMapping", "resolvePostFieldsForMapping"],
  ["restPostFieldsFromFullPost", "restPostFieldsFromFullPost"],
  ["WpPostSnapshotFromFieldsByUrl", "WpPostSnapshotFromFieldsByUrl"],
  ["includeRawPostFields", "includeRawPostFields"],
  ["includePostFields", "includePostFields"],
  ["REMOVED_acf_native", "REMOVED_REMOVED_acf_native"],
  ["REMOVED_acfRestObjectPresent", "REMOVED_REMOVED_acfRestObjectPresent"],
  ["NEO Pulse redirect", "NEO Pulse redirect"],
  ["redirectcsv", "redirectcsv"],
  ["neo_pulse_seo", "neo_pulse_seo"],
  ["RedirectCsv", "RedirectCsv"],
  ["pulse-redirect", "pulse-redirect"],
  ["neo_pulse_seo_", "neo_pulse_seo_"],
  ["/post-fields-discovery", "/post-fields-discovery"],
  ["/post-fields-discovery-types", "/post-fields-discovery-types"],
  ["/post-fields-discovery-url-batch", "/post-fields-discovery-url-batch"],
  ["wordpress-uploader-fields-writer", "wordpress-uploader-fields-writer"],
  ["apply-meta-optimizer-to-fields", "apply-meta-optimizer-to-fields"],
  ["ai-driven-post-fields-reader", "ai-driven-post-fields-reader"],
  ["post-fields-origin-updater", "post-fields-origin-updater"],
  ["post-field-mapper", "post-field-mapper"],
  ["bulk-post-fields-seo-bundle", "bulk-post-fields-seo-bundle"],
  ["apply-meta-fields-payload", "apply-meta-fields-payload"],
  ["bulk-wordpress-publish-fields-sync", "bulk-wordpress-publish-fields-sync"],
  ["bulk-row-post-fields-meta", "bulk-row-post-fields-meta"],
  ["post-fields-competitor-applies", "post-fields-competitor-applies"],
  ["wordpress-post-fields-origin", "wordpress-post-fields-origin"],
  ["bulk-optimization-prefetch-fields-by-post-id", "bulk-optimization-prefetch-fields-by-post-id"],
  ["bulk-optimization-grep-fields", "bulk-optimization-grep-fields"],
  ["use-sitemap-optimizer-redirectcsv-import", "use-sitemap-optimizer-redirect-csv-import"],
  ["sitemap-optimizer-redirectcsv-import", "sitemap-optimizer-redirect-csv-import"],
  ["parse-grid-pulse-redirect-export-csv", "parse-grid-redirect-export-csv"],
  ["build-grid-pulse-redirect-redirects", "build-grid-pulse-redirects"],
  ["build-content-sheet-pulse-redirect", "build-content-sheet-pulse-redirects"],
  ["pulse-redirect-redirect-csv", "pulse-redirect-csv"],
  ["pulse-redirect-exact-keyword", "pulse-seo-exact-keyword"],
  ["SitemapOptimizerGridRedirectCsvGrid", "SitemapOptimizerGridRedirectCsvGrid"],
  ["importRedirectCsvPlan", "importRedirectCsvPlan"],
  ["parseRedirectCsvRedirectCsv", "parsePulseRedirectCsv"],
  ["assembleRedirectCsvRunResult", "assembleRedirectCsvRunResult"],
  ["Neo_Pulse_App_Wp_Post_Fields", "Neo_Pulse_App_Wp_Post_Fields"],
  ["Neo_Pulse_App_Wp_Post_Fields_By_Url", "Neo_Pulse_App_Wp_Post_Fields_By_Url"],
  ["Neo_Pulse_App_Wp_Post_Field_Keys_Discovery", "Neo_Pulse_App_Wp_Post_Field_Keys_Discovery"],
  ["class-wp-post-fields", "class-wp-post-fields"],
  ["class-wp-post-fields-by-url", "class-wp-post-fields-by-url"],
  ["class-wp-post-field-keys-discovery", "class-wp-post-field-keys-discovery"],
  ["get_post_fields_by_url_batch", "get_post_fields_by_url_batch"],
  ["get_post_fields_by_url", "get_post_fields_by_url"],
  ["discover_post_field_keys", "discover_post_field_keys"],
  ["get_post_fields_batch", "get_post_fields_batch"],
  ["get_post_fields", "get_post_fields"],
  ["update_post_fields", "update_post_fields"],
  ["update_post_field", "update_post_field"],
  ["fetch_post_fields_for_post_id", "fetch_post_fields_for_post_id"],
  ["validate_post_fields_setup", "validate_post_fields_setup"],
  ["serialize_post_field_value", "serialize_post_field_value"],
  ["rest_post_fields_from_post", "rest_post_fields_from_post"],
  ["direct_post_fields_from_client", "direct_post_fields_from_client"],
  ["has_post_fields_payload", "has_post_fields_payload"],
  ["write_post_field_or_meta", "write_post_field_or_meta"],
  ["read_post_field_or_meta", "read_post_field_or_meta"],
  ['"REMOVED_emcp"', '"REMOVED_emcp"'],
  ["| \"emcp\"", "| \"REMOVED_emcp\""],
  ["REMOVED_neo-emcp", "REMOVED_REMOVED_neo-emcp"],
  ["REMOVED", "REMOVED"],
];

const WALK_DIRS = ["src", "wordpress-plugins/neo-pulse-app", "wordpress-plugins/neo-pulse-wp", "scripts", "docs/api"];

const SKIP_DIR = new Set(["node_modules", "vendor", ".deploy", "dist", "dist-storybook"]);

function walkFiles(dir, out = []) {
  const abs = path.join(root, dir);
  if (!fs.existsSync(abs)) return out;
  for (const name of fs.readdirSync(abs)) {
    if (SKIP_DIR.has(name)) continue;
    const p = path.join(abs, name);
    const st = fs.statSync(p);
    if (st.isDirectory()) walkFiles(path.relative(root, p), out);
    else if (/\.(ts|tsx|js|mjs|cjs|php|json|md|tsx)$/.test(name)) out.push(p);
  }
  return out;
}

for (const [from, to] of RENAME_MAP) {
  const a = path.join(root, from);
  const b = path.join(root, to);
  if (!fs.existsSync(a)) continue;
  fs.mkdirSync(path.dirname(b), { recursive: true });
  fs.renameSync(a, b);
  console.log("renamed", from, "->", to);
}

const files = WALK_DIRS.flatMap((d) => walkFiles(d));
for (const file of files) {
  let text = fs.readFileSync(file, "utf8");
  let next = text;
  for (const [from, to] of TEXT_REPLACEMENTS) {
    next = next.split(from).join(to);
  }
  if (next !== text) {
    fs.writeFileSync(file, next);
  }
}

console.log("purge-wp-legacy-batch: done");
