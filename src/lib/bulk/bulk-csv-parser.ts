import Papa from 'papaparse';
import { isConnectedSiteBrandAsKeyword } from '@/lib/bulk/bulk-gsc-site-queries';
import {
  collectImportedDraftLinksFromSource,
  importedDraftLinkUrls,
  normalizeImportedDraftUrl,
} from '@/lib/bulk/blog-import-draft-links';
import { callOpenRouterChatCompletion } from '@/lib/competitor-research/competitor-report-openrouter';
import { isBlockedContentTopicPhrase } from '@/lib/content-topic-blocklist';
import { parseJsonStrict } from '@/lib/json-repair-utility';
import { getResearchModel } from '@/lib/optimization-settings-storage';
import { parseTitleTemplate } from '../title-template-parser';

/**
 * CSV Row interface
 */
export interface CSVRow {
  keyword: string;
  entity?: string;
  title: string;
  /** SEO meta description (150–160 chars), proposed by AI at idea stage. */
  meta_description?: string;
  modifier?: string;
  featuredImage?: string;
  /** Pre-resolved English Wikipedia article URL (e.g. Local analysis wiki column). */
  wikipedia_url?: string;
  /** English Wikipedia article title for API calls (may differ from `entity` text). */
  wikipedia_title?: string;
  /** When a prompt modifier is used, AI explains why this idea matches it. */
  rationale?: string;
  /** Previous-agent / CSV research brief for this row. */
  seo_research?: string;
  // ACF fields
  date_modifier?: string;
  prompt_modifier?: string;
  keyword_focus?: string;
  service_area_fields?: string;
  competitor_fields?: string;
  origin?: string;
  competitor?: string;
  faq?: string;
  /** JSON array of verbatim question strings (Local Analysis → research model); drives bulk H2 outline when set. */
  keyword_questions_json?: string;
  /** JSON array of `{ "h2": "...", "body": "..." }` from blog import; drives verbatim imported H2 outline. */
  imported_sections_json?: string;
  /** HTML/markdown before first H2 from blog import (H1 + intro). */
  imported_preamble_html?: string;
  /** JSON array of `{ "url", "anchorText", "h2?" }` from blog import; mandatory in checklist/blueprint. */
  imported_links_json?: string;
  /** JSON array of `{ "url" }` from Prompt row Links editor; mandatory external citations. */
  modifier_links_json?: string;
  /** JSON `ImportedBlogToneProfile` from blog-import tone analysis (voice / sophistication for harness). */
  imported_tone_json?: string;
  /** Full imported HTML (Direct publish / multi-file Import). */
  imported_html?: string;
  /** Full imported markdown (Direct publish / multi-file Import). */
  imported_markdown?: string;
  /** Original upload filename for an Import row. */
  import_file_name?: string;
  /** Per-row export destination; Import header is the default when unset. */
  post_destination?: "wordpress" | "local" | "direct";
  /**
   * Optional WordPress publish/schedule instant (CSV cell). ISO 8601 UTC preferred, or `YYYY-MM-DD` with bulk Start Time (UTC).
   * Distinct from `date_modifier` (ACF copy).
   */
  publish_date_gmt?: string;
  /** Locked post slug segment (Sitemap merge approve); skips AI slug generation when set. */
  target_slug?: string;
  /** Full canonical URL for Rank Math (Sitemap merge approve). */
  destination_url?: string;
  /** Peer exemplar URL (vertical benchmark CSV); not sent to WordPress on publish. */
  source_exemplar_url?: string;
  /** Per-row WordPress destination when site sitemap mode is Custom. */
  sitemap_type?: "post" | "entity";
  /** Entity ad group key (Generator list grouping). */
  entity_group_id?: string;
  /** Main city or parent area for MapPin header when row `entity` is a sub-neighbourhood. */
  ad_group_label?: string;
  /** First row in an entity ad group vs additional keywords. */
  entity_group_role?: "seed" | "member";
}

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

export type ImportedSectionRow = { h2: string; body: string };

