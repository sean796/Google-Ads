import { getMediaWikiApiUrlWithQuery } from "./mediawiki-api-url";
import { checkWikipediaPageExists, searchWikipediaPages } from "./mediawiki-search";
import { wikipediaArticleUrl } from "./wiki-urls";
import { logger } from "@/lib/logger";

export type WikipediaPageLeadImage = {
  title: string;
  pageUrl: string;
  imageUrl: string;
};

/**
 * Resolve an English Wikipedia article title for a place entity.
 * Exact title first; if missing, first search hit then re-check.
 */
export async function resolveWikipediaPageTitleForEntity(
  entity: string,
): Promise<{ title: string; pageUrl: string } | null> {
  const q = (entity ?? "").trim();
  if (!q) return null;

  const exact = await checkWikipediaPageExists(q);
  if (exact.exists && exact.title) {
    return {
      title: exact.title,
      pageUrl: exact.url || wikipediaArticleUrl(exact.title),
    };
  }

  const hits = await searchWikipediaPages(q, 1);
  const hit = (hits[0] ?? "").trim();
  if (!hit) return null;

  const again = await checkWikipediaPageExists(hit);
  if (again.exists && again.title) {
    return {
      title: again.title,
      pageUrl: again.url || wikipediaArticleUrl(again.title),
    };
  }
  return null;
}

/**
 * Fetch the lead/pageimage URL for a known Wikipedia article title.
 * Prefers original; falls back to large thumbnail.
 */
export async function fetchWikipediaPageImageUrl(
  title: string,
): Promise<string | null> {
  const t = (title ?? "").trim();
  if (!t) return null;

  const params = new URLSearchParams({
    action: "query",
    prop: "pageimages",
    titles: t,
    redirects: "1",
    piprop: "original|thumbnail|name",
    pithumbsize: "2000",
    format: "json",
    formatversion: "2",
    utf8: "1",
    origin: "*",
  });

  const apiUrl = getMediaWikiApiUrlWithQuery(params);
  try {
    const response = await fetch(apiUrl, {
      method: "GET",
      headers: { Accept: "application/json" },
      mode: "cors",
    });
    if (!response.ok) return null;

    const data = (await response.json()) as {
      query?: {
        pages?: Array<{
          missing?: boolean;
          original?: { source?: string };
          thumbnail?: { source?: string };
        }>;
      };
    };
    const page = data.query?.pages?.[0];
    if (!page || page.missing !== undefined) return null;

    const original = String(page.original?.source ?? "").trim();
    if (original && /^https?:\/\//i.test(original)) return original;

    const thumb = String(page.thumbnail?.source ?? "").trim();
    if (thumb && /^https?:\/\//i.test(thumb)) return thumb;

    return null;
  } catch (error) {
    logger.warn(`[Wikipedia API] Error fetching pageimage for "${t}":`, error);
    return null;
  }
}

/**
 * Resolve entity → Wikipedia page → lead image URL.
 * Returns null when the page or pageimage is missing.
 */
export async function fetchWikipediaPageLeadImage(
  entity: string,
): Promise<WikipediaPageLeadImage | null> {
  const page = await resolveWikipediaPageTitleForEntity(entity);
  if (!page) return null;

  const imageUrl = await fetchWikipediaPageImageUrl(page.title);
  if (!imageUrl) return null;

  return {
    title: page.title,
    pageUrl: page.pageUrl,
    imageUrl,
  };
}
