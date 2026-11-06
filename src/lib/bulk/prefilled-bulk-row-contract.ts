import type { CSVRow } from "@/lib/bulk/bulk-csv-parser";
import {
  COMPETITOR_COMPARISON_PROSE_PROMPT_BLOCK,
  isCompetitorCsvKeyword,
} from "@/lib/competitor-research/competitor-csv-row";

export type PrefilledBulkRowFields = {
  keyword?: string;
  title?: string;
  entity?: string;
  wikipedia_url?: string;
  wikipedia_title?: string;
  meta_description?: string;
  target_slug?: string;
  publish_date_gmt?: string;
  featuredImage?: string;
  modifier?: string;
};

function line(label: string, value: string | undefined): string | null {
  const v = value?.trim();
  if (!v) return null;
  return `${label}: ${v}`;
}

/** Fixed checklist/blueprint block: use CSV values verbatim; omit empty fields. */
export function formatPrefilledBulkRowContract(row: PrefilledBulkRowFields): string {
  const lines = [
    line("keyword", row.keyword),
    line("title", row.title),
    line("entity", row.entity),
    line("wikipedia_url", row.wikipedia_url),
    line("wikipedia_title", row.wikipedia_title),
    line("meta_description", row.meta_description),
    line("target_slug", row.target_slug),
    line("publish_date_gmt", row.publish_date_gmt),
    line("featuredImage", row.featuredImage),
    line("modifier", row.modifier),
  ].filter((x): x is string => Boolean(x));

  if (lines.length === 0) return "";

  return `
=== PREFILLED BULK ROW (USE VERBATIM) ===
${lines.join("\n")}

Rules:
- Treat every field above as already finalized for this row.
- Do NOT invent alternate title, meta description, Wikipedia URL/title, or slug.
- Checklist and blueprint must align with these values; copy title/meta/wiki/slug exactly when referenced.
=== END PREFILLED BULK ROW ===
`;
}

export function formatPrefilledBulkRowContractFromCsvRow(row: CSVRow): string {
  if (!isCompetitorCsvKeyword(row.keyword)) {
    return formatPrefilledBulkRowContract({
      keyword: row.keyword,
      title: row.title,
      entity: row.entity,
      wikipedia_url: row.wikipedia_url,
      wikipedia_title: row.wikipedia_title,
      meta_description: row.meta_description,
      target_slug: row.target_slug,
      publish_date_gmt: row.publish_date_gmt,
      featuredImage: row.featuredImage,
      modifier: row.modifier,
    });
  }

  const focus = row.keyword_focus?.trim();
  const lines = [
    line("title", row.title),
    line("entity", row.entity),
    focus ? line("focus_keyword (SEO phrase for body copy)", focus) : null,
    line("meta_description", row.meta_description),
    line("target_slug", row.target_slug),
    line("publish_date_gmt", row.publish_date_gmt),
    line("featuredImage", row.featuredImage),
    line("modifier", row.modifier),
  ].filter((x): x is string => Boolean(x));

  if (lines.length === 0) return "";

  return `
=== PREFILLED BULK ROW (USE VERBATIM) ===
${lines.join("\n")}

Rules:
- Treat title, entity, focus_keyword, meta description, slug, and modifier as finalized for this row.
- Do NOT invent alternate title, meta description, or slug.
- The CSV keyword route label "competitor - …" is NOT reader-facing copy. Never quote it in the article.

${COMPETITOR_COMPARISON_PROSE_PROMPT_BLOCK}
=== END PREFILLED BULK ROW ===
`;
}

export function hasCsvFilledTitle(row: Pick<CSVRow, "title">): boolean {
  return Boolean(row.title?.trim());
}

const TITLE_KEYWORD_STOP = new Set([
  "a",
  "an",
  "and",
  "for",
  "how",
  "in",
  "is",
  "of",
  "on",
  "or",
  "the",
  "to",
  "what",
  "why",
]);

function keywordContentTokens(phrase: string): string[] {
  return phrase
    .toLowerCase()
    .split(/\s+/g)
    .map((w) => w.replace(/[^a-z0-9]+/g, ""))
    .filter((w) => w.length >= 2 && !TITLE_KEYWORD_STOP.has(w));
}

/** True when every content word in `keyword` appears in `title`. */
export function titleCoversKeyword(title: string, keyword: string): boolean {
  const tokens = keywordContentTokens(keyword);
  if (tokens.length === 0) return true;
  const hay = title.toLowerCase();
  return tokens.every((w) => hay.includes(w));
}

/** Colon stitch (`keyword: subtitle`) is not a publishable post title. */
export function titleHasForbiddenColon(title: string): boolean {
  return title.includes(":");
}

/** CSV title is only safe to publish verbatim when it is about this row's keyword. */
export function hasKeywordAlignedCsvTitle(
  row: Pick<CSVRow, "title" | "keyword">,
  focusKeyword?: string,
): boolean {
  if (!hasCsvFilledTitle(row)) return false;
  if (titleHasForbiddenColon(row.title)) return false;
  const kw = (focusKeyword ?? row.keyword ?? "").trim();
  if (!kw) return true;
  return titleCoversKeyword(row.title, kw);
}

export function hasCsvFilledMeta(row: Pick<CSVRow, "meta_description">): boolean {
  return Boolean(row.meta_description?.trim());
}

export function hasCsvFilledWikipediaUrl(row: Pick<CSVRow, "wikipedia_url">): boolean {
  return Boolean(row.wikipedia_url?.trim());
}

export function hasCsvFilledTargetSlug(row: Pick<CSVRow, "target_slug">): boolean {
  return Boolean(row.target_slug?.trim());
}
