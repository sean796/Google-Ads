import { isLocalGridWikiConsoleTraceActive, localGridWikiConsoleLog, localGridWikiConsoleWarn } from "@/lib/local-grid-studio/local-grid-wiki-console-trace";
import { getMediaWikiApiUrlWithQuery } from "./mediawiki-api-url";

/**
 * Checks if a Wikipedia page exists for an entity (lightweight check, no content fetch)
 */
export async function checkWikipediaPageExists(
  entity: string,
  retries: number = 3
): Promise<{ exists: boolean; url?: string; title?: string }> {
  if (!entity || !entity.trim()) {
    return { exists: false };
  }

  const entityName = entity.trim();

  const params = new URLSearchParams({
    action: "query",
    prop: "info",
    titles: entityName,
    redirects: "1",
    format: "json",
    formatversion: "2",
    utf8: "1",
    origin: "*",
  });

  const apiUrl = getMediaWikiApiUrlWithQuery(params);

  let attempts = 0;

  while (attempts < retries) {
    try {
      attempts++;
      const response = await fetch(apiUrl, {
        method: "GET",
        headers: { Accept: "application/json" },
        mode: "cors",
      });

      if (!response.ok) {
        if (response.status >= 500 && attempts < retries) {
          await new Promise((resolve) => setTimeout(resolve, 1000 * attempts));
          continue;
        }
        console.warn(`[Wikipedia API] HTTP error ${response.status} for "${entityName}"`);
        return { exists: false };
      }

      const data = await response.json();

      if (!data.query) {
        console.warn(`[Wikipedia API] No query in response for "${entityName}"`);
        return { exists: false };
      }

      if (!data.query.pages || data.query.pages.length === 0) {
        console.warn(`[Wikipedia API] No pages in response for "${entityName}"`);
        return { exists: false };
      }

      const page = data.query.pages[0];

      if (page.missing !== undefined) {
        return { exists: false };
      }

      const title = page.title || entityName;
      const url = `https://en.wikipedia.org/wiki/${encodeURIComponent(title.replace(/\s+/g, "_"))}`;

      return { exists: true, url, title };
    } catch (error) {
      if (attempts < retries) {
        console.warn(
          `[Wikipedia API] Error checking page existence for "${entityName}" (attempt ${attempts}/${retries}), retrying...`,
          error
        );
        await new Promise((resolve) => setTimeout(resolve, 1000 * attempts));
        continue;
      }

      console.warn(`[Wikipedia API] Error checking page existence for "${entityName}":`, error);
      return { exists: false };
    }
  }

  return { exists: false };
}

/**
 * Search Wikipedia for pages matching a query
 */
export async function searchWikipediaPages(query: string, limit: number = 50): Promise<string[]> {
  if (!query || !query.trim()) {
    return [];
  }

  const cap = Math.min(50, Math.max(1, Math.floor(limit)));

  const params = new URLSearchParams({
    action: "query",
    list: "search",
    srsearch: query.trim(),
    srlimit: String(cap),
    format: "json",
    formatversion: "2",
    utf8: "1",
    origin: "*",
  });

  const apiUrl = getMediaWikiApiUrlWithQuery(params);
  const trace = isLocalGridWikiConsoleTraceActive();
  const started = trace ? performance.now() : 0;

  if (trace) {
    localGridWikiConsoleLog("MediaWiki API search →", {
      query: query.trim(),
      limit: cap,
      url: apiUrl,
    });
  }

  try {
    const response = await fetch(apiUrl, {
      method: "GET",
      headers: { Accept: "application/json" },
      mode: "cors",
    });

    if (!response.ok) {
      if (trace) {
        localGridWikiConsoleWarn(`MediaWiki API search HTTP ${response.status}`, { query: query.trim() });
      }
      return [];
    }

    const data = await response.json();
    if (data.query && data.query.search) {
      const titles = data.query.search.map((result: { title: string }) => result.title);
      if (trace) {
        localGridWikiConsoleLog(`MediaWiki API search ← ${titles.length} title(s) in ${Math.round(performance.now() - started)}ms`, {
          query: query.trim(),
          sample: titles.slice(0, 6),
        });
      }
      return titles;
    }
    if (trace) {
      localGridWikiConsoleLog(`MediaWiki API search ← 0 titles in ${Math.round(performance.now() - started)}ms`, {
        query: query.trim(),
      });
    }
  } catch (error) {
    if (trace) {
      localGridWikiConsoleWarn(`MediaWiki API search failed (${Math.round(performance.now() - started)}ms)`, {
        query: query.trim(),
        error,
      });
    } else {
      console.warn(`[Wikipedia API] Error searching Wikipedia for "${query}":`, error);
    }
  }

  return [];
}
