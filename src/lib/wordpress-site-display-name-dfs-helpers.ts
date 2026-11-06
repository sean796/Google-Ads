import { resolveMcpApiBase } from "@/lib/mcp-tools";
import { hostnameFromMyBusinessInfoResponse } from "@/lib/competitor-research/competitor-grid-dfs-client";
import { normalizeCompetitorDomainKey } from "@/lib/competitor-research/competitor-domain-key";
import type { BusinessListingItem } from "@/lib/citation-research/dfs-business-listings-client";
import { loadApiKey } from "@/lib/api";
import { extractGmbDfsPlaceIdentifiers } from "@/lib/gmb-dfs-parse";
import { BACKEND_API_BASE } from "@/lib/wordpress-api/connection";

export const DFS_ABORT_MS = 180_000;
export const SERP_TREE_MAX_DEPTH = 90;
export const GBP_SEM_PIPELINE_MS = 120_000;

export type ReviewsSemanticsTaskPayload = {
  keyword?: string;
  place_id?: string;
  cid?: string;
  location_name?: string;
  location_code?: number;
  location_coordinate?: string;
  language_code: string;
  depth: number;
};

export function buildReviewsSemanticsTaskFields(params: {
  gmbJson?: unknown | null;
  keywordFallback?: string;
  locationNamePrimary: string;
  locationCoordinateFallback: string;
  depth?: number;
}): ReviewsSemanticsTaskPayload | null {
  const language_code = "en";
  const depth = params.depth ?? 30;
  const locName = params.locationNamePrimary.trim();
  const locCoord = params.locationCoordinateFallback.trim();

  const loc: Pick<ReviewsSemanticsTaskPayload, "location_name" | "location_coordinate"> = {};
  if (locName) loc.location_name = locName;
  if (locCoord) loc.location_coordinate = locCoord;
  if (!loc.location_name && !loc.location_coordinate) return null;

  if (params.gmbJson) {
    const ids = extractGmbDfsPlaceIdentifiers(params.gmbJson);
    if (ids.placeId) {
      return { place_id: ids.placeId, ...loc, language_code, depth };
    }
    if (ids.cid) {
      return { cid: ids.cid, ...loc, language_code, depth };
    }
  }

  const fb = (params.keywordFallback || "").trim();
  if (!fb) return null;
  const lower = fb.toLowerCase();
  if (lower.startsWith("place_id:")) {
    const pid = fb.slice("place_id:".length).trim();
    if (pid && /^(ChIJ|GhIJ)/i.test(pid)) {
      return { place_id: pid, ...loc, language_code, depth };
    }
  }
  if (lower.startsWith("cid:")) {
    const c = fb.slice(4).trim();
    if (/^\d+$/.test(c)) {
      return { cid: c, ...loc, language_code, depth };
    }
  }
  return { keyword: fb, ...loc, language_code, depth };
}

export function fireGbpReviewSemanticsPipeline(args: {
  siteId: string;
  openRouterApiKey?: string;
  businessTitle: string;
  task: ReviewsSemanticsTaskPayload;
}): void {
  const key = (args.openRouterApiKey || loadApiKey() || "").trim();
  if (!key) return;
  const base = (BACKEND_API_BASE || "").replace(/\/$/, "");
  if (!base) return;

  void (async () => {
    try {
      await fetch(`${base}/api/integrations/gbp-review-semantics-pipeline`, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "X-OpenRouter-Api-Key": key,
        },
        body: JSON.stringify({
          siteId: args.siteId,
          businessTitle: args.businessTitle,
          openRouterApiKey: key,
          ...args.task,
        }),
        signal: AbortSignal.timeout(GBP_SEM_PIPELINE_MS),
      });
    } catch {
      /* best-effort; do not affect name resolution */
    }
  })();
}

export function listingBizTitle(listing: BusinessListingItem | null): string {
  if (!listing) return "";
  const t = listing.title;
  const n = listing.name;
  const a = typeof t === "string" ? t.trim() : "";
  const b = typeof n === "string" ? n.trim() : "";
  return a || b;
}

function safeHostnameFromGmbJson(json: unknown): string | null {
  try {
    return hostnameFromMyBusinessInfoResponse(json);
  } catch {
    return null;
  }
}

export function gmbWebsiteHostMatchesSite(json: unknown, wantHost: string): boolean {
  if (!wantHost) return false;
  const h = safeHostnameFromGmbJson(json);
  if (!h) return false;
  return h === wantHost || wantHost.endsWith(h) || h.endsWith(wantHost);
}

