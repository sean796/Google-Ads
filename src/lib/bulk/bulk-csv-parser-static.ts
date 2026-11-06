import Papa from 'papaparse';
import type { CSVRow } from './bulk-csv-parser-rows';

/**
 * Parse a list string (comma or newline-separated) into an array
 */
function normalizeHeaderKey(key: string): string {
  return key.trim().toLowerCase().replace(/\s+/g, "");
}

/** First matching non-empty cell for any normalized header alias (Papa header keys vary). */
function pickStringFieldFromRow(row: Record<string, unknown>, normKeys: string[]): string {
  for (const key of Object.keys(row)) {
    const norm = normalizeHeaderKey(key);
    if (!normKeys.includes(norm)) continue;
    const v = row[key];
    if (v == null) continue;
    const s = String(v).trim();
    if (s) return s;
  }
  return "";
}

/** First non-empty bulk publish-date cell from known CSV header aliases (Papa header keys vary). */
function pickPublishDateGmtFromRow(row: Record<string, unknown>): string | undefined {
  for (const key of Object.keys(row)) {
    const norm = key.trim().toLowerCase().replace(/\s+/g, "");
    if (
      norm === "publish_date_gmt" ||
      norm === "publishdategmt" ||
      norm === "scheduled_publish" ||
      norm === "scheduledpublish" ||
      norm === "wp_publish_date" ||
      norm === "wppublishdate"
    ) {
      const v = row[key];
      if (v == null) continue;
      const s = String(v).trim();
      if (s) return s;
    }
  }
  return undefined;
}


function pickSitemapTypeFromRow(row: Record<string, unknown>): "post" | "entity" | undefined {
  const raw = pickStringFieldFromRow(row, ["sitemap_type", "sitemaptype", "sitemap"]);
  const norm = raw.trim().toLowerCase();
  if (norm === "entity") return "entity";
  if (norm === "post") return "post";
  return undefined;
}

function csvRowHasAnyField(row: CSVRow): boolean {
  return Boolean(
    row.keyword?.trim() ||
      row.title?.trim() ||
      row.entity?.trim() ||
      row.meta_description?.trim() ||
      row.modifier?.trim() ||
      row.featuredImage?.trim() ||
      row.wikipedia_url?.trim() ||
      row.wikipedia_title?.trim() ||
      row.target_slug?.trim() ||
      row.publish_date_gmt?.trim() ||
      row.sitemap_type,
  );
}

function papaRecordToCsvRow(record: Record<string, unknown>): CSVRow | null {
  const keyword = pickStringFieldFromRow(record, [
    "keyword",
    "keywordfocus",
    "keyword_focus",
    "focuskeyword",
    "focus_keyword",
  ]);
  const title = pickStringFieldFromRow(record, ["title"]);
  const entity = pickStringFieldFromRow(record, ["entity", "location", "servicearea", "service_area"]);
  const meta_description = pickStringFieldFromRow(record, [
    "meta_description",
    "metadescription",
    "meta",
    "description",
  ]);
  const modifier = pickStringFieldFromRow(record, ["modifier", "promptmodifier", "prompt_modifier"]);
  const featuredImage = pickStringFieldFromRow(record, ["featuredimage", "featured_image", "image"]);
  let target_slug = pickStringFieldFromRow(record, ["target_slug", "targetslug", "slug"]);
  const urlCell = pickStringFieldFromRow(record, ["url", "destination_url", "destinationurl"]);
  if (!target_slug && urlCell) {
    target_slug = urlCell.replace(/^https?:\/\/[^/]+/i, "").replace(/^\//, "").replace(/\/$/, "");
  }
  const wikipedia_url = pickStringFieldFromRow(record, ["wikipedia_url", "wikipediaurl", "wiki_url"]);
  const wikipedia_title = pickStringFieldFromRow(record, ["wikipedia_title", "wikipediatitle", "wiki_title"]);
  const publish_date_gmt = pickPublishDateGmtFromRow(record);
  const sitemap_type = pickSitemapTypeFromRow(record);

  const row: CSVRow = {
    keyword: keyword || "",
    title: title || "",
  };
  if (entity) row.entity = entity;
  if (meta_description) row.meta_description = meta_description;
  if (modifier) row.modifier = modifier;
  if (featuredImage) row.featuredImage = featuredImage;
  if (target_slug) row.target_slug = target_slug;
  if (wikipedia_url) row.wikipedia_url = wikipedia_url;
  if (wikipedia_title) row.wikipedia_title = wikipedia_title;
  if (publish_date_gmt) row.publish_date_gmt = publish_date_gmt;
  if (sitemap_type) row.sitemap_type = sitemap_type;

  return csvRowHasAnyField(row) ? row : null;
}

/** Sync Papa parse: map CSV headers to bulk rows (no OpenRouter). */
export function parseCsvStaticText(csvText: string): CSVRow[] {
  if (!csvText.trim()) return [];
  const parsed = Papa.parse<Record<string, unknown>>(csvText, {
    header: true,
    skipEmptyLines: true,
  });
  const rows: CSVRow[] = [];
  for (const record of parsed.data) {
    if (!record || typeof record !== "object") continue;
    const row = papaRecordToCsvRow(record);
    if (row) rows.push(row);
  }
  return rows;
}

/** Papa static load from file (instant; no OpenRouter). */
export async function parseCsvStatic(file: File): Promise<CSVRow[]> {
  const csvText = await file.text();
  return parseCsvStaticText(csvText);
}
