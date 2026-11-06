import {
  collectImportedDraftLinksFromSource,
  importedDraftLinkUrls,
  normalizeImportedDraftUrl,
} from '@/lib/bulk/blog-import-draft-links';

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