/** Parse `imported_sections_json` from blog import (JSON array of { h2, body }). */
export function parseImportedSectionsJson(raw: string | undefined | null): ImportedSectionRow[] | null {
  if (raw == null || typeof raw !== "string") return null;
  const t = raw.trim();
  if (!t) return null;
  try {
    const parsed = JSON.parse(t) as unknown;
    if (!Array.isArray(parsed)) return null;
    const out: ImportedSectionRow[] = [];
    for (const item of parsed) {
      if (item && typeof item === "object" && "h2" in item) {
        const h2 = String((item as { h2: unknown }).h2).trim();
        const body =
          "body" in item && (item as { body: unknown }).body != null
            ? String((item as { body: unknown }).body).trim()
            : "";
        if (h2) out.push({ h2, body });
      }
    }
    return out.length ? out : null;
  } catch {
    return null;
  }
}

/** Parse `imported_links_json` from blog import. */
export function parseImportedLinksJson(
  raw: string | undefined | null,
): Array<{ url: string; anchorText: string; h2?: string }> | null {
  if (raw == null || typeof raw !== "string") return null;
  const t = raw.trim();
  if (!t) return null;
  try {
    const parsed = JSON.parse(t) as unknown;
    if (!Array.isArray(parsed)) return null;
    const out: Array<{ url: string; anchorText: string; h2?: string }> = [];
    for (const item of parsed) {
      if (!item || typeof item !== "object") continue;
      const url = "url" in item ? String((item as { url: unknown }).url).trim() : "";
      const anchorText =
        "anchorText" in item ? String((item as { anchorText: unknown }).anchorText).trim() : "";
      if (!url || !anchorText) continue;
      const h2 =
        "h2" in item && (item as { h2: unknown }).h2 != null
          ? String((item as { h2: unknown }).h2).trim()
          : undefined;
      out.push(h2 ? { url, anchorText, h2 } : { url, anchorText });
    }
    return out.length ? out : null;
  } catch {
    return null;
  }
}

export type ModifierLinkRow = { url: string };

/** Parse `modifier_links_json` from Prompt row Links editor. */
export function parseModifierLinksJson(raw: string | undefined | null): ModifierLinkRow[] | null {
  if (raw == null || typeof raw !== "string") return null;
  const t = raw.trim();
  if (!t) return null;
  try {
    const parsed = JSON.parse(t) as unknown;
    if (!Array.isArray(parsed)) return null;
    const seen = new Set<string>();
    const out: ModifierLinkRow[] = [];
    for (const item of parsed) {
      let candidate = "";
      if (typeof item === "string") {
        candidate = item.trim();
      } else if (item && typeof item === "object" && "url" in item) {
        candidate = String((item as { url: unknown }).url).trim();
      }
      const url = normalizeImportedDraftUrl(candidate);
      if (!url) continue;
      const key = url.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ url });
    }
    return out.length ? out : null;
  } catch {
    return null;
  }
}

/** URL strings for Links editor UI (preserves in-progress empty rows). */
export function modifierLinksFromJson(raw: string | undefined | null): string[] {
  if (raw == null || typeof raw !== "string") return [""];
  const t = raw.trim();
  if (!t) return [""];
  try {
    const parsed = JSON.parse(t) as unknown;
    if (!Array.isArray(parsed)) return [""];
    const rows = parsed.map((item) => {
      if (typeof item === "string") return item;
      if (item && typeof item === "object" && "url" in item) {
        return String((item as { url: unknown }).url);
      }
      return "";
    });
    return rows.length > 0 ? rows : [""];
  } catch {
    return [""];
  }
}

/** Links editor URLs for an import row: stored Links first, else hrefs parsed from that piece's content. */
export function importRowLinkEditorUrls(
  row: Pick<CSVRow, "modifier_links_json" | "imported_links_json" | "imported_markdown" | "imported_html">,
): string[] {
  if (parseModifierLinksJson(row.modifier_links_json)?.length) {
    return modifierLinksFromJson(row.modifier_links_json);
  }
  const fromImported = parseImportedLinksJson(row.imported_links_json);
  if (fromImported?.length) return importedDraftLinkUrls(fromImported);
  const fromSource = importedDraftLinkUrls(
    collectImportedDraftLinksFromSource({
      markdown: row.imported_markdown,
      html: row.imported_html,
    }),
  );
  return fromSource.length > 0 ? fromSource : [""];
}

