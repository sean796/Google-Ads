/**
 * Sequential SAP peer search for in-content images.
 * Builds a one-shot entity URL index per peer site, then looks up by place entity
 * (no per-image sitemap re-fetch).
 */

import type { WordPressSite } from "@/components/integrations/types";
import { getEntitySiteWarmCacheIfReady } from "@/lib/local-analysis/entity-site-warm-cache";
import { fetchOverviewSapInventoryFromEntitySitemap } from "@/lib/overview/overview-sap-entity-inventory";
import type { OverviewInventoryRow } from "@/lib/overview/overview-inventory-csv";
import { clearSapPeerMarketSelectCache, resolveMarketCityForPlaceEntity } from "@/lib/overview/sap-peer-market-select";
import { peerLocalImagesCsvFileSlug, COMBINED_PEER_LOCAL_IMAGES_CSV_NAME } from "@/lib/overview/overview-peer-csv-details";
import { entityEndpointFromSite, isEntityInventoryRow } from "@/lib/sitemap-optimizer/entity-compression-profile";
import { getSiteInventoryBulk } from "@/lib/wordpress-api";

const MAX_CONTENT_FETCHES_PER_SITE = 12;

export type SapCrossSiteImageHit = {
  imageUrl: string;
  alt?: string;
  sourceSiteName: string;
  sourceSiteUrl: string;
  sourcePageUrl: string;
  /** Higher = better place match (exact slug/title preferred). */
  score: number;
};

export type SapPeerLibraryCsvFile = {
  name: string;
  content: string;
  mimeType: string;
};

export type SapCrossSiteImageSearchResult = {
  hit: SapCrossSiteImageHit | null;
  peerCsvFiles: SapPeerLibraryCsvFile[];
};

export type SapPeerEntityEntry = {
  siteId: string;
  siteName: string;
  siteUrl: string;
  collection: string;
  pageUrl: string;
  id: number;
  title: string;
  slug: string;
  keyword: string;
  /** Cached body HTML when known (warm cache or prior content fetch). */
  contentHtml?: string;
  /** Cached body image when already extracted from contentHtml. */
  imageUrl?: string;
  imageAlt?: string;
};

export type SapPeerEntityIndex = {
  cacheKey: string;
  builtAt: number;
  sitesInOrder: WordPressSite[];
  entriesBySiteId: Map<string, SapPeerEntityEntry[]>;
  entryCount: number;
};

/** Collapse whitespace; lowercase; trim. No regex. */
export function normalizePlaceKey(value: string): string {
  const raw = String(value ?? "").trim().toLowerCase();
  let out = "";
  let space = false;
  for (let i = 0; i < raw.length; i += 1) {
    const ch = raw[i]!;
    if (ch === " " || ch === "\t" || ch === "\n" || ch === "\r") {
      space = true;
      continue;
    }
    if (space && out.length > 0) out += " ";
    space = false;
    out += ch;
  }
  return out;
}

/** Slug segments → place key (`stadium-station-edmonton` → `stadium station edmonton`). */
export function placeKeyFromSlug(slug: string): string {
  return normalizePlaceKey(String(slug ?? "").split("-").join(" "));
}

/** Path of a page URL → place key (`.../edmonton-city-centre/` → `edmonton city centre`). */
export function placeKeyFromPageUrl(pageUrl: string): string {
  const raw = String(pageUrl ?? "").trim();
  if (!raw) return "";
  let path = raw;
  const scheme = raw.indexOf("://");
  if (scheme >= 0) {
    const afterHost = raw.slice(scheme + 3);
    const slash = afterHost.indexOf("/");
    path = slash >= 0 ? afterHost.slice(slash + 1) : "";
  }
  let end = path.length;
  for (let i = 0; i < path.length; i += 1) {
    const ch = path[i]!;
    if (ch === "?" || ch === "#") {
      end = i;
      break;
    }
  }
  path = path.slice(0, end);
  let spaced = "";
  for (let i = 0; i < path.length; i += 1) {
    const ch = path[i]!;
    if (ch === "/" || ch === "-" || ch === "_") spaced += " ";
    else spaced += ch;
  }
  return normalizePlaceKey(spaced);
}

