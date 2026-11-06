import { getMediaWikiApiUrlWithQuery } from "./mediawiki-api-url";

/**
 * Gets links from a Wikipedia page (for any page type - entity or list)
 */
export async function getLinksFromWikipediaPage(
  pageTitle: string,
  options: { limit?: number; filterNamespaces?: boolean } = {}
): Promise<string[]> {
  const { limit = 500, filterNamespaces = true } = options;

  if (!pageTitle || !pageTitle.trim()) {
    return [];
  }

  const pageTitleTrimmed = pageTitle.trim();
  const allLinks: string[] = [];
  let plcontinue: string | undefined;

  do {
    const linksParams = new URLSearchParams({
      action: "query",
      prop: "links",
      titles: pageTitleTrimmed,
      pllimit: "500",
      format: "json",
      formatversion: "2",
      utf8: "1",
      origin: "*",
    });

    if (plcontinue) {
      linksParams.set("plcontinue", plcontinue);
    }

    const linksApiUrl = getMediaWikiApiUrlWithQuery(linksParams);

    try {
      const linksResponse = await fetch(linksApiUrl, {
        method: "GET",
        headers: { Accept: "application/json" },
        mode: "cors",
      });

      if (!linksResponse.ok) {
        break;
      }

      const linksData = await linksResponse.json();
      if (linksData.query?.pages && linksData.query.pages.length > 0) {
        const page = linksData.query.pages[0];
        if (page.links && Array.isArray(page.links)) {
          const pageLinks = page.links
            .map((link: { title: string }) => link.title)
            .filter((title: string) => {
              if (!title || title.trim().length === 0) return false;
              if (filterNamespaces) {
                if (title.includes(":")) {
                  if (!title.startsWith("List of")) return false;
                }
                if (title.length < 3 || title.length > 100) return false;
                const lower = title.toLowerCase();
                if (
                  lower.includes("disambiguation") ||
                  lower.includes("category:") ||
                  lower.includes("template:") ||
                  lower.includes("file:") ||
                  lower.includes("help:")
                )
                  return false;
              }
              return true;
            });

          allLinks.push(...pageLinks);
        }
      }

      plcontinue = linksData.continue?.plcontinue;
      if (allLinks.length >= limit) break;
    } catch (error) {
      console.warn(`[Wikipedia API] Error getting links from "${pageTitleTrimmed}":`, error);
      break;
    }
  } while (plcontinue);

  return allLinks.slice(0, limit);
}

/**
 * Extracts list items from a Wikipedia list page
 */
export async function extractEntitiesFromWikipediaList(pageTitle: string): Promise<string[]> {
  const linksParams = new URLSearchParams({
    action: "query",
    prop: "links",
    titles: pageTitle,
    pllimit: "500",
    format: "json",
    formatversion: "2",
    utf8: "1",
    origin: "*",
  });

  const linksApiUrl = getMediaWikiApiUrlWithQuery(linksParams);

  try {
    const linksResponse = await fetch(linksApiUrl, {
      method: "GET",
      headers: { Accept: "application/json" },
      mode: "cors",
    });

    if (linksResponse.ok) {
      const linksData = await linksResponse.json();
      if (linksData.query && linksData.query.pages && linksData.query.pages.length > 0) {
        const page = linksData.query.pages[0];
        if (page.links && page.links.length > 0) {
          const entities = page.links
            .map((link: { title: string }) => link.title)
            .filter((title: string) => {
              if (title.includes(":") && !title.startsWith("List of")) return false;
              if (title.length < 3 || title.length > 100) return false;
              if (
                title.toLowerCase().includes("disambiguation") ||
                title.toLowerCase().includes("category:") ||
                title.toLowerCase().includes("template:")
              )
                return false;
              return true;
            });

          if (entities.length > 0) {
            console.log(`[Wikipedia API] Extracted ${entities.length} entities from links`);
            return entities.slice(0, 200);
          }
        }
      }
    }
  } catch (error) {
    console.warn(`[Wikipedia API] Error getting links from "${pageTitle}":`, error);
  }

  const params = new URLSearchParams({
    action: "query",
    prop: "extracts",
    titles: pageTitle,
    explaintext: "1",
    exsectionformat: "plain",
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

    if (!response.ok) {
      return [];
    }

    const data = await response.json();
    if (data.query && data.query.pages && data.query.pages.length > 0) {
      const page = data.query.pages[0];
      const extract = page.extract || "";

      if (!extract) {
        console.warn(`[Wikipedia API] No extract content for "${pageTitle}"`);
        return [];
      }

      console.log(`[Wikipedia API] Extracting from text content (${extract.length} chars)`);

      const lines = extract.split("\n");
      const entities: string[] = [];
      const seen = new Set<string>();

      for (const line of lines) {
        let match = line.match(/^[*•\-\u2022]\s+(.+?)(?:\s*[([]|$)/);
        if (!match) {
          match = line.match(/^\d+[.)]\s+(.+?)(?:\s*[([]|$)/);
        }
        if (!match) {
          match = line.match(/^([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)(?:\s*[([,;]|$)/);
        }
        if (!match) {
          match = line.match(/\[\[([^|\]]+)(?:\|[^\]]+)?\]\]/);
        }

        if (match) {
          let entity = match[1].trim();

          entity = entity
            .replace(/\[\[([^|\]]+)(?:\|[^\]]+)?\]\]/g, "$1")
            .replace(/'''([^']+)'''/g, "$1")
            .replace(/''([^']+)''/g, "$1")
            .replace(/\([^)]*\)/g, "")
            .replace(/\[.*?\]/g, "")
            .replace(/^\d+[.)]\s*/, "")
            .replace(/^[*•\-\u2022]\s*/, "")
            .trim();

          entity = entity.split(/[,[(;]/)[0].trim();

          if (entity.length > 2 && entity.length < 100 && !seen.has(entity.toLowerCase())) {
            const lower = entity.toLowerCase();
            if (
              !lower.match(
                /^(the|a|an|and|or|of|in|on|at|for|with|from|to|by|as|is|are|was|were|be|been|being|have|has|had|do|does|did|will|would|could|should|may|might|must|can)$/
              )
            ) {
              entities.push(entity);
              seen.add(entity.toLowerCase());
            }
          }
        }
      }

      console.log(`[Wikipedia API] Extracted ${entities.length} entities from text content`);
      return entities.slice(0, 200);
    }
  } catch (error) {
    console.warn(`[Wikipedia API] Error extracting entities from "${pageTitle}":`, error);
  }

  return [];
}
