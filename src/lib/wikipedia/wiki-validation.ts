import type { ValidatedEntityResult } from "./types";
import { getMediaWikiApiUrlWithQuery } from "./mediawiki-api-url";
import { logger } from "@/lib/logger";

const WIKI_BATCH_SIZE = 50;

type NormalizedEntry = { from: string; to: string };
type RedirectEntry = { from: string; to: string };

function applyNormalizationAndRedirects(start: string, normalized: NormalizedEntry[], redirects: RedirectEntry[]): string {
  const normMap = new Map(normalized.map((n) => [n.from.toLowerCase(), n.to]));
  const redMap = new Map(redirects.map((r) => [r.from.toLowerCase(), r.to]));
  let cur = start.trim();
  const n0 = normMap.get(cur.toLowerCase());
  if (n0) cur = n0;
  let guard = 0;
  while (guard++ < 25) {
    const next = redMap.get(cur.toLowerCase());
    if (next) cur = next;
    else break;
  }
  return cur;
}

/**
 * Preserve input order; drop titles with no article; use canonical `title` from the API (redirects resolved).
 */
export async function filterOrderedTitlesToExistingCanonical(orderedTitles: string[]): Promise<string[]> {
  if (!orderedTitles.length) return [];
  const trimmed = orderedTitles.map((t) => t.trim()).filter((c) => c.length > 0);
  const out: string[] = [];
  for (let i = 0; i < trimmed.length; i += WIKI_BATCH_SIZE) {
    const batch = trimmed.slice(i, i + WIKI_BATCH_SIZE);
    const titlesParam = batch.join("|");
    const params = new URLSearchParams({
      action: "query",
      prop: "info",
      titles: titlesParam,
      redirects: "1",
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
      if (!response.ok) continue;
      const data = await response.json();
      if (!data.query?.pages) continue;
      const pages = data.query.pages as Array<{ title?: string; missing?: boolean }>;
      const normalized = (data.query.normalized ?? []) as NormalizedEntry[];
      const redirects = (data.query.redirects ?? []) as RedirectEntry[];
      const nonMissingCanonical = new Map<string, string>();
      for (const p of pages) {
        if (p.missing === undefined && p.title) {
          nonMissingCanonical.set(p.title.toLowerCase(), p.title);
        }
      }
      for (const entity of batch) {
        const resolved = applyNormalizationAndRedirects(entity, normalized, redirects);
        const canon = nonMissingCanonical.get(resolved.toLowerCase());
        if (canon) out.push(canon);
      }
    } catch (err) {
      logger.warn("[Wikipedia API] filterOrderedTitlesToExistingCanonical:", err);
    }
  }
  return out;
}

/**
 * Batch-check Wikipedia page existence for many entities (agentic wiki research).
 */
export async function validateEntitiesExist(candidates: string[]): Promise<ValidatedEntityResult[]> {
  if (!candidates || candidates.length === 0) return [];
  const trimmed = candidates.map((c) => c.trim()).filter((c) => c.length > 0);
  const results: ValidatedEntityResult[] = [];
  for (let i = 0; i < trimmed.length; i += WIKI_BATCH_SIZE) {
    const batch = trimmed.slice(i, i + WIKI_BATCH_SIZE);
    const titlesParam = batch.join("|");
    const params = new URLSearchParams({
      action: "query",
      prop: "info",
      titles: titlesParam,
      redirects: "1",
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
      if (!response.ok) continue;
      const data = await response.json();
      if (!data.query?.pages) continue;
      const pages = data.query.pages as Array<{ title?: string; missing?: boolean }>;
      const normalized = (data.query.normalized ?? []) as NormalizedEntry[];
      const redirects = (data.query.redirects ?? []) as RedirectEntry[];
      const existingByTitle = new Map<string, { url: string; title: string }>();
      for (const p of pages) {
        if (p.missing === undefined && p.title) {
          const url = `https://en.wikipedia.org/wiki/${encodeURIComponent(p.title.replace(/\s+/g, "_"))}`;
          existingByTitle.set(p.title.toLowerCase(), { url, title: p.title });
        }
      }
      for (const entity of batch) {
        const resolved = applyNormalizationAndRedirects(entity, normalized, redirects);
        const key = resolved.toLowerCase();
        const found = existingByTitle.get(key);
        if (found) {
          results.push({ entity, exists: true, url: found.url, title: found.title });
        } else {
          results.push({ entity, exists: false });
        }
      }
    } catch (err) {
      logger.warn("[Wikipedia API] Batch exists error:", err);
      for (const entity of batch) {
        results.push({ entity, exists: false });
      }
    }
  }
  return results;
}