function placeEntityTokens(entityKey: string): string[] {
  const out: string[] = [];
  const parts = entityKey.split(" ");
  for (const p of parts) {
    const t = p.trim();
    if (t) out.push(t);
  }
  return out;
}

function haystackHasToken(haystack: string, token: string): boolean {
  if (!token) return true;
  if (haystack.includes(token)) return true;
  if (token === "centre" && haystack.includes("center")) return true;
  if (token === "center" && haystack.includes("centre")) return true;
  return false;
}

function haystackHasAllPlaceTokens(haystack: string, tokens: string[]): boolean {
  if (!tokens.length) return false;
  for (const t of tokens) {
    if (!haystackHasToken(haystack, t)) return false;
  }
  return true;
}

export type SapPlaceMatchResult = {
  match: boolean;
  /** 3 = exact slug/title/url; 2 = full entity contained; 1 = all place tokens present. */
  score: number;
};

/**
 * Match place entity against SAP page title, slug, keyword, or pageUrl.
 * Prefer exact equality; then full-string contain; then token fuzzy (all place tokens).
 */
export function sapPageMatchesPlaceEntity(params: {
  placeEntity: string;
  title?: string;
  slug?: string;
  keyword?: string;
  pageUrl?: string;
}): SapPlaceMatchResult {
  const entity = normalizePlaceKey(params.placeEntity);
  if (!entity) return { match: false, score: 0 };

  const titleKey = normalizePlaceKey(params.title ?? "");
  const slugKey = placeKeyFromSlug(params.slug ?? "");
  const keywordKey = normalizePlaceKey(params.keyword ?? "");
  const urlKey = placeKeyFromPageUrl(params.pageUrl ?? "");
  const tokens = placeEntityTokens(entity);

  if (slugKey === entity || titleKey === entity || urlKey === entity) {
    return { match: true, score: 3 };
  }
  if (
    (titleKey && titleKey.includes(entity)) ||
    (slugKey && slugKey.includes(entity)) ||
    (urlKey && urlKey.includes(entity)) ||
    (keywordKey && (keywordKey === entity || keywordKey.includes(entity)))
  ) {
    return { match: true, score: 2 };
  }

  const haystack = normalizePlaceKey(
    [titleKey, slugKey, keywordKey, urlKey].filter(Boolean).join(" "),
  );
  if (haystackHasAllPlaceTokens(haystack, tokens)) {
    return { match: true, score: 1 };
  }
  return { match: false, score: 0 };
}

function attrFromTag(tag: string, name: string): string {
  const lower = tag.toLowerCase();
  const needle = `${name.toLowerCase()}=`;
  const i = lower.indexOf(needle);
  if (i < 0) return "";
  let j = i + needle.length;
  if (j >= tag.length) return "";
  const q = tag[j];
  if (q !== '"' && q !== "'") return "";
  j += 1;
  const end = tag.indexOf(q, j);
  if (end < 0) return "";
  return tag.slice(j, end).trim();
}

function isHttpUrl(url: string): boolean {
  return url.startsWith("http://") || url.startsWith("https://");
}

/**
 * Prefer Local Image / wp-image figure, else first http(s) body img.
 * Ignores empty and non-http srcs. Featured media is never in content HTML.
 * Returns the image hit and the HTML span to strip (wrapping figure when present).
 */
