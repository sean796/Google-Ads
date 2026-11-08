import { getSeoResearchFromPostFields } from "@/lib/content-generation/ai-driven-post-fields-reader";
import { SITEMAP_OPTIMIZER_CONTENT_SNIPPET_MAX } from "@/lib/sitemap-optimizer/constants";
import type {
  SitemapOptimizerCatalogEntry,
  SitemapOptimizerPostRow,
} from "@/lib/sitemap-optimizer/types";

export function stripHtmlToPlainText(html: string): string {
  if (!html?.trim()) return "";
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function truncatePlainText(text: string, max: number): string {
  const t = text.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max)}…`;
}

export function postIdFromInventoryRow(row: {
  id?: number;
  url: string;
  slug?: string;
}): string {
  if (row.id != null && Number.isFinite(row.id)) return `wp:${row.id}`;
  const slug = row.slug?.trim();
  if (slug) return `slug:${slug.toLowerCase()}`;
  return `url:${row.url.trim().toLowerCase()}`;
}

export function seoResearchFromAcf(acf: Record<string, unknown> | undefined): string | undefined {
  const raw = getSeoResearchFromPostFields(acf);
  return raw.trim() || undefined;
}

export function urlPathTail(url: string): string {
  try {
    const parts = new URL(url.trim()).pathname.split("/").filter(Boolean);
    return parts[parts.length - 1] ?? "";
  } catch {
    const trimmed = url.trim().replace(/\/$/, "");
    const idx = trimmed.lastIndexOf("/");
    return idx >= 0 ? trimmed.slice(idx + 1) : trimmed;
  }
}

export function buildCatalogEntries(rows: SitemapOptimizerPostRow[]): SitemapOptimizerCatalogEntry[] {
  return rows.map((r) => ({
    postId: r.postId,
    url: r.url,
    urlPathTail: urlPathTail(r.url),
    title: r.title,
    keyword: r.keyword,
    meta: r.meta,
    collection: r.collection,
    gscTopQueries: r.gscQueries.slice(0, 10).map((q) => q.query),
    contentSnippet: r.contentSnippet,
    ...(r.gscPageImpressions != null
      ? {
          gscPageClicks: r.gscPageClicks,
          gscPageImpressions: r.gscPageImpressions,
          gscPageCtr: r.gscPageCtr,
          gscPagePosition: r.gscPagePosition,
        }
      : {}),
  }));
}

export function contentSnippetFromFields(content?: string, excerpt?: string): string {
  const plain =
    stripHtmlToPlainText(content ?? "") || stripHtmlToPlainText(excerpt ?? "");
  return truncatePlainText(plain, SITEMAP_OPTIMIZER_CONTENT_SNIPPET_MAX);
}
