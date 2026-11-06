/**
 * OpenRouter selection of same-CITY peer SAP sites for Local Image reuse.
 * Step 1: resolve market city from place entity (Edmonton from Edmonton City Centre).
 * Step 2: return EVERY peer that operates in that city (not venue-specific).
 */

import type { WordPressSite } from "@/components/integrations/types";
import { getResearchModel } from "@/lib/optimization-settings-storage";
import { parseJsonObjectFromModelText } from "@/lib/openrouter-vision-chat";
import { postOpenRouterAppChatFetch } from "@/lib/openrouter-app-api";

export type SapPeerMarketPeerInput = Pick<
  WordPressSite,
  "id" | "name" | "siteUrl" | "productionSiteUrl" | "napInfo"
>;

type PeerPromptRow = {
  id: string;
  name: string;
  siteUrl: string;
  productionSiteUrl: string;
  napCities: string[];
  napAddresses: string[];
};

const selectionCache = new Map<string, string[]>();
const selectionInflight = new Map<string, Promise<string[]>>();
const cityCache = new Map<string, string>();

function normalizeKey(value: string): string {
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

function napCitiesFromSite(site: SapPeerMarketPeerInput): string[] {
  const out: string[] = [];
  for (const loc of site.napInfo?.locations ?? []) {
    const c = (loc.city || "").trim();
    if (c) out.push(c);
  }
  return out;
}

function napAddressesFromSite(site: SapPeerMarketPeerInput): string[] {
  const out: string[] = [];
  for (const loc of site.napInfo?.locations ?? []) {
    const a = (loc.address || "").trim();
    if (a) out.push(a);
  }
  const top = (site.napInfo?.address || "").trim();
  if (top) out.push(top);
  return out;
}

export function buildPeerMarketPromptRows(peers: SapPeerMarketPeerInput[]): PeerPromptRow[] {
  return peers.map((p) => ({
    id: p.id,
    name: (p.name || "").trim() || p.siteUrl,
    siteUrl: (p.siteUrl || "").trim(),
    productionSiteUrl: (p.productionSiteUrl || "").trim(),
    napCities: napCitiesFromSite(p),
    napAddresses: napAddressesFromSite(p),
  }));
}

export function peerMarketSelectionCacheKey(
  placeEntity: string,
  peers: SapPeerMarketPeerInput[],
): string {
  const entity = normalizeKey(placeEntity);
  const ids = peers
    .map((p) => p.id)
    .filter(Boolean)
    .sort()
    .join(",");
  return `${entity}||${ids}`;
}

/** Parse `{ "siteIds": string[] }` from model JSON; only allow known ids. */
export function parseSameMarketSiteIds(
  raw: Record<string, unknown>,
  allowedIds: Set<string>,
): string[] {
  const list = Array.isArray(raw.siteIds) ? raw.siteIds : [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of list) {
    const id = String(item ?? "").trim();
    if (!id || !allowedIds.has(id) || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

export function parseMarketCityFromModel(raw: Record<string, unknown>): string {
  const city = String(raw.city ?? "").trim();
  return city;
}

/**
 * Prefer write-site NAP city when it appears in the place entity
 * (Edmonton City Centre → Edmonton from write-site NAP).
 */
export function marketCityFromWriteSiteHints(
  placeEntity: string,
  writeSiteNapCities: string[],
): string {
  const entityKey = normalizeKey(placeEntity);
  if (!entityKey) return "";
  for (const city of writeSiteNapCities) {
    const cityKey = normalizeKey(city);
    if (!cityKey) continue;
    if (entityKey.includes(cityKey)) return city.trim();
  }
  return "";
}

/**
 * Peers in market city via NAP city, or name/url containing the city token.
 * Does not match on venue-only tokens (City Centre); uses the city (Edmonton).
 */
export function peersMatchingMarketCity(
  marketCity: string,
  peers: SapPeerMarketPeerInput[],
): SapPeerMarketPeerInput[] {
  const cityKey = normalizeKey(marketCity);
  if (!cityKey) return [];
  const out: SapPeerMarketPeerInput[] = [];
  for (const peer of peers) {
    let match = false;
    for (const city of napCitiesFromSite(peer)) {
      const peerCity = normalizeKey(city);
      if (!peerCity) continue;
      if (peerCity === cityKey || peerCity.includes(cityKey) || cityKey.includes(peerCity)) {
        match = true;
        break;
      }
    }
    if (!match) {
      const haystack = normalizeKey(
        [(peer.name || "").trim(), (peer.siteUrl || "").trim(), (peer.productionSiteUrl || "").trim()]
          .filter(Boolean)
          .join(" "),
      );
      if (haystack.includes(cityKey)) match = true;
    }
    if (match) out.push(peer);
  }
  return out;
}

/** @deprecated use peersMatchingMarketCity with resolved city */
export function peersMatchingPlaceEntityByNapCity(
  placeEntity: string,
  peers: SapPeerMarketPeerInput[],
): SapPeerMarketPeerInput[] {
  const entityKey = normalizeKey(placeEntity);
  if (!entityKey) return [];
  const out: SapPeerMarketPeerInput[] = [];
  for (const peer of peers) {
    const cities = napCitiesFromSite(peer);
    let match = false;
    for (const city of cities) {
      const cityKey = normalizeKey(city);
      if (!cityKey) continue;
      if (entityKey.includes(cityKey) || cityKey.includes(entityKey)) {
        match = true;
        break;
      }
    }
    if (match) out.push(peer);
  }
  return out;
}

async function openRouterResolveMarketCity(params: {
  apiKey: string;
  model: string;
  placeEntity: string;
  writeSiteNapCities: string[];
}): Promise<string> {
  const cached = cityCache.get(normalizeKey(params.placeEntity));
  if (cached) return cached;

  const system = [
    "Extract the CITY / metro market for a place entity.",
    'Return JSON only: {"city":"..."}.',
    "Rules:",
    "- Return the city name only (e.g. Edmonton), never the venue/mall/bridge alone.",
    "- Edmonton City Centre → Edmonton. Commerce Place (Edmonton) → Edmonton.",
    "- Walterdale Bridge Edmonton → Edmonton. Capilano Mall Edmonton → Edmonton.",
    "- Prefer write-site NAP cities when they appear in the place entity.",
  ].join(" ");

  const user = [
    `Place entity: ${params.placeEntity}`,
    `Write-site NAP cities: ${JSON.stringify(params.writeSiteNapCities)}`,
    'Return JSON: {"city":"Edmonton"}',
  ].join("\n");

  const response = await postOpenRouterAppChatFetch({
    method: "POST",
    body: JSON.stringify({
      model: params.model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      temperature: 0,
      max_tokens: 200,
      response_format: { type: "json_object" },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenRouter market city ${response.status}: ${errorText}`);
  }

  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = data.choices?.[0]?.message?.content;
  if (typeof content !== "string" || !content.trim()) {
    throw new Error("OpenRouter market city returned empty content");
  }
  const city = parseMarketCityFromModel(parseJsonObjectFromModelText(content));
  if (city) cityCache.set(normalizeKey(params.placeEntity), city);
  return city;
}

async function openRouterSameCityPeersJson(params: {
  apiKey: string;
  model: string;
  placeEntity: string;
  marketCity: string;
  peers: PeerPromptRow[];
}): Promise<Record<string, unknown>> {
  const system = [
    "You select WordPress portfolio sites that operate in ONE market city.",
    "Return JSON only: {\"siteIds\":[\"...\"]}.",
    "Rules:",
    "- Match on the MARKET CITY only (e.g. Edmonton), never the venue (City Centre, a mall, a bridge).",
    "- Include EVERY peer that operates in that city. Complete list. No peer cap. No top-N.",
    "- Prefer napCities/napAddresses when present.",
    "- When napCities is empty, still include peers whose name, siteUrl, or known market is that city.",
    "- Exclude peers clearly in a different city/region (e.g. Manitoba, Florida, Calgary when market is Edmonton).",
    "- Brand words like Phoenix follow NAP/city market, not the brand token alone.",
  ].join(" ");

  const user = [
    `Place entity (venue/place, ignore for matching except to confirm city): ${params.placeEntity}`,
    `Market city (REQUIRED match key): ${params.marketCity}`,
    "Peers:",
    JSON.stringify(params.peers),
    'Return JSON: {"siteIds":["id1","id2"]} — every peer in Market city.',
  ].join("\n");

  const response = await postOpenRouterAppChatFetch({
    method: "POST",
    body: JSON.stringify({
      model: params.model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      temperature: 0,
      max_tokens: 4000,
      response_format: { type: "json_object" },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenRouter same-city peers ${response.status}: ${errorText}`);
  }

  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = data.choices?.[0]?.message?.content;
  if (typeof content !== "string" || !content.trim()) {
    throw new Error("OpenRouter same-city peers returned empty content");
  }
  return parseJsonObjectFromModelText(content);
}

/**
 * Resolve market city for a place entity (Edmonton from Edmonton City Centre).
 * Uses write-site NAP only as a hint when that city string appears in the entity.
 * Does not select peers.
 */
export async function resolveMarketCityForPlaceEntity(params: {
  placeEntity: string;
  apiKey: string;
  model?: string;
  writeSite?: SapPeerMarketPeerInput | null;
}): Promise<string> {
  const placeEntity = (params.placeEntity || "").trim();
  if (!placeEntity || !params.apiKey?.trim()) return "";

  const writeSiteNapCities = params.writeSite ? napCitiesFromSite(params.writeSite) : [];
  const marketCity = marketCityFromWriteSiteHints(placeEntity, writeSiteNapCities);
  if (marketCity) return marketCity;

  const model = params.model?.trim() || getResearchModel();
  try {
    return await openRouterResolveMarketCity({
      apiKey: params.apiKey,
      model,
      placeEntity,
      writeSiteNapCities,
    });
  } catch (err) {
    // #region agent log
    // #endregion
    return "";
  }
}

/**
 * Select peer sites in the same CITY as placeEntity via OpenRouter (legacy).
 * Prefer inventory URL fuzzy-match in sap-cross-site-image-search for Local Image.
 */
export async function selectSameMarketPeerSites(params: {
  placeEntity: string;
  peers: WordPressSite[];
  apiKey: string;
  model?: string;
  /** Write site NAP cities used as market-city hints. */
  writeSite?: SapPeerMarketPeerInput | null;
}): Promise<WordPressSite[]> {
  const placeEntity = (params.placeEntity || "").trim();
  if (!placeEntity || !params.apiKey?.trim()) return [];

  const peers = (params.peers ?? []).filter((p) => Boolean(p?.id));
  if (!peers.length) return [];

  const cacheKey = peerMarketSelectionCacheKey(placeEntity, peers);
  const cached = selectionCache.get(cacheKey);
  if (cached) {
    const byId = new Map(peers.map((p) => [p.id, p]));
    return cached.map((id) => byId.get(id)).filter(Boolean) as WordPressSite[];
  }

  const inflight = selectionInflight.get(cacheKey);
  if (inflight) {
    const ids = await inflight;
    const byId = new Map(peers.map((p) => [p.id, p]));
    return ids.map((id) => byId.get(id)).filter(Boolean) as WordPressSite[];
  }

  const run = (async () => {
    const rows = buildPeerMarketPromptRows(peers);
    const allowed = new Set(peers.map((p) => p.id));
    const model = params.model?.trim() || getResearchModel();
    const peersWithNap = rows.filter((r) => r.napCities.length > 0).length;

    const marketCity = await resolveMarketCityForPlaceEntity({
      placeEntity,
      apiKey: params.apiKey,
      model,
      writeSite: params.writeSite,
    });

    // #region agent log
    // #endregion

    let raw: Record<string, unknown> = {};
    if (marketCity) {
      try {
        raw = await openRouterSameCityPeersJson({
          apiKey: params.apiKey,
          model,
          placeEntity,
          marketCity,
          peers: rows,
        });
      } catch (err) {
        // #region agent log
        // #endregion
        raw = {};
      }
    }

    let ids = parseSameMarketSiteIds(raw, allowed);
    const openRouterCount = ids.length;
    let source: "openrouter" | "city-overlap" = "openrouter";
    if (!ids.length && marketCity) {
      const cityMatched = peersMatchingMarketCity(marketCity, peers);
      ids = cityMatched.map((p) => p.id).filter((id) => allowed.has(id));
      source = "city-overlap";
    }

    // #region agent log
    // #endregion
    if (ids.length > 0) {
      selectionCache.set(cacheKey, ids);
    }
    return ids;
  })();

  selectionInflight.set(cacheKey, run);
  try {
    const ids = await run;
    const byId = new Map(peers.map((p) => [p.id, p]));
    return ids.map((id) => byId.get(id)).filter(Boolean) as WordPressSite[];
  } finally {
    selectionInflight.delete(cacheKey);
  }
}

export function clearSapPeerMarketSelectCache(): void {
  selectionCache.clear();
  selectionInflight.clear();
  cityCache.clear();
}