export function locatePreferredBodyImageInHtml(html: string): {
  url: string;
  alt?: string;
  start: number;
  end: number;
} | null {
  const raw = String(html || "");
  if (!raw) return null;
  const lower = raw.toLowerCase();
  let preferred: { url: string; alt?: string; start: number; end: number } | null =
    null;
  let fallback: { url: string; alt?: string; start: number; end: number } | null =
    null;
  let idx = 0;
  while (idx < lower.length) {
    const img = lower.indexOf("<img", idx);
    if (img < 0) break;
    const tagEnd = lower.indexOf(">", img);
    if (tagEnd < 0) break;
    const tag = raw.slice(img, tagEnd + 1);
    const src = attrFromTag(tag, "src");
    if (!isHttpUrl(src)) {
      idx = tagEnd + 1;
      continue;
    }
    const altRaw = attrFromTag(tag, "alt");
    const alt = altRaw.trim() || undefined;
    const classAttr = attrFromTag(tag, "class").toLowerCase();
    const lookBehind = lower.slice(Math.max(0, img - 240), img);
    const figOpenRel = lookBehind.lastIndexOf("<figure");
    const figCloseRel = lookBehind.lastIndexOf("</figure");
    const inFigure = figOpenRel >= 0 && figOpenRel > figCloseRel;
    const isPreferred = classAttr.includes("wp-image") || inFigure;
    let start = img;
    let end = tagEnd + 1;
    if (inFigure) {
      const figOpenAbs = img - lookBehind.length + figOpenRel;
      const figCloseAbs = lower.indexOf("</figure>", tagEnd + 1);
      if (figOpenAbs >= 0 && figCloseAbs >= 0) {
        start = figOpenAbs;
        end = figCloseAbs + "</figure>".length;
      }
    }
    const hit = { url: src, alt, start, end };
    if (isPreferred) {
      if (!preferred) preferred = hit;
    } else if (!fallback) {
      fallback = hit;
    }
    if (preferred) return preferred;
    idx = tagEnd + 1;
  }
  return preferred || fallback;
}

export function extractPreferredBodyImageFromHtml(
  html: string,
): { url: string; alt?: string } | null {
  const hit = locatePreferredBodyImageInHtml(html);
  if (!hit) return null;
  return { url: hit.url, alt: hit.alt };
}

/** Remove the preferred body Local Image figure/img (same target as extract). */
export function stripPreferredBodyImageFromHtml(html: string): string {
  const hit = locatePreferredBodyImageInHtml(html);
  if (!hit) return html;
  return `${html.slice(0, hit.start)}${html.slice(hit.end)}`;
}

/** True when body HTML already has a usable in-content (local) image. */
export function htmlHasLocalInContentImage(html: string): boolean {
  return Boolean(extractPreferredBodyImageFromHtml(html));
}

function trimTrailingSlashes(url: string): string {
  let s = url.trim().toLowerCase();
  while (s.endsWith("/")) s = s.slice(0, -1);
  return s;
}

/** Same host/path ignoring trailing slashes (current site vs peers). */
export function sameWordPressSiteUrl(a: string, b: string): boolean {
  const left = trimTrailingSlashes(a);
  const right = trimTrailingSlashes(b);
  return Boolean(left && right && left === right);
}

/** True when `candidate` is the site we are writing to (never search it for peer images). */
export function isCurrentConnectedSite(
  candidate: Pick<WordPressSite, "id" | "siteUrl" | "productionSiteUrl">,
  current: Pick<WordPressSite, "id" | "siteUrl" | "productionSiteUrl">,
): boolean {
  if (candidate.id && current.id && candidate.id === current.id) return true;
  const candUrls = [
    candidate.siteUrl,
    candidate.productionSiteUrl,
  ]
    .map((u) => (u || "").trim())
    .filter(Boolean);
  const curUrls = [
    current.siteUrl,
    current.productionSiteUrl,
  ]
    .map((u) => (u || "").trim())
    .filter(Boolean);
  for (const a of candUrls) {
    for (const b of curUrls) {
      if (sameWordPressSiteUrl(a, b)) return true;
    }
  }
  return false;
}

function urlsEqual(a: string, b: string): boolean {
  return sameWordPressSiteUrl(a, b);
}

export function siteEnabledForSapSearch(site: WordPressSite): boolean {
  // Peer image reuse uses all connected SAP sites with creds + entity sitemap.
  // Do not gate on site.enabled — that flag is the Integrations "active site" switch,
  // and peers are normally disabled while one site is selected.
  if (!site.entitySitemapUrl?.trim()) return false;
  if (!site.username?.trim() || !site.appPassword?.trim()) return false;
  return Boolean(entityEndpointFromSite(site));
}

