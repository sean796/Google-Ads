import type { SitePostInventoryRow } from "@/lib/wordpress-api/types";
import type { DownloadedSeoFields } from "@/hooks/overview/use-overview-download";
import { getSeoResearchFromPostFields } from "@/lib/content-generation/ai-driven-post-fields-reader";
import { inventoryRowHasUsableBodyContent } from "@/lib/wordpress-api/inventory-match";
import { focusKeywordFromWordPressSources } from "@/lib/overview/focus-keyword-from-wp-sources";

/** First on-page H1 from post HTML (visitor-visible heading, not SEO title tag). */
export function extractPageHeadingFromHtml(html: string): string {
  if (!html?.trim()) return "";
  const strip = (inner: string) =>
    inner
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  const elementor = html.match(
    /<h1[^>]*class=["'][^"']*elementor-heading-title[^"']*["'][^>]*>([\s\S]*?)<\/h1>/i,
  );
  if (elementor?.[1]) {
    const t = strip(elementor[1]);
    if (t) return t;
  }
  const m = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  if (!m?.[1]) return "";
  return strip(m[1]);
}

/** Plain-text WordPress excerpt for Overview meta (never prompt_modifier / fields.meta). */
export function overviewExcerptMetaLine(row: SitePostInventoryRow): string {
  const excerptLine = (row.fields?.excerpt || "").trim();
  if (!excerptLine) return "";
  return excerptLine
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .substring(0, 300);
}

/**
 * Map a REST inventory row (includeRawPostFields) to the same shape as get-post-meta download,
 * so Overview scrape can skip per-row /get-post-meta when prefetch already loaded this post.
 *
 * Meta description is the WordPress excerpt only.
 */
export function downloadFieldsFromInventoryRow(row: SitePostInventoryRow): DownloadedSeoFields {
  const acf = row.acf && typeof row.acf === "object" ? (row.acf as Record<string, unknown>) : {};
  const str = (k: string) => (typeof acf[k] === "string" ? (acf[k] as string) : "");
  const acfFaq = str("faq");
  const acfDate = str("date_modifier") || str("seo_date_modifier");
  const postFieldsSeoResearch = getSeoResearchFromPostFields(acf).trim();
  const collection =
    "collection" in row && typeof (row as { collection?: unknown }).collection === "string"
      ? (row as { collection: string }).collection
      : "posts";
  const focusKeyword =
    focusKeywordFromWordPressSources({
      acf,
      fieldsKeyword: row.fields?.keyword,
      title: (row.fields?.title || row.fields?.pageHeading || "").trim(),
      collection,
    }) || undefined;
  const title = (row.fields?.title || "").trim() || undefined;
  const pageHeading =
    (row.fields?.pageHeading || "").trim() ||
    extractPageHeadingFromHtml(row.fields?.content ?? "") ||
    undefined;
  const excerptPlain = overviewExcerptMetaLine(row);
  const metaDescription = excerptPlain || undefined;

  return {
    title,
    pageHeading,
    metaDescription,
    schemaJson: undefined,
    focusKeyword,
    faq: acfFaq.trim(),
    dateModifier: acfDate.trim() || undefined,
    seoResearch: postFieldsSeoResearch || undefined,
  };
}

/** True when list inventory has a title and meta line (ACF meta or WordPress excerpt); live HTML scrape can be skipped. */
export function inventoryCoversLiveScrape(row: SitePostInventoryRow | undefined): boolean {
  if (!row?.id) return false;
  const d = downloadFieldsFromInventoryRow(row);
  return Boolean((d.title || "").trim() && (d.metaDescription || "").trim());
}

/** True when inventory has enough row data to avoid a get-post-meta round-trip. */
export function inventoryRowHasSeoHydration(row: SitePostInventoryRow | undefined): boolean {
  if (!row?.id) return false;
  const d = downloadFieldsFromInventoryRow(row);
  return Boolean(
    d.title ||
      d.metaDescription ||
      d.focusKeyword ||
      d.faq ||
      d.dateModifier ||
      d.seoResearch,
  );
}

/**
 * Full post HTML from inventory (`fields.content` only). Used for scrape headers/links/FAQ extraction.
 * When `expectedPostId` is set, requires inventory row id to match the binding.
 */
export function postBodyHtmlFromInventoryRow(
  row: SitePostInventoryRow | undefined,
  expectedPostId?: number | null,
): string | undefined {
  if (!row?.id) return undefined;
  if (expectedPostId != null && row.id !== expectedPostId) return undefined;
  const raw = String(row.fields?.content ?? "").trim();
  return raw || undefined;
}

/**
 * HTML (or plain) body for AI sentiment when inventory was fetched with `includeContent`.
 * When `expectedPostId` is set, requires inventory row id to match the binding.
 */
export function sentimentHtmlFromInventoryRow(
  row: SitePostInventoryRow | undefined,
  expectedPostId?: number | null,
): string | undefined {
  if (!row?.id) return undefined;
  if (expectedPostId != null && row.id !== expectedPostId) return undefined;
  if (!inventoryRowHasUsableBodyContent(row)) return undefined;
  const rawContent = row.fields?.content;
  if (String(rawContent ?? "").trim()) return String(rawContent);
  const rawExcerpt = row.fields?.excerpt;
  if (String(rawExcerpt ?? "").trim()) return String(rawExcerpt);
  return undefined;
}
