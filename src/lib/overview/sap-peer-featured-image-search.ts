/**
 * Peer-site FEATURED image search for the bulk generators.
 *
 * Two strictly separate modes:
 * - "entity" (SAP only): city filter BEFORE any download (NAP cities vs market
 *   city), then place-entity match against peer entity-sitemap collections.
 * - "blog": word-order-insensitive keyword match against peer blog posts only.
 *
 * The target/write site is never searched.
 */

import type { WordPressSite } from "@/components/integrations/types";
import { backendApiUrl } from "@/lib/wordpress-api/connection";
import { neoPulseApiHeaders } from "@/lib/neo-pulse-api-headers";
import { getSiteInventoryBulk } from "@/lib/wordpress-api";
import type { SiteInventoryBulkRow } from "@/lib/wordpress-api/types";
import { fetchOverviewSapInventoryFromEntitySitemap } from "@/lib/overview/overview-sap-entity-inventory";
import { entityEndpointFromSite } from "@/lib/sitemap-optimizer/entity-compression-profile";
import {
  isCurrentConnectedSite,
  sapPageMatchesPlaceEntity,
  siteEnabledForSapSearch,
} from "@/lib/overview/sap-cross-site-image-search";
import {
  peersMatchingMarketCity,
  resolveMarketCityForPlaceEntity,
} from "@/lib/overview/sap-peer-market-select";
import { scorePeerRowKeywordMatch } from "@/lib/overview/peer-featured-image-match";

export type PeerFeaturedImageMode = "entity" | "blog";

export type PeerFeaturedRow = {
  siteId: string;
  siteName: string;
  siteUrl: string;
  pageUrl: string;
  title: string;
  slug: string;
  keyword: string;
  featuredMediaId: number;
  featuredImageUrl?: string;
};

export type PeerFeaturedImageHit = {
  imageUrl: string;
  mediaId: number;
  sourceSiteName: string;
  sourceSiteUrl: string;
  sourcePageUrl: string;
  score: number;
  matchedKeyword: string;
};

export type PeerFeaturedLibraryCsvFile = {
  name: string;
  content: string;
  mimeType: string;
};

export type PeerFeaturedImageSearchResult = {
  hit: PeerFeaturedImageHit | null;
  csvFile: PeerFeaturedLibraryCsvFile | null;
};

const MAX_RESOLVE_CANDIDATES = 8;

/* ------------------------------------------------------------------ */
/* Peer inventory loading (session cache; each peer downloaded once)   */
/* ------------------------------------------------------------------ */

const peerRowsCache = new Map<string, PeerFeaturedRow[]>();
const peerRowsInflight = new Map<string, Promise<PeerFeaturedRow[]>>();

function peerRowsCacheKey(site: WordPressSite, mode: PeerFeaturedImageMode): string {
  return `${mode}|${site.id}|${(site.entitySitemapUrl || "").trim()}`;
}

function rowToPeerFeaturedRow(
  site: WordPressSite,
  row: Pick<SiteInventoryBulkRow, "url" | "slug" | "fields" | "featuredMediaId">,
): PeerFeaturedRow | null {
  const pageUrl = (row.url ?? "").trim();
  const mediaId = Number(row.featuredMediaId);
  if (!pageUrl || !Number.isFinite(mediaId) || mediaId < 1) return null;
  return {
    siteId: site.id,
    siteName: (site.name || "").trim() || site.siteUrl,
    siteUrl: site.siteUrl,
    pageUrl,
    title: (row.fields?.title ?? "").trim(),
    slug: (row.slug ?? "").trim(),
    keyword: (row.fields?.keyword ?? "").trim(),
    featuredMediaId: mediaId,
  };
}

async function loadPeerRows(
  site: WordPressSite,
  mode: PeerFeaturedImageMode,
): Promise<PeerFeaturedRow[]> {
  const out: PeerFeaturedRow[] = [];
  if (mode === "entity") {
    const collection = entityEndpointFromSite(site);
    if (!collection) return [];
    const meta = await fetchOverviewSapInventoryFromEntitySitemap(site, collection, {
      includeContent: false,
    });
    for (const row of meta.rows ?? []) {
      const entry = rowToPeerFeaturedRow(site, row);
      if (entry) out.push(entry);
    }
    return out;
  }
  const bulk = await getSiteInventoryBulk(site.siteUrl, site.username!, site.appPassword!, {
    includeContent: false,
    collections: ["posts"],
  });
  for (const row of bulk.rows ?? []) {
    const entry = rowToPeerFeaturedRow(site, row);
    if (entry) out.push(entry);
  }
  return out;
}