function peerIndexCacheKey(sites: WordPressSite[]): string {
  return sites
    .map((s) => `${s.id}|${trimTrailingSlashes(s.siteUrl)}|${(s.entitySitemapUrl || "").trim()}`)
    .sort()
    .join("||");
}

function entryFromInventoryRow(
  site: WordPressSite,
  collection: string,
  row: {
    id?: number | string;
    url?: string;
    slug?: string;
    fields?: { title?: string; keyword?: string; content?: string };
  },
): SapPeerEntityEntry | null {
  const pageUrl = (row.url ?? "").trim();
  if (!pageUrl) return null;
  const id = Number(row.id);
  const contentHtml = (row.fields?.content ?? "").trim() || undefined;
  let imageUrl: string | undefined;
  let imageAlt: string | undefined;
  if (contentHtml) {
    const img = extractPreferredBodyImageFromHtml(contentHtml);
    if (img) {
      imageUrl = img.url;
      imageAlt = img.alt;
    }
  }
  return {
    siteId: site.id,
    siteName: (site.name || "").trim() || site.siteUrl,
    siteUrl: site.siteUrl,
    collection,
    pageUrl,
    id: Number.isFinite(id) && id > 0 ? id : 0,
    title: (row.fields?.title ?? "").trim(),
    slug: (row.slug ?? "").trim(),
    keyword: (row.fields?.keyword ?? "").trim(),
    contentHtml,
    imageUrl,
    imageAlt,
  };
}

async function loadPeerSiteEntries(site: WordPressSite): Promise<SapPeerEntityEntry[]> {
  const collection = entityEndpointFromSite(site);
  if (!collection) return [];

  const warm = getEntitySiteWarmCacheIfReady(site.id);
  const warmRows = warm?.bulkInventoryRows ?? [];
  if (warmRows.length) {
    const fromWarm: SapPeerEntityEntry[] = [];
    for (const row of warmRows) {
      if (!isEntityInventoryRow(row, collection)) continue;
      const entry = entryFromInventoryRow(site, collection, row);
      if (entry) fromWarm.push(entry);
    }
    if (fromWarm.length) {
      const withKw = fromWarm.filter((e) => Boolean(e.keyword?.trim())).length;
      // #region agent log
      // #endregion
      return fromWarm;
    }
  }

  const meta = await fetchOverviewSapInventoryFromEntitySitemap(site, collection, {
    includeContent: false,
  });
  const out: SapPeerEntityEntry[] = [];
  for (const row of meta.rows ?? []) {
    const entry = entryFromInventoryRow(site, collection, row as OverviewInventoryRow);
    if (entry) out.push(entry);
  }
  const withKw = out.filter((e) => Boolean(e.keyword?.trim())).length;
  // #region agent log
  // #endregion
  return out;
}

const peerIndexByKey = new Map<string, SapPeerEntityIndex>();
const peerIndexInflight = new Map<string, Promise<SapPeerEntityIndex>>();
/** Per-site entity URL rows — shared across keywords for the app session. */
const peerSiteEntriesCache = new Map<string, SapPeerEntityEntry[]>();
const peerSiteEntriesInflight = new Map<string, Promise<SapPeerEntityEntry[]>>();

function peerSiteEntriesCacheKey(site: WordPressSite): string {
  return `${site.id}|${(site.entitySitemapUrl || "").trim()}`;
}

async function loadPeerSiteEntriesCached(site: WordPressSite): Promise<SapPeerEntityEntry[]> {
  const key = peerSiteEntriesCacheKey(site);
  const cached = peerSiteEntriesCache.get(key);
  if (cached) {
    // #region agent log
    // #endregion
    return cached;
  }
  const inflight = peerSiteEntriesInflight.get(key);
  if (inflight) return inflight;
  // #region agent log
  // #endregion
  const p = (async () => {
    const entries = await loadPeerSiteEntries(site);
    peerSiteEntriesCache.set(key, entries);
    // #region agent log
    // #endregion
    return entries;
  })();
  peerSiteEntriesInflight.set(key, p);
  try {
    return await p;
  } finally {
    peerSiteEntriesInflight.delete(key);
  }
}