/** Persist link editor rows; empty strings kept for draft slots. Pipeline reads via parseModifierLinksJson. */
export function serializeModifierLinksJson(urls: string[]): string | undefined {
  if (urls.length === 0) return undefined;
  const hasValidUrl = urls.some((u) => normalizeImportedDraftUrl(u.trim()));
  if (!hasValidUrl && urls.every((u) => !u.trim())) return undefined;
  return JSON.stringify(urls);
}

/** Parse `keyword_questions_json` column from Local Analysis CSV (JSON array of strings). */
export function parseKeywordQuestionsJson(raw: string | undefined | null): string[] | null {
  if (raw == null || typeof raw !== "string") return null;
  const t = raw.trim();
  if (!t) return null;
  try {
    const parsed = JSON.parse(t) as unknown;
    if (!Array.isArray(parsed)) return null;
    const out = parsed.map((x) => String(x).trim()).filter(Boolean);
    return out.length ? out : null;
  } catch {
    return null;
  }
}

function parseListString(list: string): string[] {
  if (!list || !list.trim()) return [];
  return list
    .split(/[,\n]/)
    .map(item => item.trim())
    .filter(item => item.length > 0);
}

/** Strip a single leading ```…``` wrapper if the model wrapped the checklist. */
function stripOuterMarkdownFence(text: string): string {
  const t = text.trim();
  if (!t.startsWith('```')) return text;
  const afterOpen = t.indexOf('\n');
  const body = afterOpen >= 0 ? t.slice(afterOpen + 1) : t.replace(/^```[a-zA-Z0-9_-]*\s*/, '');
  const close = body.lastIndexOf('```');
  if (close < 0) return body.trim();
  return body.slice(0, close).trim();
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Curly quotes and bold **Label:** wrappers break strict `Keyword: "…"` regexes. */
function normalizeMachineChecklistLine(line: string): string {
  let s = line
    .replace(/\u201c/g, '"')
    .replace(/\u201d/g, '"')
    .replace(/\u201e/g, '"')
    .replace(/\u201f/g, '"');
  const labels = [
    'Keyword',
    'Entity',
    'Title',
    'MetaDescription',
    'Modifier',
    'FeaturedImage',
    'DateModifier',
    'PromptModifier',
    'KeywordFocus',
    'ServiceAreaFields',
    'Origin',
    'FAQ',
    'Rationale',
  ];
  for (const label of labels) {
    const esc = escapeRegExp(label);
    s = s.replace(new RegExp(`\\*\\*(${esc}):\\*\\*`, 'gi'), '$1:');
    s = s.replace(new RegExp(`\\*\\*(${esc})\\*\\*:`, 'gi'), '$1:');
  }
  return s;
}

/**
 * Normalize one checklist line so `^\d+[\.\)]\s+` matches after common model formatting
 * (indented lists, - 1., **1.**, etc.).
 */
function normalizeChecklistLine(raw: string): string {
  let s = raw.trim();
  s = s.replace(/^[-*]\s+/, '');
  s = s.replace(/^[*]*(\d+)[*]*[.)]\s*/, '$1. ');
  return s;
}

/** Split checklist into numbered item blocks (supports one field per line after the number). */
function splitNumberedChecklistBlocks(checklistContent: string): string[] {
  const normalizedBlock = stripOuterMarkdownFence(checklistContent);
  const lines = normalizedBlock.split(/\r?\n/);
  const blocks: string[] = [];
  let current: string[] = [];

  for (const rawLine of lines) {
    const line = normalizeChecklistLine(normalizeMachineChecklistLine(rawLine));
    if (!line.trim()) continue;

    if (line.match(/^\d+[.)]\s+/)) {
      if (current.length > 0) {
        blocks.push(current.join('\n'));
      }
      current = [line.replace(/^\d+[.)]\s+/, '').trim()];
    } else if (current.length > 0) {
      current.push(line.trim());
    }
  }

  if (current.length > 0) {
    blocks.push(current.join('\n'));
  }

  return blocks;
}