async function loadPeerRowsCached(
  site: WordPressSite,
  mode: PeerFeaturedImageMode,
): Promise<PeerFeaturedRow[]> {
  const key = peerRowsCacheKey(site, mode);
  const cached = peerRowsCache.get(key);
  if (cached) return cached;
  const inflight = peerRowsInflight.get(key);
  if (inflight) return inflight;
  const p = (async () => {
    const rows = await loadPeerRows(site, mode);
    peerRowsCache.set(key, rows);
    return rows;
  })();
  peerRowsInflight.set(key, p);
  try {
    return await p;
  } finally {
    peerRowsInflight.delete(key);
  }
}

/** Test helper: drop the in-memory peer featured inventories. */
export function clearPeerFeaturedImageSearchCache(): void {
  peerRowsCache.clear();
  peerRowsInflight.clear();
}

/* ------------------------------------------------------------------ */
/* Featured media URL resolve (batched per peer)                       */
/* ------------------------------------------------------------------ */

async function resolveFeaturedMediaUrls(
  site: WordPressSite,
  mediaIds: number[],
): Promise<Record<number, string>> {
  if (!mediaIds.length) return {};
  const res = await fetch(backendApiUrl("/wordpress/resolve-featured-media"), {
    method: "POST",
    headers: neoPulseApiHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({
      siteUrl: site.siteUrl,
      username: site.username,
      appPassword: site.appPassword,
      mediaIds,
    }),
  });
  const data = (await res.json().catch(() => ({}))) as {
    urls?: Record<string, string>;
  };
  if (!res.ok || !data.urls) return {};
  const out: Record<number, string> = {};
  for (const [id, url] of Object.entries(data.urls)) {
    const n = Number(id);
    if (Number.isFinite(n) && typeof url === "string" && url.startsWith("http")) {
      out[n] = url;
    }
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Peer library CSV                                                    */
/* ------------------------------------------------------------------ */

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

export function formatPeerFeaturedLibraryCsv(rows: PeerFeaturedRow[]): string {
  const lines = ["site,title,pageUrl,slug,keyword,featuredMediaId,featuredImageUrl"];
  for (const row of rows) {
    lines.push(
      [
        csvEscapeCell(row.siteName),
        csvEscapeCell(row.title),
        csvEscapeCell(row.pageUrl),
        csvEscapeCell(row.slug),
        csvEscapeCell(row.keyword),
        csvEscapeCell(String(row.featuredMediaId)),
        csvEscapeCell(row.featuredImageUrl || ""),
      ].join(","),
    );
  }
  return lines.join("\n");
}

export function peerFeaturedLibraryCsvName(mode: PeerFeaturedImageMode): string {
  return mode === "entity" ? "peer-featured-library-sap.csv" : "peer-featured-library-blogs.csv";
}

export function buildPeerFeaturedLibraryCsvFile(
  mode: PeerFeaturedImageMode,
  rows: PeerFeaturedRow[],
): PeerFeaturedLibraryCsvFile {
  return {
    name: peerFeaturedLibraryCsvName(mode),
    content: formatPeerFeaturedLibraryCsv(rows),
    mimeType: "text/csv;charset=utf-8",
  };
}

/* ------------------------------------------------------------------ */
/* Ranking                                                             */
/* ------------------------------------------------------------------ */

type RankedRow = { row: PeerFeaturedRow; score: number; matchedKeyword: string };

export function rankPeerRowsForEntity(
  rows: PeerFeaturedRow[],
  placeEntity: string,
): RankedRow[] {
  const ranked: RankedRow[] = [];
  for (const row of rows) {
    const m = sapPageMatchesPlaceEntity({
      placeEntity,
      title: row.title,
      slug: row.slug,
      keyword: row.keyword,
      pageUrl: row.pageUrl,
    });
    if (!m.match) continue;
    ranked.push({ row, score: m.score, matchedKeyword: row.keyword || row.title });
  }
  ranked.sort((a, b) => b.score - a.score);
  return ranked;
}

export function rankPeerRowsForBlogKeyword(
  rows: PeerFeaturedRow[],
  keyword: string,
): RankedRow[] {
  const ranked: RankedRow[] = [];
  for (const row of rows) {
    const m = scorePeerRowKeywordMatch(row, keyword);
    if (!m.match) continue;
    ranked.push({ row, score: m.score, matchedKeyword: m.matchedText });
  }
  ranked.sort((a, b) => b.score - a.score);
  return ranked;
}

/* ------------------------------------------------------------------ */
/* Search                                                              */
/* ------------------------------------------------------------------ */

export async function searchPeerFeaturedImage(params: {
  sites: WordPressSite[];
  /** Target/write site — never searched. */
  excludeSite: Pick<WordPressSite, "id" | "siteUrl" | "productionSiteUrl" | "napInfo" | "name">;
  mode: PeerFeaturedImageMode;
  /** Entity mode: SAP place entity. */
  placeEntity?: string;
  /** Blog mode: the new post's focus keyword. */
  keyword?: string;
  /** OpenRouter key (entity mode market-city resolve). */
  apiKey?: string;
  model?: string;
  /** Fired once the searched peer library is known (for run file downloads). */
  onPeerCsvReady?: (file: PeerFeaturedLibraryCsvFile) => void;
}): Promise<PeerFeaturedImageSearchResult> {
  const empty: PeerFeaturedImageSearchResult = { hit: null, csvFile: null };
  const { mode, excludeSite } = params;

  let peers = (params.sites ?? []).filter(
    (s) => Boolean(s?.id) && !isCurrentConnectedSite(s, excludeSite),
  );

  if (mode === "entity") {
    const placeEntity = (params.placeEntity || "").trim();
    if (!placeEntity) return empty;
    peers = peers.filter(siteEnabledForSapSearch);
    if (!peers.length) return empty;

    // City filter BEFORE any inventory download (NAP / name / url city match).
    const marketCity = await resolveMarketCityForPlaceEntity({
      placeEntity,
      apiKey: params.apiKey || "",
      model: params.model,
      writeSite: excludeSite,
    });
    if (marketCity) {
      const cityMatched = new Set(
        peersMatchingMarketCity(marketCity, peers).map((p) => p.id),
      );
      peers = peers.filter((p) => cityMatched.has(p.id));
    }
    if (!peers.length) return empty;

    const perPeerRows = await Promise.all(
      peers.map((site) => loadPeerRowsCached(site, "entity").catch(() => [] as PeerFeaturedRow[])),
    );
    const allRows = perPeerRows.flat();
    const ranked = rankPeerRowsForEntity(allRows, placeEntity);
    return finishSearch({ mode, peers, allRows, ranked, onPeerCsvReady: params.onPeerCsvReady });
  }

  const keyword = (params.keyword || "").trim();
  if (!keyword) return empty;
  peers = peers.filter((s) => Boolean(s.username?.trim()) && Boolean(s.appPassword?.trim()));
  if (!peers.length) return empty;

  const perPeerRows = await Promise.all(
    peers.map((site) => loadPeerRowsCached(site, "blog").catch(() => [] as PeerFeaturedRow[])),
  );
  const allRows = perPeerRows.flat();
  const ranked = rankPeerRowsForBlogKeyword(allRows, keyword);
  return finishSearch({ mode, peers, allRows, ranked, onPeerCsvReady: params.onPeerCsvReady });
}

async function finishSearch(params: {
  mode: PeerFeaturedImageMode;
  peers: WordPressSite[];
  allRows: PeerFeaturedRow[];
  ranked: RankedRow[];
  onPeerCsvReady?: (file: PeerFeaturedLibraryCsvFile) => void;
}): Promise<PeerFeaturedImageSearchResult> {
  const { mode, peers, allRows, ranked } = params;

  let hit: PeerFeaturedImageHit | null = null;
  const candidates = ranked.slice(0, MAX_RESOLVE_CANDIDATES);
  const sitesById = new Map(peers.map((p) => [p.id, p]));

  // Resolve media URLs per source site (one batched call per site involved).
  const idsBySite = new Map<string, number[]>();
  for (const c of candidates) {
    const list = idsBySite.get(c.row.siteId) ?? [];
    list.push(c.row.featuredMediaId);
    idsBySite.set(c.row.siteId, list);
  }
  const urlsBySite = new Map<string, Record<number, string>>();
  await Promise.all(
    [...idsBySite.entries()].map(async ([siteId, ids]) => {
      const site = sitesById.get(siteId);
      if (!site) return;
      const urls = await resolveFeaturedMediaUrls(site, ids).catch(() => ({}));
      urlsBySite.set(siteId, urls);
    }),
  );

  for (const c of candidates) {
    const url = urlsBySite.get(c.row.siteId)?.[c.row.featuredMediaId];
    if (!url) continue;
    c.row.featuredImageUrl = url;
    if (!hit) {
      hit = {
        imageUrl: url,
        mediaId: c.row.featuredMediaId,
        sourceSiteName: c.row.siteName,
        sourceSiteUrl: c.row.siteUrl,
        sourcePageUrl: c.row.pageUrl,
        score: c.score,
        matchedKeyword: c.matchedKeyword,
      };
    }
  }

  const csvFile = allRows.length ? buildPeerFeaturedLibraryCsvFile(mode, allRows) : null;
  if (csvFile) params.onPeerCsvReady?.(csvFile);
  return { hit, csvFile };
}