/**
 * Load every eligible peer inventory once (parallel). Later Local Image keywords reuse the session cache.
 */
export async function prewarmSapPeerSiteInventories(
  sites: WordPressSite[],
): Promise<void> {
  const eligible = (sites ?? []).filter(siteEnabledForSapSearch);
  if (!eligible.length) return;
  await Promise.all(eligible.map((site) => loadPeerSiteEntriesCached(site)));
}

/**
 * Build (or reuse) a local entity URL index for connected SAP sites.
 * Loads each site once (per-site cache), sequentially.
 */
export async function ensureSapPeerEntityIndex(
  sites: WordPressSite[],
): Promise<SapPeerEntityIndex> {
  const eligible = (sites ?? []).filter(siteEnabledForSapSearch);
  const cacheKey = peerIndexCacheKey(eligible);
  const existing = peerIndexByKey.get(cacheKey);
  if (existing) return existing;

  const inflight = peerIndexInflight.get(cacheKey);
  if (inflight) return inflight;

  const build = (async () => {
    const entriesBySiteId = new Map<string, SapPeerEntityEntry[]>();
    let entryCount = 0;

    for (const site of eligible) {
      const entries = await loadPeerSiteEntriesCached(site);
      entriesBySiteId.set(site.id, entries);
      entryCount += entries.length;
    }

    const index: SapPeerEntityIndex = {
      cacheKey,
      builtAt: Date.now(),
      sitesInOrder: eligible,
      entriesBySiteId,
      entryCount,
    };
    peerIndexByKey.set(cacheKey, index);
    return index;
  })();

  peerIndexInflight.set(cacheKey, build);
  try {
    return await build;
  } finally {
    peerIndexInflight.delete(cacheKey);
  }
}

/** Test helper: drop in-memory peer indexes. */
export function clearSapPeerEntityIndexCache(): void {
  peerIndexByKey.clear();
  peerIndexInflight.clear();
  peerSiteEntriesCache.clear();
  peerSiteEntriesInflight.clear();
  clearSapPeerMarketSelectCache();
}

async function hydrateEntryContent(
  site: WordPressSite,
  entry: SapPeerEntityEntry,
): Promise<void> {
  if (entry.imageUrl) return;
  if (entry.contentHtml) {
    const img = extractPreferredBodyImageFromHtml(entry.contentHtml);
    if (img) {
      entry.imageUrl = img.url;
      entry.imageAlt = img.alt;
    }
    return;
  }
  if (!entry.id || !site.username?.trim() || !site.appPassword?.trim()) return;
  const bulk = await getSiteInventoryBulk(site.siteUrl, site.username, site.appPassword, {
    includeContent: true,
    collections: [entry.collection],
    includeIds: [entry.id],
  });
  const row = (bulk.rows ?? []).find((r) => Number(r.id) === entry.id) as OverviewInventoryRow | undefined;
  const html = (row?.fields?.content ?? "").trim();
  if (!html) return;
  entry.contentHtml = html;
  const img = extractPreferredBodyImageFromHtml(html);
  if (img) {
    entry.imageUrl = img.url;
    entry.imageAlt = img.alt;
  }
}

