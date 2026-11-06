/**
 * Bridge between the bulk generators and the peer featured image search.
 * Finds a peer featured image for a row, prefetches it as a data URL, and
 * size-gates/upscales it so the generator can use it as the row's imageFile.
 *
 * A peer hit whose prefetch fails THROWS (no silent fallback to Maps/AI).
 */

import type { WordPressSite } from "@/components/integrations/types";
import { backendApiUrl } from "@/lib/wordpress-api/connection";
import { neoPulseApiHeaders } from "@/lib/neo-pulse-api-headers";
import { prepareLocalImageDataUrl } from "@/lib/overview/overview-blog-local-image-generate";
import {
  searchPeerFeaturedImage,
  type PeerFeaturedImageMode,
  type PeerFeaturedLibraryCsvFile,
} from "@/lib/overview/sap-peer-featured-image-search";

export type PeerFeaturedImageForRow = {
  dataUrl: string;
  mimeType: string;
  fileName: string;
  sourceSiteName: string;
  sourceSiteUrl: string;
  sourcePageUrl: string;
  sourceImageUrl: string;
  matchedKeyword: string;
  score: number;
};

/** Slug for the reused image filename (no regex; keep letters/digits, dash the rest). */
function peerImageFileSlug(value: string): string {
  const raw = String(value ?? "").trim().toLowerCase();
  let out = "";
  let dash = false;
  for (let i = 0; i < raw.length; i += 1) {
    const ch = raw[i]!;
    const isAlnum = (ch >= "a" && ch <= "z") || (ch >= "0" && ch <= "9");
    if (isAlnum) {
      if (dash && out.length > 0) out += "-";
      dash = false;
      out += ch;
    } else {
      dash = true;
    }
  }
  return out.slice(0, 64) || "peer-featured";
}

async function fetchImageAsDataUrl(url: string): Promise<string> {
  const res = await fetch(backendApiUrl("/images/fetch-data-url"), {
    method: "POST",
    headers: neoPulseApiHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ url }),
  });
  const data = (await res.json().catch(() => ({}))) as {
    dataUrl?: string;
    error?: string;
  };
  if (!res.ok || typeof data.dataUrl !== "string" || !data.dataUrl.startsWith("data:image/")) {
    throw new Error((data.error || `image download failed (${res.status})`).trim());
  }
  return data.dataUrl;
}

/**
 * Look for a reusable featured image on peer sites for one generator row.
 * Returns null when no peer has a match (caller falls through to Maps/AI).
 */
export async function findPeerFeaturedImageForRow(params: {
  peerSites: WordPressSite[];
  targetSite: Pick<WordPressSite, "id" | "siteUrl" | "productionSiteUrl" | "napInfo" | "name">;
  mode: PeerFeaturedImageMode;
  /** Entity mode: SAP place entity. Blog mode: focus keyword. */
  matchKey: string;
  apiKey?: string;
  model?: string;
  onPeerCsvReady?: (file: PeerFeaturedLibraryCsvFile) => void;
  onProgress?: (message: string) => void;
}): Promise<PeerFeaturedImageForRow | null> {
  const matchKey = (params.matchKey || "").trim();
  if (!matchKey || !params.peerSites?.length) return null;

  params.onProgress?.(
    params.mode === "entity"
      ? `Searching peer SAP sites for a featured image of ${matchKey}...`
      : `Searching peer blogs for a featured image matching "${matchKey}"...`,
  );

  const { hit } = await searchPeerFeaturedImage({
    sites: params.peerSites,
    excludeSite: params.targetSite,
    mode: params.mode,
    placeEntity: params.mode === "entity" ? matchKey : undefined,
    keyword: params.mode === "blog" ? matchKey : undefined,
    apiKey: params.apiKey,
    model: params.model,
    onPeerCsvReady: params.onPeerCsvReady,
  });

  if (!hit) return null;

  params.onProgress?.(
    `Peer featured image found on ${hit.sourceSiteName} (${hit.sourcePageUrl}) - downloading...`,
  );

  // Peer hit is committed: prefetch/prepare failure throws (no Maps/AI fallback).
  const rawDataUrl = await fetchImageAsDataUrl(hit.imageUrl);
  const prepared = await prepareLocalImageDataUrl(rawDataUrl);

  return {
    dataUrl: prepared.dataUrl,
    mimeType: "image/jpeg",
    fileName: `${peerImageFileSlug(matchKey)}-peer-featured.jpg`,
    sourceSiteName: hit.sourceSiteName,
    sourceSiteUrl: hit.sourceSiteUrl,
    sourcePageUrl: hit.sourcePageUrl,
    sourceImageUrl: hit.imageUrl,
    matchedKeyword: hit.matchedKeyword,
    score: hit.score,
  };
}