function urlHostMatchesWant(urlRaw: string, wantHost: string): boolean {
  if (!urlRaw?.trim() || !wantHost) return false;
  try {
    const h = normalizeCompetitorDomainKey(urlRaw);
    return h === wantHost || wantHost.endsWith(h) || h.endsWith(wantHost);
  } catch {
    return false;
  }
}

/**
 * Walk SERP JSON (local pack, nested items, etc.) for an object whose URL matches the site host
 * and that carries a Google place_id or cid — same evidence users see on a Google results page.
 */
export function serpFindPlaceKeywordForHost(
  serpJson: unknown,
  wantHost: string,
): { keyword: string; serpTitle: string } | null {
  const seen = new WeakSet<object>();
  function walk(node: unknown, depth: number): { keyword: string; serpTitle: string } | null {
    if (depth > SERP_TREE_MAX_DEPTH || node == null || typeof node !== "object") return null;
    const o = node as Record<string, unknown>;
    if (seen.has(o)) return null;
    seen.add(o);

    const urlRaw =
      (typeof o.url === "string" && o.url) ||
      (typeof o.link === "string" && o.link) ||
      (typeof o.website === "string" && o.website) ||
      "";
    const hostOk = urlHostMatchesWant(urlRaw, wantHost);

    const title =
      (typeof o.title === "string" && o.title.trim()) ||
      (typeof o.name === "string" && o.name.trim()) ||
      "";

    const placeId = typeof o.place_id === "string" ? o.place_id.trim() : "";
    const cid = o.cid;

    if (hostOk) {
      if (placeId && /^(ChIJ|GhIJ)/i.test(placeId)) {
        const kw = placeId.startsWith("place_id:") ? placeId : `place_id:${placeId}`;
        return { keyword: kw, serpTitle: title };
      }
      if (typeof cid === "number" && Number.isFinite(cid)) {
        return { keyword: `cid:${cid}`, serpTitle: title };
      }
      const cs = typeof cid === "string" ? cid.trim() : "";
      if (cs.length > 0 && /^\d+$/.test(cs)) {
        return { keyword: `cid:${cs}`, serpTitle: title };
      }
    }

    for (const v of Object.values(o)) {
      if (Array.isArray(v)) {
        for (const x of v) {
          const r = walk(x, depth + 1);
          if (r) return r;
        }
      } else if (v && typeof v === "object") {
        const r = walk(v, depth + 1);
        if (r) return r;
      }
    }
    return null;
  }
  return walk(serpJson, 0);
}

/** First organic-like row whose URL hostname matches wantHost (title often matches knowledge panel). */
export function serpFindOrganicTitleForHost(serpJson: unknown, wantHost: string): string | null {
  const seen = new WeakSet<object>();
  function walk(node: unknown, depth: number): string | null {
    if (depth > SERP_TREE_MAX_DEPTH || node == null || typeof node !== "object") return null;
    const o = node as Record<string, unknown>;
    if (seen.has(o)) return null;
    seen.add(o);

    const typ = typeof o.type === "string" ? o.type : "";
    const urlRaw =
      (typeof o.url === "string" && o.url) ||
      (typeof o.link === "string" && o.link) ||
      "";
    const title = typeof o.title === "string" ? o.title.trim() : "";
    if ((typ === "organic" || typ === "") && title && urlRaw && urlHostMatchesWant(urlRaw, wantHost)) {
      return title;
    }

    for (const v of Object.values(o)) {
      if (Array.isArray(v)) {
        for (const x of v) {
          const r = walk(x, depth + 1);
          if (r) return r;
        }
      } else if (v && typeof v === "object") {
        const r = walk(v, depth + 1);
        if (r) return r;
      }
    }
    return null;
  }
  return walk(serpJson, 0);
}

export async function fetchSerpOrganicLiveAdvancedJson(args: {
  keyword: string;
  locationName: string;
  signal?: AbortSignal;
}): Promise<unknown | null> {
  const base = (BACKEND_API_BASE || "").replace(/\/$/, "");
  const url = `${base}/DataForSEO_serp_organic_live_advanced`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      keyword: args.keyword.trim(),
      location_name: args.locationName.trim(),
      language_code: "en",
      depth: 30,
    }),
    signal: args.signal,
  });
  const j = (await res.json()) as { error?: string };
  if (!res.ok) {
    return null;
  }
  return j;
}