async function searchCachedSite(params: {
  site: WordPressSite;
  entries: SapPeerEntityEntry[];
  placeEntity: string;
  excludePageUrl?: string;
}): Promise<SapCrossSiteImageHit | null> {
  const { site, entries, placeEntity } = params;
  const exclude = (params.excludePageUrl ?? "").trim();
  const ranked: Array<{ entry: SapPeerEntityEntry; score: number }> = [];
  for (const entry of entries) {
    if (exclude && urlsEqual(entry.pageUrl, exclude)) continue;
    const m = sapPageMatchesPlaceEntity({
      placeEntity,
      title: entry.title,
      slug: entry.slug,
      keyword: entry.keyword,
      pageUrl: entry.pageUrl,
    });
    if (!m.match) continue;
    ranked.push({ entry, score: m.score });
  }
  ranked.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    const aImg = a.entry.imageUrl ? 1 : 0;
    const bImg = b.entry.imageUrl ? 1 : 0;
    return bImg - aImg;
  });
  if (!ranked.length) {
    // #region agent log
    // #endregion
    return null;
  }

  let hydrateTried = 0;
  let hydrateWithImage = 0;
  let remoteFetches = 0;
  for (const { entry, score } of ranked) {
    const needsRemote =
      !entry.imageUrl &&
      !entry.contentHtml &&
      Boolean(entry.id) &&
      Boolean(site.username?.trim()) &&
      Boolean(site.appPassword?.trim());
    if (needsRemote && remoteFetches >= MAX_CONTENT_FETCHES_PER_SITE) continue;
    if (needsRemote) remoteFetches += 1;
    await hydrateEntryContent(site, entry);
    hydrateTried += 1;
    if (!entry.imageUrl) continue;
    hydrateWithImage += 1;
    // #region agent log
    // #endregion
    return {
      imageUrl: entry.imageUrl,
      alt: entry.imageAlt,
      sourceSiteName: entry.siteName,
      sourceSiteUrl: entry.siteUrl,
      sourcePageUrl: entry.pageUrl,
      score,
    };
  }
  // #region agent log
  // #endregion
  return null;
}

function csvEscapeCell(value: string): string {
  const raw = String(value ?? "");
  let needsQuotes = false;
  for (let i = 0; i < raw.length; i += 1) {
    const ch = raw[i]!;
    if (ch === "," || ch === '"' || ch === "\n" || ch === "\r") {
      needsQuotes = true;
      break;
    }
  }
  if (!needsQuotes) return raw;
  let escaped = '"';
  for (let i = 0; i < raw.length; i += 1) {
    const ch = raw[i]!;
    escaped += ch === '"' ? '""' : ch;
  }
  escaped += '"';
  return escaped;
}

function normalizeCityMatchKey(value: string): string {
  const raw = String(value ?? "").trim().toLowerCase();
  let out = "";
  let space = false;
  for (let i = 0; i < raw.length; i += 1) {
    const ch = raw[i]!;
    if (ch === " " || ch === "\t" || ch === "\n" || ch === "\r") {
      space = true;
      continue;
    }
    if (space && out.length > 0) out += " ";
    space = false;
    out += ch;
  }
  return out;
}

/**
 * Peer qualifies when any SAP inventory pageUrl/slug/title fuzzy-contains the market city
 * (e.g. edmonton in .../edmonton-city-centre/). No NAP.
 */
export function peerInventoryFuzzyMatchesCity(
  marketCity: string,
  entries: Array<{ pageUrl?: string; slug?: string; title?: string }>,
): { matched: boolean; matchCount: number; sampleUrl: string | null } {
  const cityKey = normalizeCityMatchKey(marketCity);
  if (!cityKey) return { matched: false, matchCount: 0, sampleUrl: null };
  let matchCount = 0;
  let sampleUrl: string | null = null;
  for (const entry of entries) {
    const haystack = normalizeCityMatchKey(
      [(entry.pageUrl || "").trim(), (entry.slug || "").trim(), (entry.title || "").trim()]
        .filter(Boolean)
        .join(" "),
    );
    if (!haystack.includes(cityKey)) continue;
    matchCount += 1;
    if (!sampleUrl) sampleUrl = (entry.pageUrl || "").trim() || null;
  }
  return { matched: matchCount > 0, matchCount, sampleUrl };
}

/** Full SAP entity inventory CSV for one peer (images when known). */
export function formatSapPeerLibraryCsv(
  site: Pick<WordPressSite, "name" | "siteUrl">,
  entries: SapPeerEntityEntry[],
): string {
  const lines = ["site,title,pageUrl,slug,keyword,imageUrl"];
  for (const row of sapPeerLibraryCsvDataRows(site, entries)) {
    lines.push(row);
  }
  return lines.join("\n");
}