function parseChecklistItemContent(content: string): CSVRow | null {
  const keywordMatch = content.match(/Keyword:\s*"([^"]+)"/i);
  const entityMatch = content.match(/Entity:\s*"([^"]+)"/i);
  const titleMatch = content.match(/Title:\s*"([^"]+)"/i);
  const metaDescriptionMatch = content.match(/MetaDescription:\s*"([^"]+)"/i);
  const modifierMatch = content.match(/Modifier:\s*"([^"]*)"/i);
  const featuredImageMatch = content.match(/FeaturedImage:\s*"([^"]+)"|FeaturedImage:\s*([yn])/i);
  const dateModifierMatch = content.match(/DateModifier:\s*"([^"]+)"/i);
  const promptModifierMatch = content.match(/PromptModifier:\s*"([^"]+)"/i);
  const keywordFocusMatch = content.match(/KeywordFocus:\s*"([^"]+)"/i);
  const serviceAreaFieldsMatch = content.match(/ServiceAreaFields:\s*"([^"]+)"/i);
  const originMatch = content.match(/Origin:\s*"([^"]+)"/i);
  const faqMatch = content.match(/FAQ:\s*"([^"]+)"/i);
  const rationaleMatch = content.match(/Rationale:\s*"([^"]+)"/i);

  if (keywordMatch && titleMatch) {
    const row: CSVRow = {
      keyword: keywordMatch[1].trim(),
      title: titleMatch[1].trim(),
    };

    if (entityMatch && entityMatch[1].trim().length > 0) {
      row.entity = entityMatch[1].trim();
    }

    if (metaDescriptionMatch && metaDescriptionMatch[1].trim().length > 0) {
      row.meta_description = metaDescriptionMatch[1].trim();
    }

    if (modifierMatch) {
      row.modifier = modifierMatch[1].trim();
    }

    if (featuredImageMatch) {
      const value = (featuredImageMatch[1] || featuredImageMatch[2] || '').toLowerCase();
      if (value === 'y' || value === 'yes') {
        row.featuredImage = 'y';
      } else if (value === 'google-maps' || value === 'googlemaps' || value === 'google_maps') {
        row.featuredImage = 'google-maps';
      } else {
        row.featuredImage = 'n';
      }
    }

    if (dateModifierMatch && dateModifierMatch[1].trim().length > 0) {
      row.date_modifier = dateModifierMatch[1].trim();
    }

    if (promptModifierMatch && promptModifierMatch[1].trim().length > 0) {
      row.prompt_modifier = promptModifierMatch[1].trim();
    }

    if (keywordFocusMatch && keywordFocusMatch[1].trim().length > 0) {
      row.keyword_focus = keywordFocusMatch[1].trim();
    }

    if (serviceAreaFieldsMatch && serviceAreaFieldsMatch[1].trim().length > 0) {
      row.service_area_fields = serviceAreaFieldsMatch[1].trim();
    }

    if (originMatch && originMatch[1].trim().length > 0) {
      row.origin = originMatch[1].trim();
    }

    if (faqMatch && faqMatch[1].trim().length > 0) {
      row.faq = faqMatch[1].trim();
    }

    if (rationaleMatch && rationaleMatch[1].trim().length > 0) {
      row.rationale = rationaleMatch[1].trim();
    }

    return row;
  }

  const quotedStrings = content.match(/"([^"]+)"/g);
  if (quotedStrings && quotedStrings.length >= 2) {
    const row: CSVRow = {
      keyword: quotedStrings[0].replace(/"/g, '').trim(),
      title:
        quotedStrings.length >= 3
          ? quotedStrings[2].replace(/"/g, '').trim()
          : quotedStrings[1].replace(/"/g, '').trim(),
    };

    if (quotedStrings.length >= 3 && quotedStrings[1].replace(/"/g, '').trim().length > 0) {
      row.entity = quotedStrings[1].replace(/"/g, '').trim();
    }

    if (quotedStrings.length >= 4) {
      row.modifier = quotedStrings[3].replace(/"/g, '').trim();
    }

    return row;
  }

  return null;
}

/**
 * Parse AI-generated checklist into CSVRow[] format
 * @param checklistContent - The AI-generated checklist content
 * @param titleTemplate - Optional title template with variables like [Entity], [Keyword]
 * @param entityList - Optional comma/newline-separated list of entity values
 * @param keywordList - Optional comma/newline-separated list of keyword values
 * @param locationList - Optional comma/newline-separated list of location values
 * @param numberList - Optional comma/newline-separated list of number values
 */
export function parseBlogIdeasChecklist(
  checklistContent: string, 
  titleTemplate?: string,
  entityList?: string,
  keywordList?: string,
  locationList?: string,
  numberList?: string,
  companyName?: string | null,
): CSVRow[] {
  const rows: CSVRow[] = [];
  const blocks = splitNumberedChecklistBlocks(checklistContent);

  for (const block of blocks) {
    const content = normalizeMachineChecklistLine(
      block
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
        .join(', '),
    );

    const row = parseChecklistItemContent(content);
    if (
      row &&
      !isBlockedContentTopicPhrase(row.keyword, row.title) &&
      !isConnectedSiteBrandAsKeyword(row.keyword, companyName)
    ) {
      rows.push(row);
    }
  }
  
  // Apply title template if provided
  if (titleTemplate && titleTemplate.trim()) {
    // Parse variable lists
    const entityValues = parseListString(entityList || '');
    const keywordValues = parseListString(keywordList || '');
    const locationValues = parseListString(locationList || '');
    const numberValues = parseListString(numberList || '');
    
    rows.forEach((row, index) => {
      // Get value from list (use index, or last value if list is shorter, or fallback to row value)
      const getListValue = (list: string[], fallback: string): string => {
        if (list.length > 0) {
          // Use index if available, otherwise use last value (repeats for remaining rows)
          return list[Math.min(index, list.length - 1)] || fallback;
        }
        return fallback;
      };
      
      const variables: Record<string, string> = {
        Keyword: getListValue(keywordValues, row.keyword || ''),
        Entity: getListValue(entityValues, row.entity || ''),
        Location: getListValue(locationValues, ''),
        Number: getListValue(numberValues, String(index + 1)),
      };
      
      // ALWAYS apply template - override AI-generated title
      const generatedTitle = parseTitleTemplate(titleTemplate, variables);
      if (generatedTitle && generatedTitle.trim()) {
        // Override the AI-generated title with template-generated title
        row.title = generatedTitle.trim();
        console.log(`[Title Template] Row ${index + 1}: Applied template "${titleTemplate}" with variables:`, variables, '→ Result:', row.title);
      } else {
        // If template parsing fails, log warning but keep AI title as fallback
        console.warn(`[Title Template] Failed to parse template for row ${index + 1}, keeping AI-generated title:`, row.title);
      }
    });
  }

  return rows;
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

/** Upload CSV: raw file text → OpenRouter → bulk rows. */
export async function parseCSV(
  file: File,
  openRouterApiKey: string,
  model?: string,
): Promise<CSVRow[]> {
  const apiKey = openRouterApiKey.trim();
  if (!apiKey) {
    throw new Error('OpenRouter API key is required.');
  }

  const csvText = await file.text();
  if (!csvText.trim()) {
    throw new Error('CSV file is empty');
  }

  const { content } = await callOpenRouterChatCompletion({
    apiKey,
    model: model || getResearchModel(),
    system:
      'Return JSON only: { "rows": [ { "keyword": string, "title": string, "entity"?: string, "modifier"?: string, "featuredImage"?: string, "publish_date_gmt"?: string, "sitemap_type"?: "post" | "entity", "meta_description"?: string, "target_slug"?: string, "wikipedia_url"?: string, "wikipedia_title"?: string } ] }. Read the uploaded CSV and output bulk content rows. Copy meta_description, target_slug, wikipedia_url, and wikipedia_title from the CSV when those columns exist and cells are non-empty. Do not invent or rewrite those fields when present.',
    user: `File: ${file.name}\n\n${csvText}`,
    maxTokens: 16000,
    temperature: 0.3,
    responseFormat: { type: 'json_object' },
  });

  const parsed = parseJsonStrict<{ rows?: CSVRow[] }>(content);
  const rows = Array.isArray(parsed?.rows)
    ? parsed.rows.filter((r) => r?.keyword?.trim() && r?.title?.trim())
    : [];

  if (!rows.length) {
    throw new Error('OpenRouter returned no bulk rows');
  }

  return rows;
}

