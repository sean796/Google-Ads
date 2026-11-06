import type { GetPagesInCategoryOptions } from "./types";
import { getMediaWikiApiUrlWithQuery } from "./mediawiki-api-url";
import { logger } from "@/lib/logger";

/**
 * Wikipedia category discovery is AI-only (entity layer). No pattern matching, no search, no logs.
 */
export async function getWikipediaCategoryPages(_area: string, _modifier?: string): Promise<string[]> {
  return [];
}

/** MediaWiki category namespace id (enwiki). */
const NS_CATEGORY = 14;

/**
 * Search English Wikipedia **category** pages only (namespace 14).
 */
export async function searchWikipediaCategories(
  queries: string[],
  limitPerQuery: number = 12
): Promise<string[]> {
  const trimmed = [...new Set(queries.map((q) => q.trim()).filter(Boolean))];
  if (trimmed.length === 0) return [];

  const cap = Math.min(50, Math.max(1, limitPerQuery));

  const batches = await Promise.all(
    trimmed.map(async (srsearch) => {
      const params = new URLSearchParams({
        action: "query",
        list: "search",
        srsearch,
        srnamespace: String(NS_CATEGORY),
        srlimit: String(cap),
        format: "json",
        formatversion: "2",
        utf8: "1",
        origin: "*",
      });
      const apiUrl = getMediaWikiApiUrlWithQuery(params);
      const titles: string[] = [];
      try {
        const response = await fetch(apiUrl, {
          method: "GET",
          headers: { Accept: "application/json" },
          mode: "cors",
        });
        if (!response.ok) return titles;
        const data = await response.json();
        const rows = data?.query?.search;
        if (!Array.isArray(rows)) return titles;
        for (const row of rows) {
          const title = typeof row?.title === "string" ? row.title : "";
          if (title.startsWith("Category:")) titles.push(title);
        }
      } catch (e) {
        logger.warn(`[Wikipedia API] Category search failed for "${srsearch}":`, e);
      }
      return titles;
    })
  );

  const seen = new Set<string>();
  const out: string[] = [];
  for (const batch of batches) {
    for (const title of batch) {
      const k = title.toLowerCase();
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(title);
    }
  }
  return out;
}

/**
 * Gets pages in a Wikipedia category (articles only by default, with pagination).
 */
export async function getPagesInCategory(
  categoryTitle: string,
  options: GetPagesInCategoryOptions = {}
): Promise<string[]> {
  const { limit = 500, pageOnly = true } = options;
  const pageLimit = Math.min(500, Math.max(1, limit));
  const allTitles: string[] = [];
  let cmcontinue: string | undefined;

  do {
    const params = new URLSearchParams({
      action: "query",
      list: "categorymembers",
      cmtitle: categoryTitle,
      cmlimit: String(pageLimit),
      format: "json",
      formatversion: "2",
      utf8: "1",
      origin: "*",
    });
    if (pageOnly) {
      params.set("cmtype", "page");
    }
    if (cmcontinue) {
      params.set("cmcontinue", cmcontinue);
    }

    const apiUrl = getMediaWikiApiUrlWithQuery(params);

    try {
      const response = await fetch(apiUrl, {
        method: "GET",
        headers: { Accept: "application/json" },
        mode: "cors",
      });

      if (!response.ok) break;

      const data = await response.json();
      const members = data.query?.categorymembers ?? [];
      for (const member of members) {
        if (pageOnly && member.ns !== undefined && member.ns !== 0) continue;
        if (member.title) allTitles.push(member.title);
      }
      if (allTitles.length >= limit) break;
      cmcontinue = data.continue?.cmcontinue;
    } catch (error) {
      logger.warn(`[Wikipedia API] Error getting pages in category "${categoryTitle}":`, error);
      break;
    }
  } while (cmcontinue);

  return allTitles.slice(0, limit);
}

/**
 * Gets subcategories of a Wikipedia category.
 */
export async function getSubcategoriesInCategory(
  categoryTitle: string,
  options: { limit?: number } = {}
): Promise<string[]> {
  const { limit = 100 } = options;
  const params = new URLSearchParams({
    action: "query",
    list: "categorymembers",
    cmtitle: categoryTitle,
    cmtype: "subcat",
    cmlimit: String(Math.min(500, limit)),
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
    if (!response.ok) return [];
    const data = await response.json();
    const members = data.query?.categorymembers ?? [];
    return members
      .filter((m: { ns?: number }) => m.ns === 14)
      .map((m: { title: string }) => m.title as string)
      .slice(0, limit);
  } catch (error) {
    logger.warn(`[Wikipedia API] Error getting subcategories of "${categoryTitle}":`, error);
    return [];
  }
}

/**
 * Deep category fetch: gets pages from a category AND one level of subcategories.
 */
export async function getPagesInCategoryDeep(
  categoryTitle: string,
  options: GetPagesInCategoryOptions & { subcategoryDepth?: number } = {}
): Promise<string[]> {
  const { limit = 500, pageOnly = true, subcategoryDepth = 1 } = options;

  const directPages = await getPagesInCategory(categoryTitle, { limit, pageOnly });

  if (subcategoryDepth <= 0) return directPages;

  const subcats = await getSubcategoriesInCategory(categoryTitle);

  const allPages = new Set(directPages);
  for (const subcat of subcats) {
    if (allPages.size >= limit) break;
    const subPages = await getPagesInCategory(subcat, {
      limit: limit - allPages.size,
      pageOnly,
    });
    for (const p of subPages) allPages.add(p);
  }

  return Array.from(allPages).slice(0, limit);
}
