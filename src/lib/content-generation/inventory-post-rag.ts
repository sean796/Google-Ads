import type { SitePostInventoryRow } from "@/lib/wordpress-api/types";
import { getSeoResearchFromPostFields } from "@/lib/content-generation/ai-driven-post-fields-reader";

const DEFAULT_RAG_MAX_PLAIN_CHARS = 4500;

function plainFromHtml(html: string, maxChars: number): string {
  const plain = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (plain.length <= maxChars) return plain;
  return `${plain.slice(0, maxChars)}…`;
}

/**
 * RAG block from WordPress inventory / downloaded CSV row (title, keyword, body, ACF).
 */
export function buildInventoryPostRagContext(
  row: SitePostInventoryRow | undefined,
  options?: { maxPlainChars?: number },
): string {
  if (!row) return "";

  const maxPlain = options?.maxPlainChars ?? DEFAULT_RAG_MAX_PLAIN_CHARS;
  const parts: string[] = [];

  const title = String(row.fields?.title ?? "").trim();
  if (title) parts.push(`Page title (H1 on site): ${title}`);

  const rankKw = String(row.fields?.keyword ?? "").trim();
  if (rankKw) parts.push(`NEO Pulse redirect focus keyword: ${rankKw}`);

  const url = String(row.url ?? "").trim();
  if (url) parts.push(`URL: ${url}`);

  const meta = String(row.fields?.meta ?? "").trim();
  if (meta) parts.push(`Meta description: ${meta}`);

  const contentHtml = String(row.fields?.content ?? "").trim();
  if (contentHtml) {
    parts.push(
      `Main post content (match this topic; extra text must extend this page, not a generic article):\n${plainFromHtml(contentHtml, maxPlain)}`,
    );
  }

  const excerpt = String(row.fields?.excerpt ?? "").trim();
  if (excerpt) {
    parts.push(`Excerpt: ${plainFromHtml(excerpt, 600)}`);
  }

  const acf = row.acf && typeof row.acf === "object" ? (row.acf as Record<string, unknown>) : null;
  if (acf) {
    const kf = String(acf["keyword_focus"] ?? "").trim();
    if (kf) parts.push(`ACF keyword_focus: ${kf}`);
    const seoResearch = getSeoResearchFromPostFields(acf).trim();
    if (seoResearch) {
      parts.push(`ACF seo_research (brief):\n${plainFromHtml(seoResearch, 1200)}`);
    }
  }

  return parts.join("\n\n");
}