function sapPeerLibraryCsvDataRows(
  site: Pick<WordPressSite, "name" | "siteUrl">,
  entries: SapPeerEntityEntry[],
): string[] {
  const siteName = (site.name || "").trim() || site.siteUrl || "peer";
  const rows: string[] = [];
  for (const entry of entries) {
    rows.push(
      [
        csvEscapeCell(siteName),
        csvEscapeCell(entry.title || ""),
        csvEscapeCell(entry.pageUrl || ""),
        csvEscapeCell(entry.slug || ""),
        csvEscapeCell(entry.keyword || ""),
        csvEscapeCell(entry.imageUrl || ""),
      ].join(","),
    );
  }
  return rows;
}

/** One CSV with all city-matched peer inventories appended (shared header). */
export function formatCombinedSapPeerLibraryCsv(
  libraries: Array<{
    site: Pick<WordPressSite, "name" | "siteUrl">;
    entries: SapPeerEntityEntry[];
  }>,
): string {
  const lines = ["site,title,pageUrl,slug,keyword,imageUrl"];
  for (const lib of libraries) {
    for (const row of sapPeerLibraryCsvDataRows(lib.site, lib.entries)) {
      lines.push(row);
    }
  }
  return lines.join("\n");
}

export function buildCombinedSapPeerLibraryCsvFile(
  libraries: Array<{
    site: Pick<WordPressSite, "name" | "siteUrl">;
    entries: SapPeerEntityEntry[];
  }>,
): SapPeerLibraryCsvFile {
  return {
    name: COMBINED_PEER_LOCAL_IMAGES_CSV_NAME,
    content: formatCombinedSapPeerLibraryCsv(libraries),
    mimeType: "text/csv;charset=utf-8",
  };
}

export function buildSapPeerLibraryCsvFile(
  site: Pick<WordPressSite, "name" | "siteUrl">,
  entries: SapPeerEntityEntry[],
): SapPeerLibraryCsvFile {
  const slug = peerLocalImagesCsvFileSlug((site.name || "").trim() || site.siteUrl || "peer");
  return {
    name: `peer-local-images-${slug}.csv`,
    content: formatSapPeerLibraryCsv(site, entries),
    mimeType: "text/csv;charset=utf-8",
  };
}

/**
 * Search same-market peer SAP sites for an in-content image.
 * Builds one combined CSV for all city-matched peers;
 * first entity body-image hit is kept for reuse.
 */
export async function searchSapCrossSiteInContentImage(params: {
  sites: WordPressSite[];
  placeEntity: string;
  apiKey: string;
  model?: string;
  excludePageUrl?: string;
  /** Site receiving the new image — never searched for peer reuse. */
  excludeSite?: Pick<WordPressSite, "id" | "siteUrl" | "productionSiteUrl" | "napInfo" | "name">;
  /** @deprecated prefer excludeSite */
  excludeSiteUrl?: string;
  /** Optional progress: peerIndex is 0-based among selected market peers. */
  onPeerProgress?: (info: {
    peerIndex: number;
    peerTotal: number;
    siteName: string;
  }) => void;
  /** Fired once market peers are known, before any library crawl. */
  onPeerPlanReady?: (
    peers: Array<{ name: string; siteUrl: string }>,
  ) => void;
  /** Fired after each peer library CSV is built (incremental Details downloads). */
  onPeerCsvReady?: (file: SapPeerLibraryCsvFile) => void;
}): Promise<SapCrossSiteImageSearchResult> {
  const empty: SapCrossSiteImageSearchResult = { hit: null, peerCsvFiles: [] };
  const placeEntityRaw = (params.placeEntity || "").trim();
  if (!placeEntityRaw) return empty;
  if (!params.apiKey?.trim()) {
    // #region agent log
    // #endregion
    return empty;
  }

  const incoming = params.sites ?? [];
  const excludeSite = params.excludeSite;
  const excludeSiteUrl = (params.excludeSiteUrl ?? excludeSite?.siteUrl ?? "").trim();
  let sites = incoming.filter(siteEnabledForSapSearch);
  if (excludeSite) {
    sites = sites.filter((s) => !isCurrentConnectedSite(s, excludeSite));
  } else if (excludeSiteUrl) {
    sites = sites.filter((s) => !sameWordPressSiteUrl(s.siteUrl, excludeSiteUrl));
  }
  // #region agent log
  // #endregion
  if (!sites.length) return empty;

  const marketCity = await resolveMarketCityForPlaceEntity({
    placeEntity: placeEntityRaw,
    apiKey: params.apiKey,
    model: params.model,
    writeSite: excludeSite ?? null,
  });
  // #region agent log
  // #endregion
  if (!marketCity) {
    // #region agent log
    // #endregion
    return empty;
  }

  // Phase 1: load every peer inventory in parallel, city-match on sitemap URLs,
  // then publish the FULL matched list + CSVs before any image search.
  type MatchedPeer = { site: WordPressSite; entries: SapPeerEntityEntry[] };
  const planSites = sites.filter(
    (site) => !(excludeSite && isCurrentConnectedSite(site, excludeSite)),
  );

  const planResults = await Promise.all(
    planSites.map(async (site, i) => {
      params.onPeerProgress?.({
        peerIndex: i,
        peerTotal: planSites.length,
        siteName: (site.name || site.siteUrl || "").trim(),
      });
      try {
        const entries = await loadPeerSiteEntriesCached(site);
        const urlMatch = peerInventoryFuzzyMatchesCity(marketCity, entries);
        // #region agent log
        // #endregion
        return { site, entries, matched: urlMatch.matched };
      } catch (err) {
        // #region agent log
        // #endregion
        return { site, entries: [] as SapPeerEntityEntry[], matched: false };
      }
    }),
  );

  const matched: MatchedPeer[] = planResults
    .filter((r) => r.matched)
    .map((r) => ({ site: r.site, entries: r.entries }));

  // #region agent log
  // #endregion

  if (!matched.length) {
    return empty;
  }

  params.onPeerPlanReady?.(
    matched.map(({ site }) => ({
      name: (site.name || "").trim() || site.siteUrl || "peer",
      siteUrl: (site.siteUrl || "").trim(),
    })),
  );
  const earlyCombined = buildCombinedSapPeerLibraryCsvFile(matched);
  params.onPeerCsvReady?.(earlyCombined);

  // Phase 2: parallel image search among city-matched peers; first ordered hit wins.
  const phase2Results = await Promise.all(
    matched.map(async ({ site, entries }, i) => {
      params.onPeerProgress?.({
        peerIndex: i,
        peerTotal: matched.length,
        siteName: (site.name || site.siteUrl || "").trim(),
      });
      try {
        const found = await searchCachedSite({
          site,
          entries,
          placeEntity: placeEntityRaw,
          excludePageUrl: params.excludePageUrl,
        });
        const hitOk =
          Boolean(found) &&
          !(excludeSite && found && sameWordPressSiteUrl(found.sourceSiteUrl, excludeSite.siteUrl));
        // #region agent log
        // #endregion
        return {
          index: i,
          found: hitOk ? found : null,
        };
      } catch (err) {
        // #region agent log
        // #endregion
        return {
          index: i,
          found: null as SapCrossSiteImageHit | null,
        };
      }
    }),
  );

  phase2Results.sort((a, b) => a.index - b.index);
  let hit: SapCrossSiteImageHit | null = null;
  for (const row of phase2Results) {
    if (!hit && row.found) hit = row.found;
  }

  // Rebuild after hydrate so imageUrl columns include body images found during search.
  const combinedCsv = buildCombinedSapPeerLibraryCsvFile(matched);
  params.onPeerCsvReady?.(combinedCsv);
  const peerCsvFiles: SapPeerLibraryCsvFile[] = [combinedCsv];

  // #region agent log
  // #endregion

  return { hit, peerCsvFiles };
}
